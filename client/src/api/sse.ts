/**
 * SSE (Server-Sent Events) connection manager.
 *
 * Connects to the backend SSE endpoint, parses events, and dispatches
 * them to registered handlers.  Supports automatic reconnection with
 * exponential backoff.
 */

import type {
  SSEStatusChangeData,
  SSERoundChangeData,
  SSEMessageData,
  SSEMessageCompleteData,
  SSEConsensusNewData,
  SSESummaryNewData,
  SSEErrorData,
} from "../types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SSEEventHandler = {
  onStatusChange?: (data: SSEStatusChangeData) => void;
  onRoundChange?: (data: SSERoundChangeData) => void;
  onMessage?: (data: SSEMessageData) => void;
  onMessageComplete?: (data: SSEMessageCompleteData) => void;
  onConsensusNew?: (data: SSEConsensusNewData) => void;
  onSummaryNew?: (data: SSESummaryNewData) => void;
  onError?: (data: SSEErrorData) => void;
  onConnectionChange?: (connected: boolean) => void;
};

// ---------------------------------------------------------------------------
// SSE Connection
// ---------------------------------------------------------------------------

const DEFAULT_RECONNECT_BASE_MS = 1000;
const DEFAULT_RECONNECT_MAX_MS = 30000;

export class SSEConnection {
  private es: EventSource | null = null;
  private url: string;
  private handlers: SSEEventHandler[] = [];
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private reconnectBaseMs: number;
  private reconnectMaxMs: number;
  private _intentionalClose = false;

  constructor(
    discussionId: string,
    options: {
      reconnectBaseMs?: number;
      reconnectMaxMs?: number;
    } = {}
  ) {
    this.url = `/api/discussions/${discussionId}/events`;
    this.reconnectBaseMs = options.reconnectBaseMs ?? DEFAULT_RECONNECT_BASE_MS;
    this.reconnectMaxMs = options.reconnectMaxMs ?? DEFAULT_RECONNECT_MAX_MS;
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /** Register an event handler. Returns an unsubscribe function. */
  on(handler: SSEEventHandler): () => void {
    this.handlers.push(handler);
    return () => {
      this.handlers = this.handlers.filter((h) => h !== handler);
    };
  }

  /** Open the SSE connection. */
  connect(): void {
    if (this.es) return;
    this._intentionalClose = false;
    this.reconnectAttempt = 0;
    this._openConnection();
  }

  /** Close the SSE connection permanently. */
  disconnect(): void {
    this._intentionalClose = true;
    this._cleanup();
    this.notifyConnectionChange(false);
  }

  /** Whether the connection is currently open. */
  get isConnected(): boolean {
    return this.es?.readyState === EventSource.OPEN;
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  private _openConnection(): void {
    this._cleanup();

    try {
      this.es = new EventSource(this.url);
    } catch {
      // EventSource constructor can throw in some environments
      this._scheduleReconnect();
      return;
    }

    this.es.onopen = () => {
      this.reconnectAttempt = 0;
      this.notifyConnectionChange(true);
    };

    this.es.onerror = () => {
      // EventSource auto-reconnects on some errors;
      // if it closes permanently we handle it
      if (this.es?.readyState === EventSource.CLOSED) {
        this.notifyConnectionChange(false);
        if (!this._intentionalClose) {
          this._scheduleReconnect();
        }
      }
    };

    // ---- Named event listeners ----

    this.es.addEventListener("status_change", (e: Event) => {
      const msg = e as MessageEvent;
      const data = safeParse<SSEStatusChangeData>(msg.data);
      if (data) this.handlers.forEach((h) => h.onStatusChange?.(data));
    });

    this.es.addEventListener("round_change", (e: Event) => {
      const msg = e as MessageEvent;
      const data = safeParse<SSERoundChangeData>(msg.data);
      if (data) this.handlers.forEach((h) => h.onRoundChange?.(data));
    });

    this.es.addEventListener("message", (e: Event) => {
      const msg = e as MessageEvent;
      const data = safeParse<SSEMessageData>(msg.data);
      if (data) this.handlers.forEach((h) => h.onMessage?.(data));
    });

    this.es.addEventListener("message_complete", (e: Event) => {
      const msg = e as MessageEvent;
      const data = safeParse<SSEMessageCompleteData>(msg.data);
      if (data) this.handlers.forEach((h) => h.onMessageComplete?.(data));
    });

    this.es.addEventListener("consensus_new", (e: Event) => {
      const msg = e as MessageEvent;
      const data = safeParse<SSEConsensusNewData>(msg.data);
      if (data) this.handlers.forEach((h) => h.onConsensusNew?.(data));
    });

    this.es.addEventListener("summary_new", (e: Event) => {
      const msg = e as MessageEvent;
      const data = safeParse<SSESummaryNewData>(msg.data);
      if (data) this.handlers.forEach((h) => h.onSummaryNew?.(data));
    });

    this.es.addEventListener("error", (e: Event) => {
      const msg = e as MessageEvent;
      const data = safeParse<SSEErrorData>(msg.data);
      if (data) this.handlers.forEach((h) => h.onError?.(data));
    });

    // ---- Fallback: untyped events arrive as "message" ----
    this.es.onmessage = (e: MessageEvent) => {
      // If the event has no `type` field, try to parse and dispatch generically
      const raw = safeParse<Record<string, unknown>>(e.data);
      if (!raw) return;
      // Already handled by named listeners above — skip to avoid double-dispatch
    };
  }

  private _scheduleReconnect(): void {
    if (this._intentionalClose) return;

    const delay = Math.min(
      this.reconnectBaseMs * Math.pow(2, this.reconnectAttempt),
      this.reconnectMaxMs
    );
    this.reconnectAttempt++;

    this.reconnectTimeout = setTimeout(() => {
      this._openConnection();
    }, delay);
  }

  private _cleanup(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.es) {
      this.es.close();
      this.es = null;
    }
  }

  private notifyConnectionChange(connected: boolean): void {
    this.handlers.forEach((h) => h.onConnectionChange?.(connected));
  }
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function safeParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
