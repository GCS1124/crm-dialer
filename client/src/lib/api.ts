const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api";
const DEFAULT_TIMEOUT_MS = 15_000;

export function buildApiUrl(path: string) {
  return `${apiBaseUrl}${path}`;
}

interface RequestOptions extends RequestInit {
  token?: string | null;
  timeoutMs?: number;
}

interface ApiErrorOptions {
  status?: number | null;
  code?: string;
  details?: unknown;
  isNetworkError?: boolean;
}

export class ApiError extends Error {
  status: number | null;
  code?: string;
  details?: unknown;
  isNetworkError: boolean;

  constructor(message: string, options: ApiErrorOptions = {}) {
    super(message);
    this.name = "ApiError";
    this.status = options.status ?? null;
    this.code = options.code;
    this.details = options.details;
    this.isNetworkError = options.isNetworkError ?? false;
  }
}

function normalizeNetworkMessage(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("abort") || lower.includes("timed out")) {
    return `The request to ${apiBaseUrl} timed out. Check the backend server and network connection.`;
  }

  if (lower.includes("fetch") || lower.includes("network")) {
    return `Cannot reach the API at ${apiBaseUrl}. Start the backend server or verify VITE_API_BASE_URL.`;
  }

  return message;
}

function readPayloadMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") {
    return fallback;
  }

  const message = "message" in payload ? payload.message : undefined;
  return typeof message === "string" && message.trim() ? message : fallback;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}) {
  const { token, timeoutMs = DEFAULT_TIMEOUT_MS, signal, ...requestOptions } = options;
  const headers = new Headers(requestOptions.headers);
  headers.set("Accept", "application/json");

  if (requestOptions.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const controller = new AbortController();
  const abortRequested = () => controller.abort();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  if (signal?.aborted) {
    controller.abort();
  } else {
    signal?.addEventListener("abort", abortRequested);
  }

  let response: Response;

  try {
    response = await fetch(buildApiUrl(path), {
      ...requestOptions,
      headers,
      signal: controller.signal,
    });
  } catch (error) {
    const message = normalizeNetworkMessage(
      error instanceof Error ? error.message : "Unable to contact the backend API.",
    );

    throw new ApiError(message, {
      code:
        error instanceof DOMException && error.name === "AbortError"
          ? "TIMEOUT"
          : "NETWORK",
      isNetworkError: true,
    });
  } finally {
    window.clearTimeout(timeout);
    signal?.removeEventListener("abort", abortRequested);
  }

  if (response.status === 204) {
    return null as T;
  }

  const contentType = response.headers.get("content-type") ?? "";
  let payload: unknown = null;

  if (contentType.includes("application/json")) {
    payload = await response.json().catch(() => null);
  } else {
    payload = (await response.text().catch(() => "")) || null;
  }

  if (!response.ok) {
    throw new ApiError(
      readPayloadMessage(payload, `Request failed with status ${response.status}`),
      {
        status: response.status,
        code:
          payload && typeof payload === "object" && "code" in payload && typeof payload.code === "string"
            ? payload.code
            : undefined,
        details: payload,
      },
    );
  }

  return payload as T;
}
