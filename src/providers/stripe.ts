import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ConnectorConfig } from "../config.js";
import { httpJson, toolError, toolJson, unixToIso, withQuery } from "../lib/http.js";

const BASE = "https://api.stripe.com/v1";

const limitParam = z.number().int().min(1).max(50).default(10)
  .describe("Maximum results to return, 1 to 50.");

interface StripeList<T> {
  data: T[];
  has_more: boolean;
}

/**
 * Read-only Stripe tools. Responses are mapped to compact objects so an
 * agent gets the fields it acts on, not the full Stripe payload.
 */
export function registerStripe(server: McpServer, config: ConnectorConfig): number {
  const key = config.stripeApiKey;
  if (!key) return 0;

  const headers = { authorization: `Bearer ${key}` };
  const get = <T>(path: string, params: Record<string, string | number | undefined>) =>
    httpJson<T>({ url: withQuery(`${BASE}${path}`, params), headers });

  server.registerTool(
    "stripe_list_customers",
    {
      title: "List Stripe customers",
      description:
        "List customers, optionally filtered by exact email. Returns id, email, name, created, currency, delinquent.",
      inputSchema: {
        email: z.string().email().optional().describe("Exact email to filter by."),
        limit: limitParam,
      },
      annotations: { readOnlyHint: true },
    },
    async ({ email, limit }) => {
      try {
        const res = await get<StripeList<Record<string, unknown>>>("/customers", {
          email,
          limit,
        });
        return toolJson({
          has_more: res.has_more,
          customers: res.data.map((c) => ({
            id: c.id,
            email: c.email,
            name: c.name,
            created: unixToIso(c.created as number),
            currency: c.currency,
            delinquent: c.delinquent,
          })),
        });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "stripe_get_customer",
    {
      title: "Get a Stripe customer",
      description: "Fetch one customer by id, including balance and metadata.",
      inputSchema: {
        customer_id: z.string().describe("Stripe customer id, for example cus_123."),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ customer_id }) => {
      try {
        const c = await get<Record<string, unknown>>(`/customers/${customer_id}`, {});
        return toolJson({
          id: c.id,
          email: c.email,
          name: c.name,
          description: c.description,
          created: unixToIso(c.created as number),
          currency: c.currency,
          balance: c.balance,
          delinquent: c.delinquent,
          metadata: c.metadata,
        });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "stripe_list_subscriptions",
    {
      title: "List Stripe subscriptions",
      description:
        "List subscriptions, optionally filtered by customer and status. Returns status, period end, items, and cancellation flag.",
      inputSchema: {
        customer_id: z.string().optional().describe("Filter to one customer."),
        status: z
          .enum(["active", "trialing", "past_due", "canceled", "unpaid", "all"])
          .default("all")
          .describe("Subscription status filter."),
        limit: limitParam,
      },
      annotations: { readOnlyHint: true },
    },
    async ({ customer_id, status, limit }) => {
      try {
        const res = await get<StripeList<Record<string, unknown>>>("/subscriptions", {
          customer: customer_id,
          status,
          limit,
        });
        return toolJson({
          has_more: res.has_more,
          subscriptions: res.data.map((s) => {
            const items = (s.items as { data?: Array<Record<string, unknown>> })?.data ?? [];
            return {
              id: s.id,
              customer: s.customer,
              status: s.status,
              current_period_end: unixToIso(s.current_period_end as number),
              cancel_at_period_end: s.cancel_at_period_end,
              items: items.map((item) => {
                const price = item.price as Record<string, unknown> | undefined;
                return {
                  price_id: price?.id,
                  nickname: price?.nickname,
                  unit_amount: price?.unit_amount,
                  currency: price?.currency,
                  interval: (price?.recurring as Record<string, unknown>)?.interval,
                };
              }),
            };
          }),
        });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "stripe_list_invoices",
    {
      title: "List Stripe invoices",
      description:
        "List invoices, optionally filtered by customer and status. Returns totals, status, and hosted invoice links.",
      inputSchema: {
        customer_id: z.string().optional().describe("Filter to one customer."),
        status: z
          .enum(["draft", "open", "paid", "uncollectible", "void"])
          .optional()
          .describe("Invoice status filter."),
        limit: limitParam,
      },
      annotations: { readOnlyHint: true },
    },
    async ({ customer_id, status, limit }) => {
      try {
        const res = await get<StripeList<Record<string, unknown>>>("/invoices", {
          customer: customer_id,
          status,
          limit,
        });
        return toolJson({
          has_more: res.has_more,
          invoices: res.data.map((inv) => ({
            id: inv.id,
            customer: inv.customer,
            status: inv.status,
            total: inv.total,
            amount_due: inv.amount_due,
            currency: inv.currency,
            created: unixToIso(inv.created as number),
            hosted_invoice_url: inv.hosted_invoice_url,
          })),
        });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "stripe_list_payment_intents",
    {
      title: "List Stripe payment intents",
      description:
        "List recent payment intents, optionally filtered by customer. Returns amount, currency, and status.",
      inputSchema: {
        customer_id: z.string().optional().describe("Filter to one customer."),
        limit: limitParam,
      },
      annotations: { readOnlyHint: true },
    },
    async ({ customer_id, limit }) => {
      try {
        const res = await get<StripeList<Record<string, unknown>>>("/payment_intents", {
          customer: customer_id,
          limit,
        });
        return toolJson({
          has_more: res.has_more,
          payment_intents: res.data.map((pi) => ({
            id: pi.id,
            customer: pi.customer,
            amount: pi.amount,
            currency: pi.currency,
            status: pi.status,
            created: unixToIso(pi.created as number),
          })),
        });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  return 5;
}
