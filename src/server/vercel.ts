import type { IncomingMessage, ServerResponse } from "node:http";
import { App } from "./app.js";

/**
 * Vercel serverless entry (bundled to api/index.js by `npm run api:build`).
 * Reservation state lives in the function instance, so it persists only while the instance is warm —
 * the web app therefore defaults to the in-browser engine and uses /api for reads and demos.
 */
const app = new App({ today: new Date().toISOString().slice(0, 10), preloadOccupancy: 0.35, hotelsPerCity: 100 });

export default function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  req.url = (req.url ?? "/").replace(/^\/api(?=\/|\?|$)/, "") || "/";
  return app.handle(req, res);
}
