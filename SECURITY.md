# Security

## Model

- Read-only by default. Tools that create or modify data register only when
  CONNECTOR_ALLOW_WRITES=true is set explicitly.
- No destructive tools. There are no delete or refund operations in any provider.
- Credentials never appear in tool output. Error messages pass through a
  redaction layer that strips API keys, bearer tokens, and private key material.
- stdout is reserved for the MCP protocol. All logging goes to stderr.
- No telemetry. The server talks to the provider APIs you configure and to
  nothing else.

## Recommendations

- Use the narrowest credential each provider offers: a Stripe restricted key
  with read permissions, a HubSpot private app scoped to the objects you need,
  a Google service account shared only with the specific spreadsheets.
- Keep writes off unless an agent workflow needs them, and review which write
  tools exist before enabling.

## Reporting

Report vulnerabilities to security@juliatech.com. Expect an acknowledgment
within 48 hours.
