#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { hatchFetch, textResult } from "../shared/client.mjs";

const server = new Server(
  { name: "hatch-portfolio", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

const tools = [
  {
    name: "portfolio_get",
    description:
      "Fetch live family SoDEX spot portfolio for a child (ownership: family_shared_spot_account, parent-owned).",
    inputSchema: {
      type: "object",
      properties: {
        childId: { type: "string", description: "Child UUID from HATCH" },
      },
      required: ["childId"],
    },
  },
  {
    name: "portfolio_history",
    description: "Historical portfolio snapshots for a child.",
    inputSchema: {
      type: "object",
      properties: {
        childId: { type: "string" },
        limit: { type: "number", default: 30 },
      },
      required: ["childId"],
    },
  },
  {
    name: "portfolio_transactions",
    description: "Signed orders and activity receipts attributed to a child.",
    inputSchema: {
      type: "object",
      properties: {
        childId: { type: "string" },
        limit: { type: "number", default: 50 },
      },
      required: ["childId"],
    },
  },
  {
    name: "children_list",
    description: "List children on the authenticated parent account.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "health_check",
    description: "HATCH API health and custody metadata.",
    inputSchema: { type: "object", properties: {} },
  },
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;
  switch (name) {
    case "portfolio_get":
      return textResult(await hatchFetch(`/api/portfolio/${args.childId}`));
    case "portfolio_history": {
      const q = args.limit ? `?limit=${args.limit}` : "";
      return textResult(await hatchFetch(`/api/portfolio/${args.childId}/history${q}`));
    }
    case "portfolio_transactions": {
      const q = args.limit ? `?limit=${args.limit}` : "";
      return textResult(await hatchFetch(`/api/portfolio/${args.childId}/transactions${q}`));
    }
    case "children_list":
      return textResult(await hatchFetch("/api/children"));
    case "health_check":
      return textResult(await hatchFetch("/api/health"));
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
