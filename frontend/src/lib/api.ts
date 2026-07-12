const RAW_BASE = (import.meta.env.VITE_HATCH_API_BASE_URL as string | undefined) || "https://hatch-api-h018.onrender.com";
export const API_BASE = RAW_BASE.replace(/\/$/, "");

const PARENT_JWT_KEY = "hatch.jwt.parent";
const CHILD_JWT_KEY = "hatch.jwt.child";
/** @deprecated legacy single-key storage — migrated on read */
const LEGACY_JWT_KEY = "hatch.jwt";
const ROLE_KEY = "hatch.role";
const PROFILE_KEY = "hatch.profile";

export type HatchProfile = "mainnet" | "testnet" | "mainnet-readonly";

function isChildRoute(): boolean {
  try {
    return typeof window !== "undefined" && window.location.pathname.startsWith("/child");
  } catch {
    return false;
  }
}

function readParentJwt(): string | null {
  try {
    let token = localStorage.getItem(PARENT_JWT_KEY);
    if (token) return token;
    const legacy = localStorage.getItem(LEGACY_JWT_KEY);
    const role = localStorage.getItem(ROLE_KEY);
    if (legacy && role === "parent") {
      localStorage.setItem(PARENT_JWT_KEY, legacy);
      localStorage.removeItem(LEGACY_JWT_KEY);
      return legacy;
    }
    return null;
  } catch {
    return null;
  }
}

export function getJwt(): string | null {
  try {
    if (isChildRoute()) return sessionStorage.getItem(CHILD_JWT_KEY);
    return readParentJwt();
  } catch {
    return null;
  }
}

export function setJwt(token: string, role: "parent" | "child") {
  if (role === "child") {
    sessionStorage.setItem(CHILD_JWT_KEY, token);
  } else {
    localStorage.setItem(PARENT_JWT_KEY, token);
    localStorage.setItem(ROLE_KEY, "parent");
    localStorage.removeItem(LEGACY_JWT_KEY);
  }
  window.dispatchEvent(new Event("hatch:auth"));
}

export function clearJwt() {
  try {
    if (isChildRoute()) {
      sessionStorage.removeItem(CHILD_JWT_KEY);
    } else {
      localStorage.removeItem(PARENT_JWT_KEY);
      localStorage.removeItem(LEGACY_JWT_KEY);
      localStorage.removeItem(ROLE_KEY);
    }
  } catch { /* noop */ }
  window.dispatchEvent(new Event("hatch:auth"));
}

export function clearChildSession() {
  try {
    sessionStorage.removeItem(CHILD_JWT_KEY);
  } catch { /* noop */ }
  window.dispatchEvent(new Event("hatch:auth"));
}

export function getRole(): "parent" | "child" | null {
  try {
    if (isChildRoute()) {
      return sessionStorage.getItem(CHILD_JWT_KEY) ? "child" : null;
    }
    return readParentJwt() ? "parent" : null;
  } catch {
    return null;
  }
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

export type AgentProgressPayload = {
  step: string;
  label: string;
  status: "active" | "done";
  detail?: string;
};

export type AgentDonePayload = {
  content: string;
  thinking?: string;
  sources?: string[];
  followUps?: string[];
  marketsTop?: unknown[];
  provider?: string;
  model?: string;
  latencyMs?: number;
  contextMs?: number;
};

export type AgentStreamHandlers = {
  onProgress?: (data: AgentProgressPayload) => void;
  onThinking?: (delta: string) => void;
  onToken?: (delta: string) => void;
  onDone?: (data: AgentDonePayload) => void;
  onError?: (message: string) => void;
};

/** SSE stream for Investment Copilot — progress, thinking, and live tokens. */
export async function streamAgent(
  body: {
    childId?: string;
    notionalUsd?: number;
    messages: Array<{ role: "user" | "assistant"; content: string }>;
  },
  handlers: AgentStreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-HATCH-Profile": getProfile(),
  };
  const jwt = getJwt();
  if (jwt) headers.Authorization = `Bearer ${jwt}`;

  const res = await fetch(`${API_BASE}/api/ai/agent/stream`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const ct = res.headers.get("content-type") || "";
    const errBody = ct.includes("application/json")
      ? await res.json().catch(() => null)
      : await res.text().catch(() => null);
    const err = makeError(res.status, errBody, `Agent stream failed: ${res.status}`);
    if (err.code === "forbidden_child_write") {
      err.message = "Investment Copilot is for parents only. Sign in with your wallet on /login.";
    }
    throw err;
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response stream");

  const dec = new TextDecoder();
  let buf = "";
  let sawDone = false;
  let sawError = false;

  const dispatch = (block: string) => {
    const lines = block.split("\n");
    let event = "message";
    let data = "";
    for (const line of lines) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) data += line.slice(5).trim();
    }
    if (!data) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      return;
    }
    if (event === "progress") handlers.onProgress?.(parsed as AgentProgressPayload);
    else if (event === "thinking") handlers.onThinking?.((parsed as { delta: string }).delta);
    else if (event === "token") handlers.onToken?.((parsed as { delta: string }).delta);
    else if (event === "done") {
      sawDone = true;
      handlers.onDone?.(parsed as AgentDonePayload);
    } else if (event === "error") {
      sawError = true;
      handlers.onError?.((parsed as { message: string }).message);
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n\n")) >= 0) {
      dispatch(buf.slice(0, idx));
      buf = buf.slice(idx + 2);
    }
  }
  if (buf.trim()) dispatch(buf);

  if (!sawDone && !sawError) {
    handlers.onError?.("Copilot stream ended without a response. Try again.");
  }
}
