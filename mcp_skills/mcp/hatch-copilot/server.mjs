#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { apiBase, profileHeaders, textResult } from "../shared/client.mjs";

const server = new Server(
  { name: "hatch-copilot", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

const tools = [
  {
    name: "copilot_health",
    description: "Investment Copilot provider health and failover status.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "copilot_ask",
    description:
      "Ask the HATCH Investment Copilot a grounded question (portfolio, SSI, markets, lessons). Requires HATCH_JWT.",
    inputSchema: {
      type: "object",
      properties: {
        message: { type: "string", description: "User question" },
        childId: { type: "string", description: "Optional child context UUID" },
      },
      required: ["message"],
    },
  },
  {
    name: "projections_assumptions",
    description: "Public projection assumption presets for family investing scenarios.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "metrics_snapshot",
    description: "Live HATCH operational metrics (jobs, relay, AI).",
    inputSchema: { type: "object", properties: {} },
  },
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;
  switch (name) {
    case "copilot_health":
      return textResult(await fetchJson("/api/ai/health"));
    case "copilot_ask": {
      const jwt = process.env.HATCH_JWT;
      if (!jwt) throw new Error("HATCH_JWT required for copilot_ask");
      const body = { message: args.message };
      if (args.childId) body.childId = args.childId;
      return textResult(
        await fetchJson("/api/ai/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
          body: JSON.stringify(body),
        })
      );
    }
    case "projections_assumptions":
      return textResult(await fetchJson("/api/projections/assumptions"));
    case "metrics_snapshot":
      return textResult(await fetchJson("/api/metrics"));
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

async function fetchJson(path, init = {}) {
  const url = `${apiBase()}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: { Accept: "application/json", ...profileHeaders(), ...(init.headers || {}) },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`HATCH ${res.status}: ${text}`);
  return body;
}

const transport = new StdioServerTransport();
await server.connect(transport);
