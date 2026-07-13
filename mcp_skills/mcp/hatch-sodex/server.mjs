#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { hatchFetch, textResult } from "../shared/client.mjs";

const server = new Server(
  { name: "hatch-sodex", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

const tools = [
  {
    name: "markets_executable",
    description:
      "List SoDEX markets eligible for parent-signed relay with liquidity and capability metadata.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "markets_symbols",
    description: "Raw SoDEX symbol catalog exposed by HATCH.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "sodex_meta",
    description: "SoDEX gateway profile, chain, and relay endpoints for the active HATCH profile.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "sodex_readiness",
    description: "Parent trading readiness (balances, allowances, kill switch) for authenticated session.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "order_verification",
    description: "Fill verification payload for a signed order id.",
    inputSchema: {
      type: "object",
      properties: { orderId: { type: "string" } },
      required: ["orderId"],
    },
  },
  {
    name: "config_surface",
    description: "Public HATCH config: profiles, custody statement, feature flags.",
    inputSchema: { type: "object", properties: {} },
  },
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;
  switch (name) {
    case "markets_executable":
      return textResult(await hatchFetch("/api/sodex/markets/executable"));
    case "markets_symbols":
      return textResult(await hatchFetch("/api/sodex/markets/symbols"));
    case "sodex_meta":
      return textResult(await hatchFetch("/api/sodex/meta"));
    case "sodex_readiness":
      return textResult(await hatchFetch("/api/sodex/readiness"));
    case "order_verification":
      return textResult(await hatchFetch(`/api/sodex/orders/${args.orderId}/verification`));
    case "config_surface":
      return textResult(await hatchFetch("/api/config"));
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
