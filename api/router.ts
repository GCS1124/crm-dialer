import type { IncomingMessage, ServerResponse } from "node:http";

import { createApp } from "../server/src/app.js";

const app = createApp();

type ApiRouteRequest = IncomingMessage & {
  query: Record<string, string | string[] | undefined>;
  url?: string;
};

function normalizeRouteParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value.filter(Boolean).join("/");
  }

  return value?.trim() ?? "";
}

export default function handler(req: ApiRouteRequest, res: ServerResponse) {
  const route = normalizeRouteParam(req.query.route);
  const queryIndex = req.url?.indexOf("?") ?? -1;
  const query = queryIndex >= 0 && req.url ? req.url.slice(queryIndex) : "";

  req.url = route ? `/api/${route}${query}` : `/api${query}`;

  return app(req as never, res as never);
}
