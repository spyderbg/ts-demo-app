import type { ServerResponse } from 'node:http';

export const PAGE_CLOSE_GRACE_MS = 2_000;

/** Keep the app alive while a browser page holds a connection to it. */
export class PageLifetime {
  private connections = new Set<ServerResponse>();
  private shutdownTimer?: ReturnType<typeof setTimeout>;
  private disposed = false;

  constructor(private onLastPageClose: () => void, private graceMs = PAGE_CLOSE_GRACE_MS) {}

  get count() { return this.connections.size; }

  connect(response: ServerResponse) {
    if (this.disposed) { response.end(); return; }
    clearTimeout(this.shutdownTimer);
    this.shutdownTimer = undefined;
    this.connections.add(response);
    response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      'X-Content-Type-Options': 'nosniff',
      'Cross-Origin-Resource-Policy': 'same-origin',
    });
    response.write('event: connected\ndata: {}\n\n');
    // Browser timers can be throttled in background tabs; keepalive is server-side.
    const keepalive = setInterval(() => response.write(': keepalive\n\n'), 15_000);
    keepalive.unref();
    response.once('close', () => {
      clearInterval(keepalive);
      this.connections.delete(response);
      if (!this.disposed && this.connections.size === 0) {
        this.shutdownTimer = setTimeout(() => {
          this.shutdownTimer = undefined;
          if (!this.disposed && this.connections.size === 0) this.onLastPageClose();
        }, this.graceMs);
      }
    });
  }

  dispose() {
    this.disposed = true;
    clearTimeout(this.shutdownTimer);
    // Finish long-lived responses before Fastify waits for requests to drain.
    for (const response of this.connections) response.end();
    this.connections.clear();
  }
}
