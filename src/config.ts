import { readFileSync } from "node:fs";

export interface GoogleServiceAccount {
  client_email: string;
  private_key: string;
}

export interface ConnectorConfig {
  stripeApiKey?: string;
  hubspotToken?: string;
  googleServiceAccount?: GoogleServiceAccount;
  allowWrites: boolean;
}

function parseGoogleServiceAccount(raw: string): GoogleServiceAccount {
  const text = raw.trim().startsWith("{") ? raw : readFileSync(raw.trim(), "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_JSON is neither valid JSON nor a readable file path to one.",
    );
  }
  const sa = parsed as Partial<GoogleServiceAccount>;
  if (!sa.client_email || !sa.private_key) {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_JSON must contain client_email and private_key fields.",
    );
  }
  return {
    client_email: sa.client_email,
    // Keys pasted through env files often arrive with escaped newlines.
    private_key: sa.private_key.replace(/\\n/g, "\n"),
  };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ConnectorConfig {
  const config: ConnectorConfig = {
    allowWrites: (env.CONNECTOR_ALLOW_WRITES ?? "").toLowerCase() === "true",
  };
  if (env.STRIPE_API_KEY) config.stripeApiKey = env.STRIPE_API_KEY;
  if (env.HUBSPOT_ACCESS_TOKEN) config.hubspotToken = env.HUBSPOT_ACCESS_TOKEN;
  if (env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    config.googleServiceAccount = parseGoogleServiceAccount(env.GOOGLE_SERVICE_ACCOUNT_JSON);
  }
  return config;
}

export function enabledProviders(config: ConnectorConfig): string[] {
  const enabled: string[] = [];
  if (config.stripeApiKey) enabled.push("stripe");
  if (config.hubspotToken) enabled.push("hubspot");
  if (config.googleServiceAccount) enabled.push("google-sheets");
  return enabled;
}
