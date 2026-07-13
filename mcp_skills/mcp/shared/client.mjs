const DEFAULT_BASE = "https://hatch-api-h018.onrender.com";

export function apiBase() {
  return (process.env.HATCH_API_BASE || DEFAULT_BASE).replace(/\/$/, "");
}

export function profileHeaders() {
  const profile = process.env.HATCH_PROFILE || "mainnet";
  const headers = { "X-HATCH-Profile": profile };
  const jwt = process.env.HATCH_JWT;
  if (jwt) headers.Authorization = `Bearer ${jwt}`;
  return headers;
}

export async function hatchFetch(path, init = {}) {
  const url = `${apiBase()}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      ...profileHeaders(),
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`HATCH ${res.status} ${path}: ${JSON.stringify(body)}`);
  }
  return body;
}

export function textResult(data) {
  return {
    content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }],
  };
}
