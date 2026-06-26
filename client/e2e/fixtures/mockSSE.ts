/**
 * mockSSE.ts
 *
 * Simulates an SSE (Server-Sent Events) stream in Playwright tests.
 *
 * Rather than running a real HTTP SSE endpoint, we inject a script into the
 * page that intercepts the EventSource constructor and dispatches pre-defined
 * events with controlled timing — giving us deterministic, repeatable tests.
 *
 * Usage:
 *   await setupMockSSE(page, discussionId, sseEvents, { interEventDelay: 300 });
 */

import type { Page } from "@playwright/test";
import type { SSEEvent } from "./mockData.js";

// ---------------------------------------------------------------------------
// Expose a global that the SSE injector script can communicate through
// ---------------------------------------------------------------------------

export interface SSEControlOptions {
  /** Milliseconds between consecutive events (default 200) */
  interEventDelay?: number;
  /** If true, simulate a disconnection after N events then reconnect */
  simulateDisconnect?: boolean;
  /** Number of events after which to disconnect */
  disconnectAfter?: number;
  /** Milliseconds before reconnecting */
  reconnectDelay?: number;
}

/**
 * Inject a script that replaces the native EventSource with a mock
 * that dispatches the given events with controlled timing.
 */
export async function setupMockSSE(
  page: Page,
  discussionId: string,
  events: SSEEvent[],
  options: SSEControlOptions = {}
) {
  const {
    interEventDelay = 200,
    simulateDisconnect = false,
    disconnectAfter = 999,
    reconnectDelay = 1500,
  } = options;

  // Serialize events as JSON
  const eventsJson = JSON.stringify(events);

  await page.evaluate(
    ({ evts, opts }) => {
      const { interEventDelay, simulateDisconnect, disconnectAfter, reconnectDelay } = opts;

      // Store the original EventSource
      const _OriginalEventSource = (window as unknown as Record<string, unknown>).EventSource;

      // Create mock EventSource class
      class MockEventSource {
        url: string;
        readyState: number;
        onopen: ((ev: Event) => void) | null = null;
        onmessage: ((ev: MessageEvent) => void) | null = null;
        onerror: ((ev: Event) => void) | null = null;
        private listeners: Map<string, Array<(ev: Event) => void>> = new Map();
        private eventIndex = 0;
        private timer: ReturnType<typeof setTimeout> | null = null;
        private closed = false;

        static CONNECTING = 0;
        static OPEN = 1;
        static CLOSED = 2;

        constructor(url: string) {
          this.url = url;
          this.readyState = MockEventSource.CONNECTING;

          // Simulate async connection
          setTimeout(() => {
            if (this.closed) return;
            this.readyState = MockEventSource.OPEN;
            this.onopen?.(new Event("open"));
            this.dispatchEvent(new Event("open"));
            this.startDispatching();
          }, 50);
        }

        private startDispatching() {
          const dispatchNext = () => {
            if (this.closed) return;

            if (this.eventIndex >= evts.length) {
              // All events dispatched — close stream
              this.readyState = MockEventSource.CLOSED;
              return;
            }

            // Simulate disconnect
            if (simulateDisconnect && this.eventIndex === disconnectAfter) {
              this.readyState = MockEventSource.CLOSED;
              this.onerror?.(new Event("error"));
              this.dispatchEvent(new Event("error"));

              // Auto-reconnect after delay
              setTimeout(() => {
                if (this.closed) return;
                this.readyState = MockEventSource.CONNECTING;
                setTimeout(() => {
                  if (this.closed) return;
                  this.readyState = MockEventSource.OPEN;
                  this.onopen?.(new Event("open"));
                  this.dispatchEvent(new Event("open"));
                  // Resume from where we left off
                  this.startDispatching();
                }, 50);
              }, reconnectDelay);
              return;
            }

            const { event, data } = evts[this.eventIndex];
            this.eventIndex++;

            // Build MessageEvent
            const msg = new MessageEvent(event || "message", {
              data: typeof data === "string" ? data : JSON.stringify(data),
              lastEventId: String(this.eventIndex),
              origin: "http://localhost:5173",
            });

            // Dispatch to specific event handler
            if (event && this.listeners.has(event)) {
              this.listeners.get(event)!.forEach((fn) => fn(msg));
            }

            // Always dispatch to onmessage
            this.onmessage?.(msg);
            this.dispatchEvent(msg);

            // Schedule next event
            this.timer = setTimeout(dispatchNext, interEventDelay);
          };

          this.timer = setTimeout(dispatchNext, interEventDelay);
        }

        addEventListener(type: string, listener: (ev: Event) => void) {
          if (!this.listeners.has(type)) this.listeners.set(type, []);
          this.listeners.get(type)!.push(listener);
        }

        removeEventListener(type: string, listener: (ev: Event) => void) {
          const arr = this.listeners.get(type);
          if (arr) {
            const idx = arr.indexOf(listener);
            if (idx >= 0) arr.splice(idx, 1);
          }
        }

        dispatchEvent(event: Event): boolean {
          // Invoke on* handlers
          return true;
        }

        close() {
          this.closed = true;
          this.readyState = MockEventSource.CLOSED;
          if (this.timer) clearTimeout(this.timer);
        }
      }

      // Override global EventSource
      (window as unknown as Record<string, unknown>).EventSource =
        MockEventSource as unknown as typeof EventSource;
    },
    { evts: events, opts: { interEventDelay, simulateDisconnect, disconnectAfter, reconnectDelay } }
  );
}

/**
 * Advance time by the specified milliseconds — useful for "fast-forwarding"
 * through SSE event sequences without waiting in real time.
 */
export async function advanceTime(page: Page, ms: number) {
  await page.evaluate((delay) => {
    return new Promise((resolve) => setTimeout(resolve, delay));
  }, ms);
}

/**
 * Wait for the SSE stream to have dispatched at least `minEventCount` events.
 */
export async function waitForSSEEvents(
  page: Page,
  minEventCount: number,
  options: { timeout?: number; interEventDelay?: number } = {}
) {
  const { timeout = 30_000, interEventDelay = 200 } = options;
  const estimatedMs = minEventCount * interEventDelay + 500;
  await page.waitForTimeout(Math.min(estimatedMs, timeout));
}
