import { describe, it, expect, beforeEach, vi } from "vitest";
import { Hono } from "hono";

vi.mock("../src/mcp-handlers.js", () => ({
  mcpHandlers: {
    streamableHTTP: { fetch: vi.fn() },
    sse: { fetch: vi.fn() },
  },
}));

vi.mock("../src/routes/mcp.js", async () => {
  const { Hono } = await import("hono");
  return {
    createMcpRoutes: vi.fn((handlers: any) => {
      const routes = new Hono();
      routes.all("/mcp", async (c) => {
        const response = await handlers.streamableHTTP.fetch(c.req.raw, c.env, c.executionCtx);
        return response || c.text("MCP response");
      });
      routes.all("/mcp/*", async (c) => {
        const response = await handlers.streamableHTTP.fetch(c.req.raw, c.env, c.executionCtx);
        return response || c.text("MCP response");
      });
      routes.all("/sse", async (c) => {
        const response = await handlers.sse.fetch(c.req.raw, c.env, c.executionCtx);
        return response || c.text("SSE response");
      });
      return routes;
    }),
  };
});

vi.mock("../src/routes/utility.js", async () => {
  const { Hono } = await import("hono");
  const routes = new Hono();
  routes.get("/health", (c) =>
    c.json({ status: "healthy", transport: "streamable-http", version: "3.2.0" })
  );
  routes.get("/", (c) => c.json({ name: "Hevy MCP Server" }));
  return { default: routes };
});

import app from "../src/app.js";
import { mcpHandlers } from "../src/mcp-handlers.js";

describe("Hono App Integration", () => {
  const mockEnv = {
    MCP_OBJECT: {} as any,
    HEVY_API_KEY: "test-key",
    MCP_AUTH_TOKEN: "test-token",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("CORS Middleware", () => {
    it("should handle OPTIONS preflight requests", async () => {
      const request = new Request("http://localhost/mcp", {
        method: "OPTIONS",
        headers: {
          Origin: "https://claude.ai",
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "Content-Type, Authorization",
        },
      });

      const response = await app.fetch(request, mockEnv, {} as any);

      expect(response.status).toBe(204);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
      expect(response.headers.get("Access-Control-Allow-Methods")).toBe(
        "GET, POST, DELETE, OPTIONS"
      );
    });

    it("should add CORS headers to all responses", async () => {
      const request = new Request("http://localhost/health");
      const response = await app.fetch(request, mockEnv, {} as any);

      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    });
  });

  describe("Error Handling", () => {
    it("should handle unhandled errors gracefully", async () => {
      mcpHandlers.streamableHTTP.fetch.mockRejectedValue(new Error("Test error"));

      const request = new Request("http://localhost/mcp", { method: "POST" });
      const response = await app.fetch(request, mockEnv, {} as any);

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data).toEqual({
        error: "internal_server_error",
        message: "An unexpected error occurred",
      });
    });
  });

  describe("Route Ordering", () => {
    it("should route MCP requests to MCP handlers", async () => {
      mcpHandlers.streamableHTTP.fetch.mockResolvedValue(new Response("MCP response"));

      const request = new Request("http://localhost/mcp", { method: "POST" });
      const response = await app.fetch(request, mockEnv, {} as any);

      expect(mcpHandlers.streamableHTTP.fetch).toHaveBeenCalled();
      expect(await response.text()).toBe("MCP response");
    });

    it("should route utility requests to utility handlers", async () => {
      const request = new Request("http://localhost/health");
      const response = await app.fetch(request, mockEnv, {} as any);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.status).toBe("healthy");
    });
  });

  describe("404 Handling", () => {
    it("should return 404 for unknown routes", async () => {
      const request = new Request("http://localhost/unknown-route");
      const response = await app.fetch(request, mockEnv, {} as any);

      expect(response.status).toBe(404);
    });
  });
});
