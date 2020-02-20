export const Type = Function
export interface Type<T> {
  new (...args: any[]): T
}
import { Route } from './route-annotation'

export interface ControllerOptions {
  routePrefix?: string
}

export interface Controller {
  (options?: ControllerOptions | string): ClassDecorator
}

export type ControllerDependencyCollector = Controller & ClassDecorator

export class ControllerCollector {
  public items: Array<Type<any>> = []
  public collect: ControllerDependencyCollector
  private _collector: ClassDecorator
  constructor() {
    this._collector = (target: any) => {
      if (!this.items.includes(target)) {
        this.items.push(target)
      }
    }
    this.collect = ((options?: ControllerOptions | any) => {
      if (!options) {
        return this._collector
      }
      const routePrefix: string = (typeof options === 'string' && options) || options.routePrefix
      if (routePrefix) {
        return ((target: any) => {
          Route(routePrefix)(target)
          this._collector(target)
        }) as ClassDecorator
      }
      return this._collector(options) as ClassDecorator
    }) as ControllerDependencyCollector
  }
}
