import { getOneClickClient, type OneClickClient } from "./oneclick";

/**
 * Client resolution for route handlers and services.
 *
 * Tests replace the client here instead of monkey-patching `fetch`. That keeps the HTTP layer
 * honest and lets a route test drive a full committed-quote lifecycle offline.
 */

let override: OneClickClient | null = null;

export function getClient(): OneClickClient {
  return override ?? getOneClickClient();
}

export function setOneClickClientForTests(client: OneClickClient | null): void {
  override = client;
}
