import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ConnectorConfig } from "../config.js";
import { httpJson, toolError, toolJson, withQuery } from "../lib/http.js";

const BASE = "https://api.hubapi.com";
const CONTACT_PROPS = "email,firstname,lastname,company,lifecyclestage,hs_lead_status";
const DEAL_PROPS = "dealname,amount,dealstage,pipeline,closedate";

interface HubSpotObject {
  id: string;
  properties: Record<string, string | null>;
}

interface HubSpotPage {
  results: HubSpotObject[];
  paging?: { next?: { after?: string } };
}

function compactObject(obj: HubSpotObject) {
  return { id: obj.id, ...obj.properties };
}

/**
 * HubSpot CRM tools over a private app access token. Reads register
 * always; create_contact and create_note register only in write mode.
 */
export function registerHubSpot(server: McpServer, config: ConnectorConfig): number {
  const token = config.hubspotToken;
  if (!token) return 0;

  const headers = { authorization: `Bearer ${token}` };
  let count = 0;

  server.registerTool(
    "hubspot_search_contacts",
    {
      title: "Search HubSpot contacts",
      description:
        "Full-text search across contacts by name, email, or company. Returns id plus core properties.",
      inputSchema: {
        query: z.string().min(1).describe("Search text, for example a name or email."),
        limit: z.number().int().min(1).max(50).default(10),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ query, limit }) => {
      try {
        const res = await httpJson<HubSpotPage>({
          method: "POST",
          url: `${BASE}/crm/v3/objects/contacts/search`,
          headers,
          json: { query, limit, properties: CONTACT_PROPS.split(",") },
        });
        return toolJson({ contacts: res.results.map(compactObject) });
      } catch (err) {
        return toolError(err);
      }
    },
  );
  count++;

  server.registerTool(
    "hubspot_get_contact",
    {
      title: "Get a HubSpot contact",
      description: "Fetch one contact by id, including associated deal ids.",
      inputSchema: { contact_id: z.string().describe("HubSpot contact id.") },
      annotations: { readOnlyHint: true },
    },
    async ({ contact_id }) => {
      try {
        const res = await httpJson<
          HubSpotObject & { associations?: { deals?: { results: Array<{ id: string }> } } }
        >({
          url: withQuery(`${BASE}/crm/v3/objects/contacts/${contact_id}`, {
            properties: CONTACT_PROPS,
            associations: "deals",
          }),
          headers,
        });
        return toolJson({
          ...compactObject(res),
          deal_ids: res.associations?.deals?.results.map((d) => d.id) ?? [],
        });
      } catch (err) {
        return toolError(err);
      }
    },
  );
  count++;

  server.registerTool(
    "hubspot_list_deals",
    {
      title: "List HubSpot deals",
      description:
        "Page through deals with name, amount, stage, pipeline, and close date. Pass the returned after cursor to continue.",
      inputSchema: {
        limit: z.number().int().min(1).max(50).default(10),
        after: z.string().optional().describe("Paging cursor from a previous call."),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ limit, after }) => {
      try {
        const res = await httpJson<HubSpotPage>({
          url: withQuery(`${BASE}/crm/v3/objects/deals`, {
            limit,
            after,
            properties: DEAL_PROPS,
          }),
          headers,
        });
        return toolJson({
          deals: res.results.map(compactObject),
          next_after: res.paging?.next?.after ?? null,
        });
      } catch (err) {
        return toolError(err);
      }
    },
  );
  count++;

  server.registerTool(
    "hubspot_get_deal",
    {
      title: "Get a HubSpot deal",
      description: "Fetch one deal by id with its core properties.",
      inputSchema: { deal_id: z.string().describe("HubSpot deal id.") },
      annotations: { readOnlyHint: true },
    },
    async ({ deal_id }) => {
      try {
        const res = await httpJson<HubSpotObject>({
          url: withQuery(`${BASE}/crm/v3/objects/deals/${deal_id}`, {
            properties: DEAL_PROPS,
          }),
          headers,
        });
        return toolJson(compactObject(res));
      } catch (err) {
        return toolError(err);
      }
    },
  );
  count++;

  if (!config.allowWrites) return count;

  server.registerTool(
    "hubspot_create_contact",
    {
      title: "Create a HubSpot contact",
      description: "Create a new contact. Registered because CONNECTOR_ALLOW_WRITES=true.",
      inputSchema: {
        email: z.string().email(),
        first_name: z.string().optional(),
        last_name: z.string().optional(),
        company: z.string().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ email, first_name, last_name, company }) => {
      try {
        const res = await httpJson<HubSpotObject>({
          method: "POST",
          url: `${BASE}/crm/v3/objects/contacts`,
          headers,
          json: {
            properties: {
              email,
              ...(first_name ? { firstname: first_name } : {}),
              ...(last_name ? { lastname: last_name } : {}),
              ...(company ? { company } : {}),
            },
          },
        });
        return toolJson({ created: true, id: res.id });
      } catch (err) {
        return toolError(err);
      }
    },
  );
  count++;

  server.registerTool(
    "hubspot_create_note",
    {
      title: "Add a note to a HubSpot contact",
      description:
        "Attach a timestamped note to a contact. Registered because CONNECTOR_ALLOW_WRITES=true.",
      inputSchema: {
        contact_id: z.string().describe("Contact to attach the note to."),
        body: z.string().min(1).describe("Note text."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ contact_id, body }) => {
      try {
        const res = await httpJson<HubSpotObject>({
          method: "POST",
          url: `${BASE}/crm/v3/objects/notes`,
          headers,
          json: {
            properties: {
              hs_note_body: body,
              hs_timestamp: new Date().toISOString(),
            },
            associations: [
              {
                to: { id: contact_id },
                types: [
                  { associationCategory: "HUBSPOT_DEFINED", associationTypeId: 202 },
                ],
              },
            ],
          },
        });
        return toolJson({ created: true, note_id: res.id, contact_id });
      } catch (err) {
        return toolError(err);
      }
    },
  );
  count++;

  return count;
}
