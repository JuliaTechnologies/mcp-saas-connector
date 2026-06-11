import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ConnectorConfig } from "../config.js";
import { GoogleTokenSource } from "../lib/google-auth.js";
import { httpJson, toolError, toolJson } from "../lib/http.js";

const BASE = "https://sheets.googleapis.com/v4/spreadsheets";
const SCOPE_READ = "https://www.googleapis.com/auth/spreadsheets.readonly";
const SCOPE_WRITE = "https://www.googleapis.com/auth/spreadsheets";

/**
 * Builds an A1 reference, quoting tab names that need it. Exported for tests.
 */
export function buildA1(range: string, tab?: string): string {
  if (!tab) return range;
  const quoted = `'${tab.replace(/'/g, "''")}'`;
  return `${quoted}!${range}`;
}

const cellValue = z.union([z.string(), z.number(), z.boolean(), z.null()]);

/**
 * Google Sheets tools over a service account. The token scope follows the
 * write flag: read-only credentials are requested unless writes are enabled.
 */
export function registerSheets(server: McpServer, config: ConnectorConfig): number {
  const account = config.googleServiceAccount;
  if (!account) return 0;

  const tokens = new GoogleTokenSource(
    account,
    config.allowWrites ? SCOPE_WRITE : SCOPE_READ,
  );
  const authHeaders = async () => ({
    authorization: `Bearer ${await tokens.accessToken()}`,
  });
  let count = 0;

  server.registerTool(
    "sheets_list_tabs",
    {
      title: "List spreadsheet tabs",
      description:
        "List the tabs of a spreadsheet with their grid sizes. Share the sheet with the service account email first.",
      inputSchema: {
        spreadsheet_id: z.string().describe("The id from the spreadsheet URL."),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ spreadsheet_id }) => {
      try {
        const res = await httpJson<{
          properties?: { title?: string };
          sheets?: Array<{
            properties?: {
              title?: string;
              sheetId?: number;
              gridProperties?: { rowCount?: number; columnCount?: number };
            };
          }>;
        }>({
          url: `${BASE}/${spreadsheet_id}?fields=properties.title,sheets.properties`,
          headers: await authHeaders(),
        });
        return toolJson({
          title: res.properties?.title,
          tabs: (res.sheets ?? []).map((s) => ({
            title: s.properties?.title,
            sheet_id: s.properties?.sheetId,
            rows: s.properties?.gridProperties?.rowCount,
            columns: s.properties?.gridProperties?.columnCount,
          })),
        });
      } catch (err) {
        return toolError(err);
      }
    },
  );
  count++;

  server.registerTool(
    "sheets_read_range",
    {
      title: "Read a spreadsheet range",
      description:
        "Read cell values from an A1 range, for example A1:D20. Pass tab to target a specific sheet.",
      inputSchema: {
        spreadsheet_id: z.string().describe("The id from the spreadsheet URL."),
        range: z.string().describe("A1 notation range, for example A1:D20."),
        tab: z.string().optional().describe("Tab name. Defaults to the first tab."),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ spreadsheet_id, range, tab }) => {
      try {
        const a1 = encodeURIComponent(buildA1(range, tab));
        const res = await httpJson<{ range?: string; values?: unknown[][] }>({
          url: `${BASE}/${spreadsheet_id}/values/${a1}`,
          headers: await authHeaders(),
        });
        return toolJson({ range: res.range, values: res.values ?? [] });
      } catch (err) {
        return toolError(err);
      }
    },
  );
  count++;

  if (!config.allowWrites) return count;

  server.registerTool(
    "sheets_append_row",
    {
      title: "Append a row to a spreadsheet",
      description:
        "Append one row of values to the end of a tab. Registered because CONNECTOR_ALLOW_WRITES=true.",
      inputSchema: {
        spreadsheet_id: z.string().describe("The id from the spreadsheet URL."),
        tab: z.string().describe("Tab name to append to."),
        values: z.array(cellValue).min(1).describe("Cell values for the new row, left to right."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ spreadsheet_id, tab, values }) => {
      try {
        const a1 = encodeURIComponent(buildA1("A1", tab));
        const res = await httpJson<{
          updates?: { updatedRange?: string; updatedRows?: number };
        }>({
          method: "POST",
          url: `${BASE}/${spreadsheet_id}/values/${a1}:append?valueInputOption=USER_ENTERED`,
          headers: await authHeaders(),
          json: { values: [values] },
        });
        return toolJson({
          appended: true,
          updated_range: res.updates?.updatedRange,
          updated_rows: res.updates?.updatedRows,
        });
      } catch (err) {
        return toolError(err);
      }
    },
  );
  count++;

  return count;
}
