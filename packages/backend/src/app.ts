import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import sensible from "@fastify/sensible";
import { getEnv } from "./config/env.js";
import { isHatchError } from "./lib/errors.js";
import { logger } from "./lib/logger.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerChildrenRoutes } from "./routes/children.js";
import { registerSodexRoutes } from "./routes/sodex.js";
import { registerSsiRoutes } from "./routes/ssi.js";
import { registerInternalRoutes } from "./routes/internal.js";
import { registerAiRoutes } from "./routes/ai.js";
import { registerPortfolioRoutes } from "./routes/portfolio.js";
import { registerAllowanceRoutes } from "./routes/allowances.js";
import { registerMetricsRoutes } from "./routes/metrics.js";
import { registerConfigRoutes } from "./routes/config.js";
import { registerValuechainRoutes } from "./routes/valuechain.js";
import { registerProjectionRoutes } from "./routes/projections.js";

export async function buildApp(): Promise<FastifyInstance> {
  const env = getEnv();
  const app = Fastify({
    logger: false,
    trustProxy: true,
  });

  await app.register(sensible);
  await app.register(helmet, { global: true });
  await app.register(cors, {
    origin: env.CORS_ALLOWED_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean),
    credentials: true,
  });
  await app.register(rateLimit, {
    max: 200,
    timeWindow: "1 minute",
  });
  await app.register(jwt, {
    secret: env.JWT_SECRET,
    sign: { expiresIn: env.JWT_TTL_SECONDS },
  });

  app.decorate("authenticate", async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.code(401).send({ error: "unauthorized", message: "Invalid or missing JWT" });
    }
  });

  app.setErrorHandler((err, _req, reply) => {
    if (isHatchError(err)) {
      return reply.code(err.statusCode).send({
        error: err.code,
        message: err.message,
        details: err.details,
      });
    }
    logger.error({ err }, "unhandled error");
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    return reply.code(status).send({
      error: "internal",
      message: status >= 500 ? "Internal server error" : (err as Error).message,
    });
  });

  await registerHealthRoutes(app);
  await registerConfigRoutes(app);
  await registerValuechainRoutes(app);
  await registerProjectionRoutes(app);
  await registerAuthRoutes(app);
  await registerChildrenRoutes(app);
  await registerPortfolioRoutes(app);
  await registerAllowanceRoutes(app);
  await registerSodexRoutes(app);
  await registerSsiRoutes(app);
  await registerAiRoutes(app);
  await registerMetricsRoutes(app);
  await registerInternalRoutes(app);

  return app;
}

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (request: import("fastify").FastifyRequest, reply: import("fastify").FastifyReply) => Promise<void>;
  }
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: {
      sub: string;
      wallet: string;
      role: "parent" | "child";
      childId?: string;
    };
    user: {
      sub: string;
      wallet: string;
      role: "parent" | "child";
      childId?: string;
    };
  }
}
