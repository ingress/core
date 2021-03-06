declare module '@hapi/subtext' {
  import { IncomingMessage } from 'http'
  interface SubtextOptions {
    parse: boolean
    output: 'data' | 'stream' | 'file'
    maxBytes?: number
    override?: string
    defaultContentType?: string
    allow?: string
    timeout?: number
    qs?: Record<string, any>
    uploads?: string
    decoders?: { [key: string]: (...args: any[]) => any }
    compression?: { [key: string]: (...args: any[]) => any }
  }
  function parse(
    request: IncomingMessage,
    something: null,
    options: SubtextOptions
  ): Promise<{ payload: any; mime: any }>
  export { parse, SubtextOptions }
}
