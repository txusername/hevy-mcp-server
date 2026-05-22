import { Hono } from "hono";
import { bearerAuth } from "../middleware/auth.js";
import type { Env, Variables } from "../app.js";

export function createMcpRoutes(mcpHandlers: any) {
  const mcpRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

  // Streamable HTTP endpoint
  mcpRoutes.all("/mcp/*", bearerAuth, async (c) => {
    return await mcpHandlers.streamableHTTP.fetch(c.req.raw, c.env, c.executionCtx);
  });

  mcpRoutes.all("/mcp", bearerAuth, async (c) => {
    return await mcpHandlers.streamableHTTP.fetch(c.req.raw, c.env, c.executionCtx);
  });

  // Legacy SSE endpoint
  mcpRoutes.all("/sse/*", bearerAuth, async (c) => {
    return await mcpHandlers.sse.fetch(c.req.raw, c.env, c.executionCtx);
  });

  mcpRoutes.all("/sse", bearerAuth, async (c) => {
    return await mcpHandlers.sse.fetch(c.req.raw, c.env, c.executionCtx);
  });

  return mcpRoutes;
}
