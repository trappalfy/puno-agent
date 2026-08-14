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

/// Thrown when a route answers 403. Distinct from 401 on purpose: the session
/// is fine, the *resource* is not theirs. Retrying cannot change that, and the
/// wording a user needs is different again — "sign in" is wrong advice for
/// someone who is already signed in.
export class ForbiddenError extends Error {
  constructor() {
    super("not yours to view");
    this.name = "ForbiddenError";
  }
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (res.status === 401) throw new UnauthorizedError();
  if (res.status === 403) throw new ForbiddenError();
  if (!res.ok) throw new Error(`request failed (${res.status})`);
  return res.json() as Promise<T>;
}

/// React Query's default is three retries with backoff. For a denial that is a
/// minute of pointless requests before the user is told anything, and the thing
/// they are finally told is wrong — the answer arrived immediately and it was
/// "sign in" or "not yours", not "something went wrong".
///
/// Both 401 and 403 are terminal. Only 401 was, at first, and the gap showed
/// up as a real bug: opening the trial agent 403s, and the page spent ~60s
/// retrying a refusal that was never going to soften before finally reporting
/// a generic failure.
export function retryUnlessDenied(failureCount: number, error: unknown): boolean {
  if (error instanceof UnauthorizedError || error instanceof ForbiddenError) return false;
  return failureCount < 2;
}
