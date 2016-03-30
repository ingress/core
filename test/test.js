import { expect } from 'chai'
import { Server, Context, HttpServer }  from '../src/server'
import http from 'http'
import statuses from 'statuses'

const port = 8888;

function makeRequest (path) {
  return new Promise((res,rej) =>
    http.get(`http://localhost:${ port }${ path }` + path, res).on('error', rej)
  )
}

function getResponse (res) {
  return new Promise(function (resolve, reject) {
    let data = ''
    res.on('data', chunk => data = data + chunk)
    res.on('end', () => resolve(data))
  })
}

describe('Server', () => {

  let server
  beforeEach(() => {
    server = new Server
    server.use((ctx, next) => next())
  })

  afterEach(() => {
    return server.close()
  })

  describe('listen', () => {
    it('returns a promise, creates a server', async () => {
      await server.listen(port)
      expect(server.webserver).to.be.an.instanceOf(HttpServer)
    })

    it('sets argument to a Context instance', async () => {
      let hasBeenCalled = false
      server.use(env => {
        expect(env).to.be.an.instanceOf(Context)
        hasBeenCalled = true
        env.res.end()
      })
      await server.listen(port)
      await makeRequest('/')
      expect(hasBeenCalled).to.be.true
    })
  })

  describe('close', () => {
    it('calls close on underlying webserver implementation', () => {
      let called
      const close = server.webserver.close
      server.webserver.close = function (){
        called = true
        return close.call(this)
      }
      server.close()
      expect(called).to.be.true
    })
  })

  describe('useDefault', () => {

    beforeEach(() => {
      server.useDefault()
    })

    it('should respond with json, when set on context body', async () => {
      let length
      server.use((ctx, next) => {
        ctx.body = {plain:'object'}
        length = JSON.stringify(ctx.body).length
        return next()
      })
      await server.listen(port)
      const res = await makeRequest('/')
      expect(+res.headers['content-length']).to.equal(length)
      expect(res.headers['content-type']).to.equal('application/json')
    })

    it('should respond with octet-stream, when buffer is set on context body', async () => {
      let length
      server.use((ctx, next) => {
        ctx.body = new Buffer(JSON.stringify({plain:'object'}))
        length = ctx.body.length
        return next()
      })
      await server.listen(port)
      const res = await makeRequest('/')
      expect(+res.headers['content-length']).to.equal(length)
      expect(res.headers['content-type']).to.equal('application/octet-stream')
    })

    it('should respond with html, when set on context body', async () => {
      let length
      server.use((ctx, next) => {
        ctx.body = '<div>I\'m HTML!</div>'
        length = ctx.body.length
        return next()
      })
      await server.listen(port)
      const res = await makeRequest('/')
      expect(+res.headers['content-length']).to.equal(length)
      expect(res.headers['content-type']).to.equal('text/html')
    })

    it('should respond with text, when set on context body', async () => {
      let length
      server.use((ctx, next) => {
        ctx.body = 'just text'
        length = ctx.body.length
        return next()
      })
      await server.listen(port)
      const res = await makeRequest('/')
      expect(+res.headers['content-length']).to.equal(length)
      expect(res.headers['content-type']).to.equal('text/plain')
    })

    it('should not respond when the request has already been handled', async () => {
      let length
      server.use((ctx, next) => {
        const text = 'ended!'
        length = text.length
        ctx.res.end(text)
        return next()
      })
      await server.listen(port)
      const res = await makeRequest('/')
      expect(+res.headers['content-length']).to.equal(length)
      expect(res.headers['content-type']).to.be.undefined
    })

    it('should respond 404 when no body is set', async () => {
      server.use((ctx, next) => {
        return next()
      })
      await server.listen(port)
      const res = await makeRequest('/')
      expect(res.statusCode).to.equal(404)
      const response = await getResponse(res)
      expect(response).to.equal('Not Found')
    })

    it('should respond 500 when error is set', async () => {
      server.use((ctx, next) => {
        ctx.error = true
        return next()
      })
      await server.listen(port)
      const res = await makeRequest('/')

      expect(res.statusCode).to.equal(500)
      expect(await getResponse(res)).to.equal(statuses[500])
    })

    it('should respond 500 with a body when set', async () => {
      const expectedBody = 'some error stack or something'

      server.use((ctx, next) => {
        ctx.error = true
        ctx.body = expectedBody
        return next()
      })
      await server.listen(port)
      const res = await makeRequest('/')

      expect(res.statusCode).to.equal(500)
      expect(await getResponse(res)).to.equal(expectedBody)
    })

    it('strip the headers on an empty response (code)', async () => {
      server.use((ctx, next) => {
        ctx.res.setHeader('DeleteMe', 'key:value')
        ctx.res.statusCode = 204
        return next()
      })
      await server.listen(port)
      const res = await makeRequest('/')
      expect(Object.keys(res.headers)).to.eql(['date', 'connection'])
      expect(res.statusCode).to.equal(204)
    })
  })
})
