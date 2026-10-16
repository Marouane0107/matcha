import { ERROR_CODES } from "@matcha/shared";
import type { ApiError, ApiResponse } from "@matcha/shared";

export class ApiRequestError extends Error {
  constructor(public status: number, public error: ApiError) {
    super(error.code);
  }
}

export class TransportError extends Error {
  constructor(public kind: "network" | "timeout" | "malformed" | "configuration") {
    super(kind);
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function unwrap<T>(response: ApiResponse<T>, status = 400): T {
  if (!response.success) throw new ApiRequestError(status, response.error);
  return response.data;
}

export interface RequestOptions<T> {
  method?: "GET" | "POST";
  body?: unknown;
  accessToken?: string;
  status: number;
  validate: (value: unknown) => value is T;
}

export function createApiClient(
  baseUrl: string,
  invalidate: (token: string) => void = () => {},
  fetcher: typeof fetch = fetch,
) {
  async function request<T>(path: string, options: RequestOptions<T>): Promise<T> {
    let url: URL;
    try {
      const base = new URL(baseUrl);
      url = new URL(path, base.origin);
      if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password ||
          !path.startsWith('/api/') || url.origin !== base.origin || url.search || url.hash) {
        throw new Error();
      }
    } catch {
      throw new TransportError("configuration");
    }
    const headers = new Headers({ Accept: "application/json" });
    if (options.body !== undefined) headers.set("Content-Type", "application/json");
    if (options.accessToken) headers.set("Authorization", `Bearer ${options.accessToken}`);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetcher(url, {
        method: options.method ?? "GET",
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        headers,
        credentials: "omit",
        redirect: "error",
        referrerPolicy: "no-referrer",
        signal: controller.signal,
      });
      if (response.status === 401 && options.accessToken) invalidate(options.accessToken);
      if (response.status === 204) {
        if (options.status !== 204 || !options.validate(undefined)) throw new TransportError("malformed");
        return undefined as T;
      }
      if (!response.headers.get("content-type")?.includes("application/json")) {
        throw new TransportError("malformed");
      }
      let payload: unknown;
      try { payload = await response.json(); } catch {
        if (controller.signal.aborted) throw new TransportError("timeout");
        throw new TransportError("malformed");
      }
      if (!isRecord(payload)) throw new TransportError("malformed");
      if (!response.ok && payload.success === false && payload.data === null &&
          isRecord(payload.error) && typeof payload.error.message === "string" &&
          typeof payload.error.code === "string" &&
          (Object.values(ERROR_CODES) as string[]).includes(payload.error.code)) {
        const error = payload.error as unknown as ApiError;
        if (response.status === 403 && error.code === ERROR_CODES.EMAIL_NOT_VERIFIED && options.accessToken) {
          invalidate(options.accessToken);
        }
        throw new ApiRequestError(response.status, error);
      }
      if (!response.ok || response.status !== options.status || payload.success !== true ||
          payload.error !== null || !options.validate(payload.data)) throw new TransportError("malformed");
      return payload.data;
    } catch (error) {
      if (error instanceof ApiRequestError || error instanceof TransportError) throw error;
      throw new TransportError(controller.signal.aborted ? "timeout" : "network");
    } finally {
      clearTimeout(timer);
    }
  }
  return { request };
}
