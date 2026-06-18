import { createDeferred, type Deferred } from './utils'

interface JsonRpcResponse {
  id: string
  result?: unknown
  error?: { code?: number; message?: string }
}

export class WebSocketRPCClient {
  private url: string
  private ws: WebSocket | null = null
  private pending = new Map<string, Deferred>()
  private connectPromise: Promise<void> | null = null
  private forcedClose = false

  constructor(url: string) {
    this.url = url
  }

  connect(): Promise<void> {
    if (this.connectPromise) return this.connectPromise

    this.connectPromise = new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(this.url)
      this.ws = ws

      ws.onopen = () => {
        resolve()
      }

      ws.onmessage = (e) => {
        try {
          const data: JsonRpcResponse = JSON.parse(String(e.data))
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

      ws.onerror = () => {
        reject(new Error('WebSocket connection failed'))
      }

      ws.onclose = () => {
        this.connectPromise = null
        if (!this.forcedClose) {
          // Auto reconnect after 2s
          setTimeout(() => this.connect(), 2000)
        }
        // Reject all pending requests
        for (const [, deferred] of this.pending) {
          deferred.reject(new Error('WebSocket closed'))
        }
        this.pending.clear()
      }
    })

    return this.connectPromise
  }

  async rpc<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    await this.connect()

    const id = crypto.randomUUID()
    const deferred = createDeferred<T>()
    this.pending.set(id, deferred as Deferred)

    this.ws!.send(JSON.stringify({
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
