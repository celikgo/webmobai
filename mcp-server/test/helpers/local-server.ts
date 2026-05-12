import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * Tiny in-process HTTP server for tests that need a real same-origin
 * fetch (manifests, robots.txt, sitemap.xml, etc.). Routes are a flat
 * path → handler map. Caller spins it up in beforeAll and tears down in
 * afterAll.
 */
export type RouteHandler = (req: IncomingMessage, res: ServerResponse) => void;

export interface LocalServer {
  origin: string;
  url(path: string): string;
  close(): Promise<void>;
}

export async function startLocalServer(
  routes: Record<string, RouteHandler>,
): Promise<LocalServer> {
  const server = createServer((req, res) => {
    const path = new URL(req.url ?? "/", "http://localhost").pathname;
    const handler = routes[path];
    if (handler) {
      handler(req, res);
    } else {
      res.statusCode = 404;
      res.end("not found");
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  const origin = `http://127.0.0.1:${port}`;
  return {
    origin,
    url: (path) => `${origin}${path.startsWith("/") ? path : `/${path}`}`,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      ),
  };
}

export function json(body: unknown): RouteHandler {
  return (_req, res) => {
    res.setHeader("content-type", "application/json");
    res.statusCode = 200;
    res.end(JSON.stringify(body));
  };
}

export function html(body: string): RouteHandler {
  return (_req, res) => {
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.statusCode = 200;
    res.end(body);
  };
}

export function raw(body: string, status = 200, contentType = "text/plain"): RouteHandler {
  return (_req, res) => {
    res.setHeader("content-type", contentType);
    res.statusCode = status;
    res.end(body);
  };
}
