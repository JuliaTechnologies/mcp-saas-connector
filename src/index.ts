#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { enabledProviders, loadConfig } from "./config.js";
import { toolJson } from "./lib/http.js";
import { registerHubSpot } from "./providers/hubspot.js";
import { registerSheets } from "./providers/sheets.js";
import { registerStripe } from "./providers/stripe.js";

const VERSION = "0.1.0";

async function main(): Promise<void> {
  const config = loadConfig();
  const providers = enabledProviders(config);

  const server = new McpServer({ name: "mcp-saas-connector", version: VERSION });

  // Always registered, so a fresh install has something to call and the
  // agent can explain its own configuration state to the user.
  server.registerTool(
    "connector_status",
    {
      title: "Connector status",
      description:
        "Report which providers are enabled, whether write tools are registered, and how to enable more.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () =>
      toolJson({
        version: VERSION,
        enabled_providers: providers,
        write_tools_registered: config.allowWrites,
        setup:
          providers.length === 3
            ? "All providers enabled."
            : "Set STRIPE_API_KEY, HUBSPOT_ACCESS_TOKEN, or GOOGLE_SERVICE_ACCOUNT_JSON to enable more providers. See .env.example.",
      }),
  );

  let toolCount = 1;
  toolCount += registerStripe(server, config);
  toolCount += registerHubSpot(server, config);
  toolCount += registerSheets(server, config);

  // stdout belongs to the MCP protocol. Everything human-facing goes to stderr.
  console.error(
    `mcp-saas-connector ${VERSION}: ${toolCount} tools registered ` +
      `(providers: ${providers.length ? providers.join(", ") : "none"}; ` +
      `writes: ${config.allowWrites ? "on" : "off"})`,
  );
  if (providers.length === 0) {
    console.error(
      "No provider credentials found. Copy .env.example and set at least one of " +
        "STRIPE_API_KEY, HUBSPOT_ACCESS_TOKEN, GOOGLE_SERVICE_ACCOUNT_JSON.",
    );
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("mcp-saas-connector failed to start:", err instanceof Error ? err.message : err);
  process.exit(1);
});
