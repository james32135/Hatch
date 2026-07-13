#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { hatchFetch, textResult } from "../shared/client.mjs";

const server = new Server(
  { name: "hatch-ssi", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

const tools = [
  {
    name: "ssi_indices",
    description: "SoSoValue SSI index catalog (MAG7, USSI, etc.).",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "ssi_market_snapshot",
    description: "Live SSI market snapshot with liquidity and pricing context.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "ssi_mag7_constituents",
    description: "MAG7 index constituent weights and symbols.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "ssi_capabilities",
    description: "SSI capability matrix: mint, redeem, stake, and venue support.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "ssi_flow_mint",
    description: "Mint flow steps for an SSI symbol.",
    inputSchema: {
      type: "object",
      properties: { symbol: { type: "string", description: "SSI symbol e.g. MAG7" } },
      required: ["symbol"],
    },
  },
  {
    name: "ssi_flow_redeem",
    description: "Redeem flow steps for an SSI symbol.",
    inputSchema: {
      type: "object",
      properties: { symbol: { type: "string" } },
      required: ["symbol"],
    },
  },
  {
    name: "ssi_flow_full",
    description: "End-to-end SSI lifecycle flow for a symbol.",
    inputSchema: {
      type: "object",
      properties: { symbol: { type: "string" } },
      required: ["symbol"],
    },
  },
  {
    name: "ssi_balances",
    description: "On-chain SSI balances for a wallet address on Base.",
    inputSchema: {
      type: "object",
      properties: { address: { type: "string", description: "0x wallet" } },
      required: ["address"],
    },
  },
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;
  switch (name) {
    case "ssi_indices":
      return textResult(await hatchFetch("/api/ssi/indices"));
    case "ssi_market_snapshot":
      return textResult(await hatchFetch("/api/ssi/market-snapshot"));
    case "ssi_mag7_constituents":
      return textResult(await hatchFetch("/api/ssi/mag7/constituents"));
    case "ssi_capabilities":
      return textResult(await hatchFetch("/api/ssi/capabilities"));
    case "ssi_flow_mint":
      return textResult(await hatchFetch(`/api/ssi/flows/mint?symbol=${encodeURIComponent(args.symbol)}`));
    case "ssi_flow_redeem":
      return textResult(await hatchFetch(`/api/ssi/flows/redeem?symbol=${encodeURIComponent(args.symbol)}`));
    case "ssi_flow_full":
      return textResult(await hatchFetch(`/api/ssi/flows/full?symbol=${encodeURIComponent(args.symbol)}`));
    case "ssi_balances":
      return textResult(await hatchFetch(`/api/ssi/balances/${args.address}`));
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
