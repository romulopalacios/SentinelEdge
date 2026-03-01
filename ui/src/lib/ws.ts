import type { WsMessage } from "@/types";

type WsHandler<T = unknown> = (msg: WsMessage<T>) => void;

// ── WebSocket Manager — singleton with reconnect ─────────────────────────────

class WebSocketManager {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<WsHandler>>();
  private retryDelay = 1_000;
  private maxDelay   = 30_000;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private shouldRetry = false;
  private url = "";

  connect(url?: string) {
    if (url) this.url = url;
    if (!this.url) return;

    this.shouldRetry = true;
    this.retryDelay  = 1_000;
    this._open();
  }

  disconnect() {
    this.shouldRetry = false;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.ws?.close();
    this.ws = null;
  }

  on<T = unknown>(type: string, handler: WsHandler<T>) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type)!.add(handler as WsHandler);
  }

  off<T = unknown>(type: string, handler: WsHandler<T>) {
    this.handlers.get(type)?.delete(handler as WsHandler);
  }

  private _open() {
    try {
      const token = localStorage.getItem("access_token");
      const wsUrl = token ? `${this.url}?token=${token}` : this.url;

      this.ws = new WebSocket(wsUrl);

      this.ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data) as WsMessage;
          const set = this.handlers.get(msg.type);
          set?.forEach((h) => h(msg));
          // also fire wildcard handlers
          this.handlers.get("*")?.forEach((h) => h(msg));
        } catch {/* ignore parse errors */}
      };

      this.ws.onclose = () => {
        this.ws = null;
        if (this.shouldRetry) this._scheduleRetry();
      };

      this.ws.onerror = () => { this.ws?.close(); };
    } catch {
      if (this.shouldRetry) this._scheduleRetry();
    }
  }

  private _scheduleRetry() {
    this.retryTimer = setTimeout(() => {
      this.retryDelay = Math.min(this.retryDelay * 1.5, this.maxDelay);
      this._open();
    }, this.retryDelay);
  }

  get readyState(): number {
    return this.ws?.readyState ?? WebSocket.CLOSED;
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

export const wsManager = new WebSocketManager();
