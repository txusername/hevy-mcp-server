import { describe, it, expect } from "vitest";
import utilityRoutes from "../../src/routes/utility.js";

describe("Utility Routes", () => {
  const mockEnv = {} as any;
  const mockCtx = {} as any;

  describe("Health Check", () => {
    it("should return health status", async () => {
      const request = new Request("http://localhost/health");
      const response = await utilityRoutes.fetch(request, mockEnv, mockCtx);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({
        status: "healthy",
        transport: "streamable-http",
        version: "3.2.0",
      });
    });
  });

  describe("Root endpoint", () => {
    it("should return JSON server info", async () => {
      const request = new Request("http://localhost/");
      const response = await utilityRoutes.fetch(request, mockEnv, mockCtx);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.name).toBe("Hevy MCP Server");
      expect(data.version).toBe("3.2.0");
      expect(data.endpoints.mcp).toBe("/mcp");
    });
  });

  describe("404 Handling", () => {
    it("should return 404 for unknown routes", async () => {
      const request = new Request("http://localhost/unknown");
      const response = await utilityRoutes.fetch(request, mockEnv, mockCtx);
      expect(response.status).toBe(404);
    });
  });
});
