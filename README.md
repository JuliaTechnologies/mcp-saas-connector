# mcp-saas-connector

One MCP server for the SaaS back office. Stripe, HubSpot, and Google Sheets exposed as typed, read-only-by-default tools for Claude and any MCP client.

Most teams that connect an agent to their business systems end up running three separate servers with three different auth stories and three different ideas of what a safe default looks like. This server takes the opposite approach: one process, one configuration surface, one security model, and a tool catalog designed for how agents actually consume data.

## Design principles

- **Read-only by default.** Tools that create or modify data exist, but they register only when you set `CONNECTOR_ALLOW_WRITES=true`. There are no destructive tools at all: nothing deletes, refunds, or overwrites.
- **Token-disciplined responses.** Provider APIs return large payloads. Every tool maps them to the compact set of fields an agent acts on, so a customer lookup costs a few hundred tokens instead of a few thousand.
- **Secrets never reach the model.** Error messages pass through a redaction layer that strips API keys, bearer tokens, and private key material before anything is surfaced.
- **Two dependencies.** The MCP SDK and zod. Google auth is a hand-built RS256 service-account JWT, not the full googleapis client.

## Quickstart

Requires Node 18 or newer.

### Claude Code

```bash
claude mcp add saas \
  --env STRIPE_API_KEY=rk_live_... \
  --env HUBSPOT_ACCESS_TOKEN=pat-... \
  -- npx -y @juliatechnologies/mcp-saas-connector
```

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "saas": {
      "command": "npx",
      "args": ["-y", "@juliatechnologies/mcp-saas-connector"],
      "env": {
        "STRIPE_API_KEY": "rk_live_...",
        "HUBSPOT_ACCESS_TOKEN": "pat-..."
      }
    }
  }
}
```

### From source

```bash
git clone https://github.com/JuliaTechnologies/mcp-saas-connector.git
cd mcp-saas-connector
npm install
npm test
node dist/index.js
```

Providers turn on individually: set a credential and its tools register, leave it unset and they stay off. With no credentials at all the server still starts and exposes `connector_status`, which explains its own setup state.

## Configuration

| Variable | Enables | Notes |
| --- | --- | --- |
| `STRIPE_API_KEY` | Stripe tools | Use a restricted key (`rk_...`) with read permissions |
| `HUBSPOT_ACCESS_TOKEN` | HubSpot tools | Private app token scoped to contacts and deals |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Google Sheets tools | Inline JSON or a path to the key file. Share target sheets with the service account email |
| `CONNECTOR_ALLOW_WRITES` | Write tools | `true` registers the three write tools below. Anything else keeps them off |

## Tool catalog

| Tool | Provider | Mode | What it does |
| --- | --- | --- | --- |
| `connector_status` | core | read | Reports enabled providers and write state |
| `stripe_list_customers` | Stripe | read | List customers, optional exact-email filter |
| `stripe_get_customer` | Stripe | read | One customer with balance and metadata |
| `stripe_list_subscriptions` | Stripe | read | Subscriptions by customer and status |
| `stripe_list_invoices` | Stripe | read | Invoices with totals and hosted links |
| `stripe_list_payment_intents` | Stripe | read | Recent payments with status |
| `hubspot_search_contacts` | HubSpot | read | Full-text contact search |
| `hubspot_get_contact` | HubSpot | read | One contact with associated deal ids |
| `hubspot_list_deals` | HubSpot | read | Deals with stage, amount, cursor paging |
| `hubspot_get_deal` | HubSpot | read | One deal by id |
| `sheets_list_tabs` | Sheets | read | Tabs and grid sizes of a spreadsheet |
| `sheets_read_range` | Sheets | read | Cell values from an A1 range |
| `hubspot_create_contact` | HubSpot | write | Create a contact |
| `hubspot_create_note` | HubSpot | write | Attach a timestamped note to a contact |
| `sheets_append_row` | Sheets | write | Append one row to a tab |

## Security model

The full policy lives in [SECURITY.md](SECURITY.md). The short version: least-privilege credentials are assumed, write tools are an explicit opt-in, secrets are redacted from all output, stdout is reserved for the MCP protocol, and the server sends nothing anywhere except the provider APIs you configure. No telemetry.

## Roadmap

- Streamable HTTP transport for remote deployment behind OAuth
- Per-tool allowlists so operators can expose a subset of a provider
- More providers: Salesforce, Notion, Slack
- An eval harness for tool-call correctness

Issues and pull requests are welcome.

## Who maintains this

[Julia Technologies](https://juliatech.com) is a one-architect consultancy that designs and builds production MCP servers for B2B SaaS products. This connector is the open-source expression of how those servers should be built: narrow tools, safe defaults, disciplined responses. If your product needs to be usable by Claude and other AI agents, [that is the work Julia Technologies does](https://juliatech.com).

## License

MIT. See [LICENSE](LICENSE).
