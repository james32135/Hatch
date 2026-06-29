/**
 * Validate render.yaml production shape (no secrets printed).
 * Regex-only — no extra YAML dependency.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd(), "../..");
const renderPath = resolve(root, "render.yaml");

const forbidden = ["SODEX_PRIVATE_KEY", "SODEX_ADDRESS", "SODEX_ACCOUNT_ID"];

const report = {
  renderYamlPresent: existsSync(renderPath),
  healthCheckPath: null,
  startCommand: null,
  databaseFromRenderDb: false,
  databaseSyncFalse: false,
  nvidiaConfigured: false,
  heartbeatCronPresent: false,
  forbiddenKeysInYaml: [],
  ok: true,
  issues: [],
  deployChecklist: [
    "Create Render Blueprint from render.yaml (or link repo)",
    "Set DATABASE_URL = Supabase pooler URL (sync:false — not Render Postgres)",
    "Set DIRECT_URL = Supabase :5432 for migrate if needed",
    "Set SOSO_API_KEY, NVIDIA_API_KEY (and optional Groq/Cerebras/SambaNova)",
    "Set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN (required — no degrade)",
    "Confirm JWT_SECRET + CRON_SECRET generated (or set manually)",
    "Set CORS_ALLOWED_ORIGINS + FRONTEND_URL when frontend exists",
    "NEVER set SODEX_PRIVATE_KEY / SODEX_ADDRESS / SODEX_ACCOUNT_ID for user trading",
    "Verify healthCheckPath /api/health/live returns 200 after deploy",
    "Verify GET /api/health/ready (postgres + redis)",
    "Verify cron hatch-heartbeat hits /api/internal/heartbeat with CRON_SECRET",
    "Smoke: GET /api/config, /api/ssi/*, /api/sodex/markets/symbols",
  ],
  manualSecretsRequired: [
    "DATABASE_URL",
    "SOSO_API_KEY",
    "NVIDIA_API_KEY",
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
    "JWT_SECRET",
    "CRON_SECRET",
    "CORS_ALLOWED_ORIGINS",
    "FRONTEND_URL",
  ],
};

if (!report.renderYamlPresent) {
  report.ok = false;
  report.issues.push("render.yaml missing");
} else {
  const raw = readFileSync(renderPath, "utf8");
  report.healthCheckPath = /healthCheckPath:\s*(\S+)/.exec(raw)?.[1] ?? null;
  report.startCommand = /startCommand:\s*(.+)/.exec(raw)?.[1]?.trim() ?? null;
  report.databaseFromRenderDb = /fromDatabase:/.test(raw);
  report.databaseSyncFalse =
    /key:\s*DATABASE_URL[\s\S]{0,80}sync:\s*false/.test(raw);
  report.nvidiaConfigured = /NVIDIA_BASE_URL/.test(raw);
  report.heartbeatCronPresent =
    /name:\s*hatch-heartbeat/.test(raw) &&
    /\/api\/internal\/heartbeat/.test(raw);
  report.forbiddenKeysInYaml = forbidden.filter((k) =>
    new RegExp(`key:\\s*${k}\\b`).test(raw),
  );

  report.freePlan = /plan:\s*free/.test(raw);
  report.serviceName = /name:\s*(hatch-api|hatch-backend)/.exec(raw)?.[1] ?? null;

  if (report.healthCheckPath !== "/api/health/live") {
    report.ok = false;
    report.issues.push("healthCheckPath must be /api/health/live");
  }
  if (!report.freePlan && !/plan:\s*starter/.test(raw)) {
    report.ok = false;
    report.issues.push("web service should declare plan: free (or starter)");
  }
  if (!report.serviceName) {
    report.ok = false;
    report.issues.push("expected service name hatch-api");
  }
  if (!String(report.startCommand || "").includes("prisma migrate")) {
    report.ok = false;
    report.issues.push("startCommand should run prisma migrate deploy");
  }
  if (report.databaseFromRenderDb) {
    report.ok = false;
    report.issues.push(
      "DATABASE_URL must not use Render fromDatabase (use Supabase sync:false)",
    );
  }
  if (!report.databaseSyncFalse) {
    report.ok = false;
    report.issues.push("DATABASE_URL should be sync: false for Supabase");
  }
  if (!report.nvidiaConfigured) {
    report.ok = false;
    report.issues.push("NVIDIA_BASE_URL missing from render.yaml");
  }
  // Free tier: cron jobs are not available — heartbeat optional
  if (!report.heartbeatCronPresent && !report.freePlan) {
    report.ok = false;
    report.issues.push("hatch-heartbeat cron → /api/internal/heartbeat missing");
  }
  if (report.forbiddenKeysInYaml.length) {
    report.ok = false;
    report.issues.push(
      `Forbidden custody keys in yaml: ${report.forbiddenKeysInYaml.join(",")}`,
    );
  }
}

report.note =
  "Set manual secrets in Render dashboard. Never set SoDEX custody globals. Redis = Upstash REST.";

console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
