import { request as newRequest, type APIRequestContext } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { BASE_URL, STATE_DIR, statePath, type Role } from "./env.js";

/**
 * Signs a role in over the API and stores the resulting cookies.
 *
 * Better Auth rejects a request without `Origin`, so the context always sends the
 * web origin even though the call goes straight to the API path. The stored state
 * is what the browser projects reuse, which keeps the sign-in out of every test
 * and out of the UI under test.
 */
export async function saveSignedInState(
  role: Role,
  credentials: { readonly email: string; readonly password: string },
): Promise<string> {
  mkdirSync(STATE_DIR, { recursive: true });

  const context = await apiContext();
  try {
    const response = await context.post("/api/auth/sign-in/email", { data: credentials });

    if (!response.ok()) {
      throw new Error(
        `Sign-in of ${credentials.email} failed with ${response.status()}: ${await response.text()}`,
      );
    }

    const file = statePath(role);
    await context.storageState({ path: file });
    return file;
  } finally {
    await context.dispose();
  }
}

/** An API context with the saved cookies of a role; the caller disposes it. */
export async function apiContextForRole(role: Role): Promise<APIRequestContext> {
  return apiContext({ storageState: statePath(role) });
}

export function relativeToRoot(file: string): string {
  return path.relative(process.cwd(), file);
}

function apiContext(options: { readonly storageState?: string } = {}): Promise<APIRequestContext> {
  return newRequest.newContext({
    baseURL: BASE_URL,
    extraHTTPHeaders: { origin: BASE_URL },
    ...options,
  });
}
