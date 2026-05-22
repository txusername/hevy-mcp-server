import { describe, it, expect, beforeEach, vi } from "vitest";
import { bearerAuth } from "../../src/middleware/auth.js";

describe("Bearer Auth Middleware", () => {
  const VALID_TOKEN = "test-auth-token-123";

  describe("Valid Authentication", () => {
    it("should pass through with valid Bearer token", async () => {
      const request = new Request("http://localhost/mcp", {
        method: "POST",
        headers: { Authorization: `Bearer ${VALID_TOKEN}` },
      });

      const mockContext = {
        req: {
          header: (name: string) => request.headers.get(name),
          url: request.url,
        },
        env: { MCP_AUTH_TOKEN: VALID_TOKEN },
        set: vi.fn(),
        json: vi.fn(),
      };

      const next = vi.fn();
      await bearerAuth(mockContext as any, next);

      expect(mockContext.set).toHaveBeenCalledWith("authenticated", true);
      expect(next).toHaveBeenCalled();
    });
  });

  describe("Invalid Authentication", () => {
    it("should return 401 for missing Authorization header", async () => {
      const request = new Request("http://localhost/mcp", { method: "POST" });

      const mockContext = {
        req: {
          header: (name: string) => request.headers.get(name),
          url: request.url,
        },
        env: { MCP_AUTH_TOKEN: VALID_TOKEN },
        set: vi.fn(),
        json: vi.fn().mockReturnValue(new Response()),
      };

      const next = vi.fn();
      await bearerAuth(mockContext as any, next);

      expect(mockContext.json).toHaveBeenCalledWith(
        {
          error: "unauthorized",
          message: "Authentication required. Please provide a valid Bearer token.",
        },
        401,
        { "WWW-Authenticate": `Bearer realm="${request.url}", error="invalid_token"` }
      );
      expect(next).not.toHaveBeenCalled();
    });

    it("should return 401 for wrong token", async () => {
      const request = new Request("http://localhost/mcp", {
        method: "POST",
        headers: { Authorization: "Bearer wrong-token" },
      });

      const mockContext = {
        req: {
          header: (name: string) => request.headers.get(name),
          url: request.url,
        },
        env: { MCP_AUTH_TOKEN: VALID_TOKEN },
        set: vi.fn(),
        json: vi.fn().mockReturnValue(new Response()),
      };

      const next = vi.fn();
      await bearerAuth(mockContext as any, next);

      expect(mockContext.json).toHaveBeenCalledWith(
        { error: "unauthorized", message: "Invalid token." },
        401
      );
      expect(next).not.toHaveBeenCalled();
    });

    it("should return 401 for Basic auth scheme", async () => {
      const request = new Request("http://localhost/mcp", {
        method: "POST",
        headers: { Authorization: "Basic invalid-format" },
      });

      const mockContext = {
        req: {
          header: (name: string) => request.headers.get(name),
          url: request.url,
        },
        env: { MCP_AUTH_TOKEN: VALID_TOKEN },
        set: vi.fn(),
        json: vi.fn().mockReturnValue(new Response()),
      };

      const next = vi.fn();
      await bearerAuth(mockContext as any, next);

      expect(mockContext.json).toHaveBeenCalledWith(
        {
          error: "unauthorized",
          message: "Authentication required. Please provide a valid Bearer token.",
        },
        401,
        { "WWW-Authenticate": `Bearer realm="${request.url}", error="invalid_token"` }
      );
      expect(next).not.toHaveBeenCalled();
    });

    it("should return 401 for empty Bearer token", async () => {
      // Note: fetch API trims trailing whitespace, so "Bearer " becomes "Bearer"
      // which doesn't satisfy startsWith("Bearer "), hitting the missing-token path
      const request = new Request("http://localhost/mcp", {
        method: "POST",
        headers: { Authorization: "Bearer " },
      });

      const mockContext = {
        req: {
          header: (name: string) => request.headers.get(name),
          url: request.url,
        },
        env: { MCP_AUTH_TOKEN: VALID_TOKEN },
        set: vi.fn(),
        json: vi.fn().mockReturnValue(new Response()),
      };

      const next = vi.fn();
      await bearerAuth(mockContext as any, next);

      expect(mockContext.json).toHaveBeenCalledWith(
        {
          error: "unauthorized",
          message: "Authentication required. Please provide a valid Bearer token.",
        },
        401,
        { "WWW-Authenticate": `Bearer realm="${request.url}", error="invalid_token"` }
      );
      expect(next).not.toHaveBeenCalled();
    });
  });
});
