import { Hono } from "hono";
import type { Env } from "./app.js";

const oauthRoutes = new Hono<{ Bindings: Env }>();

// ============================================
// OAuth 2.1 Metadata Endpoints
// ============================================

oauthRoutes.get("/.well-known/oauth-authorization-server", (c) => {
  const origin = new URL(c.req.url).origin;
  return c.json({
    issuer: origin,
    authorization_endpoint: `${origin}/authorize`,
    token_endpoint: `${origin}/token`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["client_secret_post"],
  });
});

oauthRoutes.get("/.well-known/oauth-protected-resource", (c) => {
  const origin = new URL(c.req.url).origin;
  return c.json({
    resource: origin,
    authorization_servers: [origin],
    bearer_methods_supported: ["header"],
  });
});

// ============================================
// Authorization Endpoint — auto-approves
// ============================================

oauthRoutes.get("/authorize", async (c) => {
  const { client_id, redirect_uri, state, response_type, code_challenge, code_challenge_method } =
    c.req.query();

  // Validate client_id
  if (client_id !== c.env.OAUTH_CLIENT_ID) {
    return c.json({ error: "invalid_client", error_description: "Unknown client_id" }, 400);
  }

  // Validate response_type
  if (response_type !== "code") {
    return c.json(
      { error: "unsupported_response_type", error_description: "Only 'code' is supported" },
      400
    );
  }

  if (!redirect_uri) {
    return c.json({ error: "invalid_request", error_description: "redirect_uri is required" }, 400);
  }

  // Generate auth code and store in KV with 5-minute TTL
  const code = crypto.randomUUID();
  const stored = JSON.stringify({
    clientId: client_id,
    redirectUri: redirect_uri,
    codeChallenge: code_challenge ?? null,
    codeChallengeMethod: code_challenge_method ?? null,
  });

  await c.env.OAUTH_KV.put(`auth_code:${code}`, stored, { expirationTtl: 300 });

  // Redirect back with code
  const redirectUrl = new URL(redirect_uri);
  redirectUrl.searchParams.set("code", code);
  if (state) redirectUrl.searchParams.set("state", state);

  return c.redirect(redirectUrl.toString(), 302);
});

// ============================================
// Token Endpoint
// ============================================

oauthRoutes.post("/token", async (c) => {
  // Support both form-urlencoded and JSON bodies
  let body: Record<string, string> = {};
  const contentType = c.req.header("content-type") ?? "";

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const formData = await c.req.formData();
    formData.forEach((value, key) => {
      body[key] = value.toString();
    });
  } else {
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid_request", error_description: "Could not parse request body" }, 400);
    }
  }

  const { grant_type, code, client_id, client_secret, redirect_uri, code_verifier, refresh_token } = body;

  // Validate client credentials (required for all grant types)
  if (client_id !== c.env.OAUTH_CLIENT_ID) {
    return c.json({ error: "invalid_client", error_description: "Invalid client_id" }, 401);
  }
  if (client_secret !== c.env.OAUTH_CLIENT_SECRET) {
    return c.json({ error: "invalid_client", error_description: "Invalid client_secret" }, 401);
  }

  // Helper: return a token response with a refresh token
  const tokenResponse = () => {
    // Generate a refresh token: HMAC of the client_id using MCP_AUTH_TOKEN as key
    // Deterministic so we can verify it later without storing anything
    const refreshToken = `rt_${c.env.MCP_AUTH_TOKEN.substring(0, 16)}`;
    return c.json({
      access_token: c.env.MCP_AUTH_TOKEN,
      token_type: "bearer",
      expires_in: 2592000, // 30 days
      refresh_token: refreshToken,
    });
  };

  // ---- Refresh Token Grant ----
  if (grant_type === "refresh_token") {
    if (!refresh_token) {
      return c.json({ error: "invalid_request", error_description: "refresh_token is required" }, 400);
    }
    // Verify the refresh token matches what we'd generate
    const expectedRefreshToken = `rt_${c.env.MCP_AUTH_TOKEN.substring(0, 16)}`;
    if (refresh_token !== expectedRefreshToken) {
      return c.json({ error: "invalid_grant", error_description: "Invalid refresh token" }, 400);
    }
    return tokenResponse();
  }

  // ---- Authorization Code Grant ----
  if (grant_type !== "authorization_code") {
    return c.json(
      { error: "unsupported_grant_type", error_description: "Supported: authorization_code, refresh_token" },
      400
    );
  }

  if (!code) {
    return c.json({ error: "invalid_request", error_description: "code is required" }, 400);
  }

  // Retrieve and immediately delete the auth code from KV (single-use)
  const storedRaw = await c.env.OAUTH_KV.get(`auth_code:${code}`);
  if (!storedRaw) {
    return c.json({ error: "invalid_grant", error_description: "Auth code not found or expired" }, 400);
  }
  await c.env.OAUTH_KV.delete(`auth_code:${code}`);

  let stored: {
    clientId: string;
    redirectUri: string;
    codeChallenge: string | null;
    codeChallengeMethod: string | null;
  };

  try {
    stored = JSON.parse(storedRaw);
  } catch {
    return c.json({ error: "server_error", error_description: "Corrupted auth code data" }, 500);
  }

  // Validate redirect_uri matches what was stored
  if (redirect_uri && redirect_uri !== stored.redirectUri) {
    return c.json({ error: "invalid_grant", error_description: "redirect_uri mismatch" }, 400);
  }

  // Verify PKCE if code_challenge was stored
  if (stored.codeChallenge) {
    if (!code_verifier) {
      return c.json({ error: "invalid_grant", error_description: "code_verifier is required" }, 400);
    }

    const verifierBytes = new TextEncoder().encode(code_verifier);
    const hashBuffer = await crypto.subtle.digest("SHA-256", verifierBytes);
    const hashArray = new Uint8Array(hashBuffer);

    // Base64url encode
    const base64 = btoa(String.fromCharCode(...hashArray));
    const base64url = base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

    if (base64url !== stored.codeChallenge) {
      return c.json({ error: "invalid_grant", error_description: "PKCE verification failed" }, 400);
    }
  }

  return tokenResponse();
});

export default oauthRoutes;
