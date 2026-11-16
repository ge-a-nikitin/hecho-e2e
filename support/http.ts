import { API_URL, BASE_URL } from "./env.js";

/**
 * Thin JSON client shared by the fixtures, the data factory and the setup
 * project. It always sends an `Origin` header: Better Auth answers
 * `MISSING_OR_NULL_ORIGIN` without one, and a request that tries to look like a
 * browser is what the API expects on every mutating call.
 */
export interface RequestOptions {
  readonly body?: unknown;
  readonly form?: FormData;
  readonly cookie?: string;
  readonly headers?: Readonly<Record<string, string>>;
}

export interface ApiResponse<T = unknown> {
  readonly status: number;
  readonly headers: Headers;
  readonly text: string;
  readonly body: T;
}

export class HttpClient {
  readonly baseUrl: string;

  constructor(baseUrl: string = API_URL) {
    this.baseUrl = baseUrl.replace(/\/+$/u, "");
  }

  get<T = unknown>(path: string, options: RequestOptions = {}): Promise<ApiResponse<T>> {
    return this.send<T>("GET", path, options);
  }

  post<T = unknown>(path: string, options: RequestOptions = {}): Promise<ApiResponse<T>> {
    return this.send<T>("POST", path, options);
  }

  patch<T = unknown>(path: string, options: RequestOptions = {}): Promise<ApiResponse<T>> {
    return this.send<T>("PATCH", path, options);
  }

  delete<T = unknown>(path: string, options: RequestOptions = {}): Promise<ApiResponse<T>> {
    return this.send<T>("DELETE", path, options);
  }

  async send<T = unknown>(
    method: string,
    path: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = {
      origin: BASE_URL,
      accept: "application/json",
      ...options.headers,
    };

    let body: BodyInit | undefined;
    if (options.form !== undefined) {
      body = options.form;
    } else if (options.body !== undefined) {
      headers["content-type"] = "application/json";
      body = JSON.stringify(options.body);
    }
    if (options.cookie !== undefined) headers.cookie = options.cookie;

    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body,
      redirect: "follow",
    });
    const text = await response.text();

    return {
      status: response.status,
      headers: response.headers,
      text,
      body: parseBody<T>(response.headers, text),
    };
  }
}

/**
 * Fails with the status and the response body, which is what a broken fixture
 * needs: Playwright's own request fixture would report only the URL.
 */
export function requireOk<T>(response: ApiResponse<T>, what: string): T {
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`${what} failed with ${response.status}: ${response.text}`);
  }

  return response.body;
}

/** Turns a `set-cookie` bundle into a `Cookie` header value for follow-up calls. */
export function cookieHeaderOf(response: ApiResponse): string {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .filter((pair) => pair.includes("="))
    .join("; ");
}

function parseBody<T>(headers: Headers, text: string): T {
  if (text === "" || !(headers.get("content-type") ?? "").includes("json")) {
    return undefined as T;
  }

  return JSON.parse(text) as T;
}
