import { createDeferred } from './utils'

export class WebSocketRPCClient {
  constructor(url) {
    this.url = url
    this.ws = null
    this.pending = new Map()
    this.connectPromise = null
    this.forcedClose = false
  }

  connect() {
    if (this.connectPromise) return this.connectPromise

    this.connectPromise = new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url)
      this.ws = ws

      ws.onopen = () => resolve()

      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(String(e.data))
          const deferred = this.pending.get(data.id)
          if (deferred) {
            this.pending.delete(data.id)
            if (data.error) {
              deferred.reject(new Error(data.error.message || 'RPC error'))
            } else {
              deferred.resolve(data.result)
            }
          }
        } catch {
          // ignore parse errors
        }
      }

      ws.onerror = () => reject(new Error('WebSocket connection failed'))

      ws.onclose = () => {
        this.connectPromise = null
        if (!this.forcedClose) {
          setTimeout(() => this.connect(), 2000)
        }
        for (const [, deferred] of this.pending) {
          deferred.reject(new Error('WebSocket closed'))
        }
        this.pending.clear()
      }
    })

    return this.connectPromise
  }

  async rpc(method, params = {}) {
    await this.connect()

    const id = crypto.randomUUID()
    const deferred = createDeferred()
    this.pending.set(id, deferred)

    this.ws.send(JSON.stringify({
      jsonrpc: '2.0',
      method,
      params,
      id,
    }))

    return deferred.promise
  }

  close() {
    this.forcedClose = true
    this.ws?.close()
    this.ws = null
    this.connectPromise = null
  }
}
