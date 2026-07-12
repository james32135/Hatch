const RAW_BASE = (import.meta.env.VITE_HATCH_API_BASE_URL as string | undefined) || "https://hatch-api-h018.onrender.com";
export const API_BASE = RAW_BASE.replace(/\/$/, "");

const JWT_KEY = "hatch.jwt";
const ROLE_KEY = "hatch.role";
const PROFILE_KEY = "hatch.profile";

export type HatchProfile = "mainnet" | "testnet" | "mainnet-readonly";

export function getJwt(): string | null {
  try { return localStorage.getItem(JWT_KEY); } catch { return null; }
}
export function setJwt(token: string, role: "parent" | "child") {
  localStorage.setItem(JWT_KEY, token);
  localStorage.setItem(ROLE_KEY, role);
  window.dispatchEvent(new Event("hatch:auth"));
}
export function clearJwt() {
  localStorage.removeItem(JWT_KEY);
  localStorage.removeItem(ROLE_KEY);
  window.dispatchEvent(new Event("hatch:auth"));
}
export function getRole(): "parent" | "child" | null {
  const r = localStorage.getItem(ROLE_KEY);
  return r === "parent" || r === "child" ? r : null;
}
export function getProfile(): HatchProfile {
  const p = localStorage.getItem(PROFILE_KEY) as HatchProfile | null;
  return (
    p ||
    ((import.meta.env.VITE_DEFAULT_PROFILE as HatchProfile) || "testnet")
  );
}
export function setProfile(p: HatchProfile) {
  localStorage.setItem(PROFILE_KEY, p);
  window.dispatchEvent(new Event("hatch:profile"));
}

export interface HatchError extends Error {
  status: number;
  code?: string;
  details?: unknown;
}

function makeError(status: number, body: any, fallback: string): HatchError {
  const err = new Error(body?.message || fallback) as HatchError;
  err.status = status;
  err.code = body?.error;
  err.details = body?.details;
  return err;
}

export async function apiRequest<T = any>(
  path: string,
  init: RequestInit & { auth?: boolean } = {},
): Promise<T> {
  const { auth = true, headers, ...rest } = init;
  const finalHeaders: Record<string, string> = {
    "X-HATCH-Profile": getProfile(),
    ...(headers as Record<string, string> | undefined),
  };
  // Only set JSON content-type when a body is present — Fastify rejects
  // Content-Type: application/json with an empty body.
  if (rest.body !== undefined && rest.body !== null && !finalHeaders["Content-Type"]) {
    finalHeaders["Content-Type"] = "application/json";
  }
  const jwt = getJwt();
  if (auth && jwt) finalHeaders.Authorization = `Bearer ${jwt}`;

  const res = await fetch(`${API_BASE}${path}`, { ...rest, headers: finalHeaders });
  const ct = res.headers.get("content-type") || "";
  const body = ct.includes("application/json") ? await res.json().catch(() => null) : await res.text().catch(() => null);

  if (!res.ok) throw makeError(res.status, body, `Request failed: ${res.status}`);
  return body as T;
}

export const api = {
  get: <T = any>(path: string, opts?: { auth?: boolean }) => apiRequest<T>(path, { method: "GET", ...opts }),
  post: <T = any>(path: string, body?: unknown, opts?: { auth?: boolean }) =>
    apiRequest<T>(path, {
      method: "POST",
      body: body !== undefined ? JSON.stringify(body) : JSON.stringify({}),
      ...opts,
    }),
  patch: <T = any>(path: string, body?: unknown, opts?: { auth?: boolean }) =>
    apiRequest<T>(path, {
      method: "PATCH",
      body: body !== undefined ? JSON.stringify(body) : JSON.stringify({}),
      ...opts,
    }),
  del: <T = any>(path: string, opts?: { auth?: boolean }) => apiRequest<T>(path, { method: "DELETE", ...opts }),
};
