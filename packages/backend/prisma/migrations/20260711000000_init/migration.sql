-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "RiskTier" AS ENUM ('CONSERVATIVE', 'BALANCED', 'GROWTH');

-- CreateEnum
CREATE TYPE "EnvironmentProfile" AS ENUM ('MAINNET', 'TESTNET', 'MAINNET_READONLY');

-- CreateEnum
CREATE TYPE "OrderRelayStatus" AS ENUM ('PENDING', 'SUBMITTED', 'FILLED', 'PARTIAL', 'REJECTED', 'FAILED');

-- CreateEnum
CREATE TYPE "LessonStatus" AS ENUM ('PENDING', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "wallet_address" TEXT NOT NULL,
    "sodex_account_id_mainnet" INTEGER,
    "sodex_account_id_testnet" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_nonces" (
    "id" TEXT NOT NULL,
    "wallet_address" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_nonces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "children" (
    "id" TEXT NOT NULL,
    "parent_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "age_years" INTEGER NOT NULL,
    "reading_level" INTEGER NOT NULL DEFAULT 1,
    "risk_tier" "RiskTier" NOT NULL DEFAULT 'BALANCED',
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "children_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "allowance_policies" (
    "id" TEXT NOT NULL,
    "child_id" TEXT NOT NULL,
    "parent_id" TEXT NOT NULL,
    "amount_usd" DECIMAL(18,6) NOT NULL,
    "cadence_days" INTEGER NOT NULL DEFAULT 7,
    "risk_tier" "RiskTier" NOT NULL,
    "max_slippage_bps" INTEGER NOT NULL DEFAULT 50,
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "next_due_at" TIMESTAMP(3),
    "policy_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "allowance_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolio_snapshots" (
    "id" TEXT NOT NULL,
    "child_id" TEXT NOT NULL,
    "environment" "EnvironmentProfile" NOT NULL DEFAULT 'MAINNET',
    "total_usd" DECIMAL(18,6),
    "mag7_qty" DECIMAL(36,18),
    "ussi_qty" DECIMAL(36,18),
    "smag7_qty" DECIMAL(36,18),
    "raw_balances_json" JSONB NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'sodex',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portfolio_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lessons" (
    "id" TEXT NOT NULL,
    "child_id" TEXT NOT NULL,
    "status" "LessonStatus" NOT NULL DEFAULT 'PENDING',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "reading_level" INTEGER NOT NULL,
    "citations_json" JSONB NOT NULL,
    "trigger_delta" DECIMAL(18,8),
    "model" TEXT,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lessons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signed_orders" (
    "id" TEXT NOT NULL,
    "parent_id" TEXT NOT NULL,
    "child_id" TEXT,
    "environment" "EnvironmentProfile" NOT NULL,
    "cl_ord_id" TEXT NOT NULL,
    "symbol_id" INTEGER NOT NULL,
    "symbol_name" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "quantity" TEXT NOT NULL,
    "price" TEXT NOT NULL,
    "payload_hash" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "status" "OrderRelayStatus" NOT NULL DEFAULT 'PENDING',
    "sodex_order_id" TEXT,
    "sodex_response_json" JSONB,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "signed_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_events" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_logs" (
    "id" TEXT NOT NULL,
    "agent" TEXT NOT NULL,
    "child_id" TEXT,
    "ok" BOOLEAN NOT NULL,
    "detail" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_wallet_address_key" ON "users"("wallet_address");

-- CreateIndex
CREATE INDEX "auth_nonces_wallet_address_idx" ON "auth_nonces"("wallet_address");

-- CreateIndex
CREATE INDEX "children_parent_id_idx" ON "children"("parent_id");

-- CreateIndex
CREATE INDEX "allowance_policies_next_due_at_idx" ON "allowance_policies"("next_due_at");

-- CreateIndex
CREATE INDEX "allowance_policies_child_id_idx" ON "allowance_policies"("child_id");

-- CreateIndex
CREATE INDEX "portfolio_snapshots_child_id_created_at_idx" ON "portfolio_snapshots"("child_id", "created_at");

-- CreateIndex
CREATE INDEX "lessons_child_id_created_at_idx" ON "lessons"("child_id", "created_at");

-- CreateIndex
CREATE INDEX "signed_orders_parent_id_created_at_idx" ON "signed_orders"("parent_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "signed_orders_environment_cl_ord_id_key" ON "signed_orders"("environment", "cl_ord_id");

-- CreateIndex
CREATE INDEX "system_events_kind_created_at_idx" ON "system_events"("kind", "created_at");

-- CreateIndex
CREATE INDEX "agent_logs_agent_created_at_idx" ON "agent_logs"("agent", "created_at");

-- AddForeignKey
ALTER TABLE "children" ADD CONSTRAINT "children_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allowance_policies" ADD CONSTRAINT "allowance_policies_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allowance_policies" ADD CONSTRAINT "allowance_policies_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_snapshots" ADD CONSTRAINT "portfolio_snapshots_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signed_orders" ADD CONSTRAINT "signed_orders_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signed_orders" ADD CONSTRAINT "signed_orders_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE SET NULL ON UPDATE CASCADE;
