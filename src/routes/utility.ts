import { Hono } from "hono";
import type { Env, Variables } from "../app.js";

const utilityRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

utilityRoutes.get("/health", (c) => {
  return c.json({
    status: "healthy",
    transport: "streamable-http",
    version: "3.2.0",
  });
});

utilityRoutes.get("/", (c) => {
  return c.json({
    name: "Hevy MCP Server",
    version: "3.2.0",
    transport: "streamable-http",
    endpoints: {
      mcp: "/mcp",
      sse: "/sse",
      health: "/health",
    },
  });
});

export default utilityRoutes;
