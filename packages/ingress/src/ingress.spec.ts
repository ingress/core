import ingress, { IngressApp } from './app.js'
import { compose } from 'app-builder'
import getPort from 'get-port'

const noop = compose((x, next) => next())

describe('ingress', () => {
  let app: IngressApp

  beforeEach(() => (app = ingress().use(noop)))

  afterEach(async () => {
    try {
      app && (await app.stop())
    } catch (e) {
      void e
    }
  })

  it('should not allow calling listen concurrently', async () => {
    const PORT = await getPort(),
      callToListen = app.listen({ port: PORT })
    let error: any
    try {
      await app.listen(PORT)
    } catch (e) {
      error = e
    }
    await callToListen
    expect(error.message).toEqual('Already started or starting')
    await app.stop()
  })
  it('should not allow calling close concurrently', async () => {
    const PORT = await getPort()
    await app.listen(PORT)
    let error: any
    app.stop()
    try {
      await app.stop()
    } catch (e) {
      error = e
    }
    expect(error.message).toEqual('Already stopped or stopping')
  })

  it('should listen', async () => {
    const PORT = await getPort()
    await app.listen(PORT)
  })

  it('should close', async () => {
    const PORT = await getPort()
    await app.listen(PORT)
    let error: any
    try {
      await app.stop()
    } catch (e) {
      error = e
    }
    expect(error).toBeUndefined()
  })
})
