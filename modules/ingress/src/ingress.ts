import { AppBuilder, Middleware, ContinuationMiddleware } from 'app-builder'
import { BaseContext, DefaultContext, BaseAuthContext, Type } from './context.js'
import { Annotation, isAnnotationFactory } from 'reflect-annotations'
import { Server as HttpServer, IncomingMessage, ServerResponse } from 'http'
import { Func } from './lang.js'
import { Container } from './app.js'

function isMiddlewareFunction(value: any): value is Func {
  return typeof value === 'function' && value.toString().indexOf('class') !== 0
}

type HttpHandler = (req: IncomingMessage, res: ServerResponse) => any

export enum AppState {
  New = 0,
  Starting = 1,
  Started = 2,
  Stopping = 3,
  Stopped = 4,
}

/**
 * @public
 */
export class Ingress<
  T extends BaseContext<T, A> = DefaultContext,
  A extends BaseAuthContext = BaseAuthContext
> {
  private appBuilder = new AppBuilder<T>()
  public state: AppState = AppState.Stopped
  private setups: SetupTeardown[] = []
  private teardowns: SetupTeardown[] = []
  public server?: HttpServer
  private _handler?: HttpHandler

  constructor(options?: { server?: HttpServer }) {
    if (options?.server) {
      this.server = options.server
    }
  }

  get handler(): HttpHandler {
    if (this._handler) {
      return this._handler
    }
    const mw = this.middleware
    return (this._handler = (req, res) => mw(this.createContext(req, res)))
  }

  use(usable: Addon<T>): this {
    if (this.state === AppState.Started) {
      throw new Error('App Started already - Cannot use something on a started app')
    }
    let used = false
    if ('forwardRef' in usable) {
      return this.use(usableForwardRef(usable.forwardRef))
    }
    if ('annotationInstance' in usable) {
      return this.use(usable.annotationInstance)
    }
    if ('middleware' in usable) {
      const mw = usable.middleware
      mw && this.use(mw)
      used = true
    }
    if ('start' in usable && 'function' === typeof usable.start) {
      this.setups.push(usable.start.bind(usable))
      usable.stop && this.teardowns.push(usable.stop.bind(usable))
      used = true
    }
    if (isMiddlewareFunction(usable)) {
      if (usable.length < 2) {
        throw new TypeError('middleware function must have at least an arity of two')
      }
      this.appBuilder.use(usable)
      used = true
    }
    if (isAnnotationFactory(usable)) {
      return this.use(usable().annotationInstance)
    }
    if (!used) {
      throw new TypeError('ingress was unable to use: ' + usable)
    }
    return this
  }

  public createContext(req: IncomingMessage, res: ServerResponse): T {
    const context = new DefaultContext(req, res) as any
    context.app = this
    return context
  }

  get middleware(): ContinuationMiddleware<T> {
    return this.appBuilder.build()
  }

  public async start(app?: Ingress): Promise<void> {
    if (this.state === AppState.Starting || this.state === AppState.Started) {
      throw new Error('Already started or starting')
    }
    if (!this.server && app && app.server) {
      this.server = app.server
    }
    this.state = AppState.Starting
    for (const setup of this.setups) {
      await Promise.resolve(setup(this))
    }
    this.state = AppState.Started
  }
  public close(): Promise<any> {
    return this.stop()
  }

  public async stop(): Promise<void> {
    if ([AppState.Stopped, AppState.Stopping, AppState.New].includes(this.state)) {
      throw new Error('Already stopped or stopping')
    }
    this.state = AppState.Stopping
    try {
      for (const teardown of this.teardowns) {
        await Promise.resolve(teardown(this))
      }
    } finally {
      this.state = AppState.Stopped
    }
  }

  public async listen(options?: ListenOptions | number): Promise<any> {
    if (!this.server) {
      this.server = new HttpServer()
    }
    await this.start()
    this.state = AppState.Starting
    try {
      this.server?.on('request', this.handler)
      await new Promise<void>((resolve, reject) => {
        this.server?.listen(options, (error?: Error) => (error ? reject(error) : resolve()))
      })
      this.teardowns.unshift((app) => {
        return new Promise<void>((resolve, reject) => {
          app.server?.off('request', this.handler)
          app.server?.close((error?: Error) => (error ? reject(error) : resolve()))
        })
      })
    } finally {
      this.state = AppState.Started
    }
    return this.server.address()
  }
}

/**
 * @public
 */
export interface SetupTeardown {
  (server: Ingress<any>): Promise<any> | any
}
/**
 * @public
 */
export interface Usable<T> {
  start?: SetupTeardown
  stop?: SetupTeardown
  middleware?: Middleware<T>
}

/**
 * @public
 */
export type Addon<T> = (
  | Annotation<Usable<T>>
  | Usable<T>
  | (Usable<T> & Middleware<T>)
  | { forwardRef?: Type<any> }
) &
  Record<string, any>
/**
 * @public
 */
export interface ListenOptions {
  port?: number
  host?: string
  path?: string
  backlog?: number
  exclusive?: boolean
  readableAll?: boolean
  writableAll?: boolean
}

/**
 * @public
 * A wrapper to bind a singleton dependency that has not been created yet, to the lifecycle of the application.
 * This method implies that the reference to an instance to be used is not yet available but will be available via the container at runtime.
 *
 * For example, database or cache connection management that has setup/teardown and middleware that manages transaction or inflight requests.
 * This pattern avoids the need to "new" up and "initialize" a dependency at app start time and instead lets the IoC Container handle it.
 */
export function usableForwardRef(ref: Type<any>): any {
  let middlewareRef: null | Middleware<any> | false = null
  return {
    get middleware() {
      return (context: DefaultContext, next: Func<Promise<void>>) => {
        if (middlewareRef === false) {
          return next()
        }
        if (!middlewareRef) {
          middlewareRef = context.scope.get(ref).middleware
        }
        if (middlewareRef) {
          return middlewareRef(context, next)
        }
        middlewareRef = false
        return next()
      }
    },
    start(app: { container: Container }): Promise<any> {
      return Promise.resolve((app.container.get(ref) as any).start(app))
    },
    stop(app: { container: Container }): Promise<any> {
      return Promise.resolve((app.container.get(ref) as any).stop(app))
    },
  }
}
