import { createSign } from "node:crypto";
import type { GoogleServiceAccount } from "../config.js";
import { httpJson } from "./http.js";

const TOKEN_URL = "https://oauth2.googleapis.com/token";

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

interface CachedToken {
  token: string;
  expiresAt: number; // epoch ms
}

/**
 * Mints and caches Google OAuth access tokens from a service account,
 * using a hand-built RS256 JWT. This keeps the dependency tree at two
 * packages instead of pulling in the full googleapis client.
 */
export class GoogleTokenSource {
  private cache?: CachedToken;

  constructor(
    private readonly account: GoogleServiceAccount,
    private readonly scope: string,
  ) {}

  async accessToken(): Promise<string> {
    const now = Date.now();
    if (this.cache && this.cache.expiresAt - 60_000 > now) {
      return this.cache.token;
    }
    const iat = Math.floor(now / 1000);
    const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const claims = base64url(
      JSON.stringify({
        iss: this.account.client_email,
        scope: this.scope,
        aud: TOKEN_URL,
        iat,
        exp: iat + 3600,
      }),
    );
    const signingInput = `${header}.${claims}`;
    const signature = createSign("RSA-SHA256")
      .update(signingInput)
      .sign(this.account.private_key);
    const assertion = `${signingInput}.${base64url(signature)}`;

    const response = await httpJson<{ access_token: string; expires_in: number }>({
      method: "POST",
      url: TOKEN_URL,
      form: {
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      },
    });
    this.cache = {
      token: response.access_token,
      expiresAt: now + response.expires_in * 1000,
    };
    return response.access_token;
  }
}
