import {
  ReflectiveInjector,
  Injector,
  Injectable,
  InjectionToken,
  Provider,
  ResolvedReflectiveProvider,
  ResolvedReflectiveFactory,
  ReflectiveKey,
} from 'injection-js'

import { Type, DependencyCollectorList, DependencyCollector } from './collector'

export * from './collector'
export { ReflectiveInjector, Injector, Provider, Injectable }

/**
 * @public
 */
export interface ContainerContext {
  scope: Injector
}

/**
 * @public
 */
export interface ContainerOptions {
  contextToken?: Record<string, any>
  singletons?: Provider[]
  services?: Provider[]
}

const EMPTY_DEPS: Array<any> = [],
  ContextToken = new InjectionToken('ingress.context') as any

export { ContextToken }

/**
 * @public
 */
export class Container<T extends ContainerContext = ContainerContext> implements Injector {
  private rootInjector: ReflectiveInjector | undefined
  private resolvedChildProviders: ResolvedReflectiveProvider[] = []
  private ResolvedContextProvider: Type<ResolvedReflectiveProvider>

  public singletonCollector = new DependencyCollectorList()
  public serviceCollector = new DependencyCollectorList()
  public ContextToken = ContextToken
  public singletons: Provider[] = []
  public services: Provider[] = []

  public get SingletonService(): DependencyCollector {
    return this.singletonCollector.collect
  }
  public get Service(): DependencyCollector {
    return this.serviceCollector.collect
  }

  constructor({ singletons = [], services = [], contextToken = ContextToken }: ContainerOptions = {}) {
    Object.assign(this, { singletons, services })
    const key = ReflectiveKey.get(contextToken)
    this.ResolvedContextProvider = class<T> implements ResolvedReflectiveProvider {
      public key = key
      public resolvedFactories: ResolvedReflectiveFactory[]
      public multiProvider = false
      constructor(value: T) {
        this.resolvedFactories = [
          {
            factory() {
              return value
            },
            dependencies: EMPTY_DEPS,
          },
        ]
      }
      get resolvedFactory() {
        return this.resolvedFactories[0]
      }
    }
  }

  public get<T = any>(token: Type<T> | InjectionToken<T>, notFoundValue?: T): T {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return this.rootInjector!.get(token, notFoundValue)
  }

  private createChild(...providers: Array<ResolvedReflectiveProvider>): Injector {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return this.rootInjector!.createChildFromResolved(this.resolvedChildProviders.concat(providers))
  }

  public resolveProviders(): void {
    this.start()
  }

  public start(): void {
    this.singletons = Array.from(new Set([...this.singletons, ...this.singletonCollector.items]))
    this.services = Array.from(new Set([...this.services, ...this.serviceCollector.items]))
    this.rootInjector = ReflectiveInjector.resolveAndCreate(this.singletons)
    this.resolvedChildProviders = ReflectiveInjector.resolve(this.services)
  }

  get middleware() {
    return (context: T, next: () => any): Promise<any> => {
      context.scope = this.createChild(new this.ResolvedContextProvider(context))
      return next()
    }
  }
}

/**
 * @public
 * @param options
 */
export default function createContainer<T extends ContainerContext = ContainerContext>(
  options: ContainerOptions
): Container<T> {
  return new Container<T>(options)
}
