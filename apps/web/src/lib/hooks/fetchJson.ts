"use client";

/// Thrown when a route answers 401. Typed so callers can tell "you are not
/// signed in" apart from "the request failed", which the UI has to word very
/// differently.
export class UnauthorizedError extends Error {
  constructor() {
    super("not signed in");
    this.name = "UnauthorizedError";
  }
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (res.status === 401) throw new UnauthorizedError();
  if (!res.ok) throw new Error(`request failed (${res.status})`);
  return res.json() as Promise<T>;
}

/// React Query's default is three retries with backoff. For a 401 that is a
/// second of pointless requests before the user is told anything, and the thing
/// they are finally told is wrong — the answer arrived immediately and it was
/// "sign in", not "something went wrong".
export function retryUnlessUnauthorized(failureCount: number, error: unknown): boolean {
  if (error instanceof UnauthorizedError) return false;
  return failureCount < 2;
}
