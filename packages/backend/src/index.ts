import { getEnv } from "./config/env.js";
import { buildApp } from "./app.js";
import { logger } from "./lib/logger.js";
import { getPrisma } from "./lib/prisma.js";
import { redisRequired, redisPing, redisBackend } from "./lib/redis.js";
import { startBackgroundJobs, stopBackgroundJobs } from "./jobs/scheduler.js";

async function main(): Promise<void> {
  const env = getEnv();
  getPrisma();
  redisRequired();
  const redisOk = await redisPing();
  if (!redisOk) {
    throw new Error(`Redis ping failed (backend=${redisBackend()})`);
  }
  const app = await buildApp();
  await app.listen({ port: env.PORT, host: env.HOST });
  startBackgroundJobs();
  logger.info(
    {
      port: env.PORT,
      host: env.HOST,
      profile: env.HATCH_DEFAULT_PROFILE,
      nodeEnv: env.NODE_ENV,
      redis: redisBackend(),
    },
    "hatch-backend listening",
  );

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "shutting down");
    stopBackgroundJobs();
    await app.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.fatal({ err }, "failed to start");
  process.exit(1);
});
