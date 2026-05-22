import { Hono } from "hono";
import { createMcpRoutes } from "./routes/mcp.js";
import utilityRoutes from "./routes/utility.js";
import { mcpHandlers } from "./mcp-handlers.js";
import type { MyMCP } from "./mcp-agent.js";
import oauthRoutes from "./oauth.js";

export interface Env {
  MCP_OBJECT: DurableObjectNamespace<MyMCP>;
  HEVY_API_KEY: string;
  MCP_AUTH_TOKEN: string;
  OAUTH_CLIENT_ID: string;
  OAUTH_CLIENT_SECRET: string;
  OAUTH_KV: KVNamespace;
}

export interface Variables {
  authenticated: boolean;
}

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// Global CORS middleware
app.use("*", async (c, next) => {
  if (c.req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  await next();

  c.res.headers.set("Access-Control-Allow-Origin", "*");
  c.res.headers.set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  c.res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
});

// Error handling
app.onError((err, c) => {
  console.error("Unhandled error:", err);
  return c.json(
    { error: "internal_server_error", message: "An unexpected error occurred" },
    500
  );
});

// Mount routes
app.route("/", oauthRoutes);               // OAuth (highest priority)
app.route("/", createMcpRoutes(mcpHandlers));
app.route("/", utilityRoutes);

// 404 handler
app.notFound((c) => {
  return c.text("Not found", 404);
});

export default app;
