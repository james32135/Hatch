/**
 * Create / update hatch-api on Render and verify production health.
 * Reads secrets from process.env / .env — never prints secret values.
 */
import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), "../../.env") });
config({ path: resolve(process.cwd(), ".env") });

const API = "https://api.render.com/v1";
const KEY = process.env.RENDER_API_KEY;
if (!KEY) {
  console.error("RENDER_API_KEY missing");
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${KEY}`,
  Accept: "application/json",
  "Content-Type": "application/json",
};

async function api(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(`Render ${method} ${path} → ${res.status}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

function secret(name, fallback) {
  const v = process.env[name] || fallback;
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

const BUILD =
  "npm install && npx prisma generate --schema=packages/backend/prisma/schema.prisma && npm run build -w @hatch/backend";
const START =
  "cd packages/backend && npx prisma migrate deploy && npm run start";

function envVarsPayload() {
  const pairs = [
    ["NODE_ENV", "production"],
    ["PORT", "10000"],
    ["HATCH_DEFAULT_PROFILE", "mainnet"],
    ["KILL_SWITCH", "false"],
    ["TRADING_MAX_NOTIONAL_USD", "100"],
    ["SOSO_API_BASE_URL", "https://openapi.sosovalue.com/openapi/v1"],
    ["NVIDIA_BASE_URL", "https://integrate.api.nvidia.com/v1"],
    ["NVIDIA_MODEL", "deepseek-ai/deepseek-v4-flash"],
    ["NVIDIA_MODEL_ALT", "openai/gpt-oss-120b"],
    ["NVIDIA_MODEL_ALT2", "meta/llama-3.3-70b-instruct"],
    ["GROQ_BASE_URL", "https://api.groq.com/openai/v1"],
    ["GROQ_MODEL", "llama-3.3-70b-versatile"],
    ["CEREBRAS_BASE_URL", "https://api.cerebras.ai/v1"],
    ["CEREBRAS_MODEL", "llama3.3-70b"],
    ["SAMBANOVA_BASE_URL", "https://api.sambanova.ai/v1"],
    ["SAMBANOVA_MODEL", "Meta-Llama-3.3-70B-Instruct"],
    ["SODEX_MAINNET_SPOT_REST", "https://mainnet-gw.sodex.dev/api/v1/spot"],
    ["SODEX_TESTNET_SPOT_REST", "https://testnet-gw.sodex.dev/api/v1/spot"],
    ["VALUECHAIN_MAINNET_CHAIN_ID", "286623"],
    ["VALUECHAIN_TESTNET_CHAIN_ID", "138565"],
    ["VALUECHAIN_MAINNET_RPC_URL", "https://mainnet.valuechain.xyz"],
    ["VALUECHAIN_TESTNET_RPC_URL", "https://testnet-v2.valuechain.xyz"],
    ["BASE_RPC_URL", "https://mainnet.base.org"],
    [
      "HATCH_LOG_ADDRESS_MAINNET",
      "0x06a8ADeB3d1d1a4160606967308C275a627E4fCB",
    ],
    [
      "HATCH_SCHEDULE_ADDRESS_MAINNET",
      "0xfdC9A9F19441f10729769393CBBD6d870802Ace9",
    ],
    [
      "HATCH_LOG_ADDRESS_TESTNET",
      "0xB4483128Bf95aa63621cB9EcA7f5d22a0d546b6C",
    ],
    [
      "HATCH_SCHEDULE_ADDRESS_TESTNET",
      "0x3db8750EE3a397b5A8A4e1842Bfb69f511342C6b",
    ],
    ["SNAPSHOT_INTERVAL_MS", "60000"],
    ["CORS_ALLOWED_ORIGINS", "*"],
    ["FRONTEND_URL", "https://hatch-api.onrender.com"],
    ["DATABASE_URL", secret("DATABASE_URL")],
    ["DIRECT_URL", process.env.DIRECT_URL || secret("DATABASE_URL")],
    ["SOSO_API_KEY", process.env.SOSO_API_KEY || process.env.SoSoValue_API_key],
    ["NVIDIA_API_KEY", secret("NVIDIA_API_KEY")],
    ["GROQ_API_KEY", process.env.GROQ_API_KEY || ""],
    ["CEREBRAS_API_KEY", process.env.CEREBRAS_API_KEY || ""],
    ["SAMBANOVA_API_KEY", process.env.SAMBANOVA_API_KEY || ""],
    ["UPSTASH_REDIS_REST_URL", secret("UPSTASH_REDIS_REST_URL")],
    ["UPSTASH_REDIS_REST_TOKEN", secret("UPSTASH_REDIS_REST_TOKEN")],
    ["JWT_SECRET", secret("JWT_SECRET")],
    ["CRON_SECRET", secret("CRON_SECRET")],
  ];
  return pairs
    .filter(([, v]) => v !== undefined && v !== null && String(v).length > 0)
    .map(([key, value]) => ({ key, value: String(value) }));
}

async function findService(name) {
  const list = await api("GET", "/services?limit=50");
  const rows = Array.isArray(list) ? list : [];
  for (const row of rows) {
    const s = row.service || row;
    if (s.name === name) return s;
  }
  return null;
}

async function createService(ownerId) {
  const body = {
    type: "web_service",
    name: "hatch-api",
    ownerId,
    repo: "https://github.com/james32135/Hatch",
    branch: "main",
    autoDeploy: "yes",
    rootDir: ".",
    envVars: envVarsPayload(),
    serviceDetails: {
      runtime: "node",
      plan: "free",
      region: "oregon",
      healthCheckPath: "/api/health/live",
      numInstances: 1,
      envSpecificDetails: {
        buildCommand: BUILD,
        startCommand: START,
      },
    },
  };
  return api("POST", "/services", body);
}

async function updateEnv(serviceId) {
  // PUT replaces env vars
  return api("PUT", `/services/${serviceId}/env-vars`, envVarsPayload());
}

async function triggerDeploy(serviceId) {
  return api("POST", `/services/${serviceId}/deploys`, { clearCache: "do_not_clear" });
}

async function latestDeploy(serviceId) {
  const list = await api("GET", `/services/${serviceId}/deploys?limit=1`);
  const row = Array.isArray(list) ? list[0] : null;
  return row?.deploy || row;
}

async function waitDeploy(serviceId, timeoutMs = 900_000) {
  const start = Date.now();
  let last = "";
  while (Date.now() - start < timeoutMs) {
    const d = await latestDeploy(serviceId);
    const status = d?.status || "unknown";
    if (status !== last) {
      console.log(`deploy status: ${status}`);
      last = status;
    }
    if (status === "live") return d;
    if (
      status === "build_failed" ||
      status === "update_failed" ||
      status === "canceled" ||
      status === "deactivated"
    ) {
      throw new Error(`Deploy failed: ${status}`);
    }
    await new Promise((r) => setTimeout(r, 15_000));
  }
  throw new Error("Deploy wait timeout");
}

async function verify(baseUrl) {
  const checks = [];
  async function check(name, path, pred) {
    try {
      const res = await fetch(`${baseUrl}${path}`, {
        headers: { Accept: "application/json" },
      });
      const text = await res.text();
      let body;
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
      const ok = pred(res, body);
      checks.push({ name, ok, status: res.status });
      console.log(JSON.stringify({ name, ok, status: res.status }));
      return ok;
    } catch (err) {
      checks.push({ name, ok: false, error: String(err) });
      console.log(JSON.stringify({ name, ok: false, error: String(err) }));
      return false;
    }
  }

  await check("health.live", "/api/health/live", (r, b) => r.ok && b?.ok === true);
  await check("health.ready", "/api/health/ready", (r, b) => r.ok && b?.ok === true);
  await check("health.deep", "/api/health", (r, b) => {
    if (!r.ok || !b?.checks) return false;
    const c = b.checks;
    return !!(c.postgres?.ok && c.redis?.ok && c.sosovalue?.ok && c.sodex?.ok && c.valuechainRpc?.ok);
  });
  await check("metrics", "/api/metrics", (r, b) => r.ok && b?.custody?.backendOwnsSodexTradingKeys === false);
  await check(
    "valuechain.mainnet",
    "/api/valuechain/contracts?network=mainnet",
    (r, b) => r.ok && b?.ok === true,
  );
  await check(
    "valuechain.testnet",
    "/api/valuechain/contracts?network=testnet",
    (r, b) => r.ok && b?.ok === true,
  );
  await check("ssi.indices", "/api/ssi/indices", (r) => r.ok);
  await check("sodex.symbols", "/api/sodex/markets/symbols", (r) => r.ok);
  await check("ai.health", "/api/ai/health", (r, b) => r.ok || (b && b.providers));
  await check("projections", "/api/projections/assumptions", (r, b) => r.ok && !!b?.documentedYieldBands);

  return checks;
}

async function main() {
  const owners = await api("GET", "/owners?limit=20");
  const ownerRow = Array.isArray(owners) ? owners[0] : owners;
  const ownerId = ownerRow?.owner?.id || ownerRow?.id;
  if (!ownerId) throw new Error("No Render owner/workspace id");
  console.log(JSON.stringify({ ownerId, step: "owners_ok" }));

  let service = await findService("hatch-api");
  if (!service) {
    console.log(JSON.stringify({ step: "creating_service" }));
    try {
      const created = await createService(ownerId);
      service = created.service || created;
    } catch (err) {
      console.log(JSON.stringify({ step: "create_failed", status: err.status, body: err.body }));
      throw err;
    }
  } else {
    console.log(JSON.stringify({ step: "service_exists", id: service.id }));
    await updateEnv(service.id);
    console.log(JSON.stringify({ step: "env_updated" }));
    await triggerDeploy(service.id);
    console.log(JSON.stringify({ step: "deploy_triggered" }));
  }

  const serviceId = service.id;
  const url =
    service.serviceDetails?.url ||
    service.url ||
    `https://hatch-api.onrender.com`;
  console.log(JSON.stringify({ serviceId, url, step: "waiting_deploy" }));

  await waitDeploy(serviceId);
  console.log(JSON.stringify({ step: "deploy_live" }));

  // Free tier cold start
  await new Promise((r) => setTimeout(r, 10_000));

  let checks = await verify(url);
  let failed = checks.filter((c) => !c.ok);
  if (failed.length) {
    console.log(JSON.stringify({ step: "redeploy_after_fail", failed: failed.map((f) => f.name) }));
    await triggerDeploy(serviceId);
    await waitDeploy(serviceId);
    await new Promise((r) => setTimeout(r, 15_000));
    checks = await verify(url);
    failed = checks.filter((c) => !c.ok);
  }

  const summary = {
    serviceName: "hatch-api",
    serviceId,
    url,
    healthUrl: `${url}/api/health/live`,
    checks,
    allGreen: failed.length === 0,
  };
  console.log(JSON.stringify(summary, null, 2));
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(JSON.stringify({ fatal: true, message: err.message, body: err.body || null }));
  process.exit(1);
});
