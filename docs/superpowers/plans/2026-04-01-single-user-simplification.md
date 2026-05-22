# Single-User Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Strip multi-user GitHub OAuth and replace with single-user bearer token auth, then deploy.

**Architecture:** Cloudflare Worker with Hono + MCP SDK + Durable Objects. Auth simplified from GitHub OAuth + KV sessions to a static bearer token (`MCP_AUTH_TOKEN` env secret) compared against the `Authorization` header. Hevy API key read directly from `HEVY_API_KEY` env secret.

**Tech Stack:** Hono, @modelcontextprotocol/sdk, agents (Cloudflare), Zod, Vitest

---

## File Structure

### Files to DELETE
- `src/github-handler.ts` — entire OAuth flow (900+ lines)
- `src/workers-oauth-utils.ts` — OAuth UI/approval logic
- `src/utils.ts` — GitHub OAuth helpers + Props type (Props moves to app.ts)
- `src/lib/key-storage.ts` — encrypted per-user KV key storage

### Files to MODIFY
- `src/app.ts` — strip OAuth env vars, remove github-handler import, simplify Env
- `src/middleware/auth.ts` — replace KV session lookup with static token comparison
- `src/mcp-agent.ts` — read HEVY_API_KEY from env directly instead of KV lookup
- `src/routes/utility.ts` — remove /stats, simplify landing page
- `src/routes/mcp.ts` — update Env import (no more OAUTH_KV needed for MCP routes)
- `wrangler.jsonc` — remove KV namespaces, routes, update compatibility_date
- `package.json` — remove @cloudflare/workers-oauth-provider

### Files to KEEP as-is
- `src/index.ts` — entry point
- `src/mcp-handlers.ts` — MCP handler factory
- `src/lib/client.ts` — Hevy API client
- `src/lib/errors.ts` — error formatting
- `src/lib/transforms.ts` — validation/transformation
- `src/lib/schemas.ts` — Zod schemas

### Test files to MODIFY
- `test/app.test.ts` — remove OAuth route tests, update mock env
- `test/middleware/auth.test.ts` — rewrite for static token auth
- `test/routes/utility.test.ts` — update for simplified landing page

### Test files to KEEP as-is
- `test/lib/client.test.ts`
- `test/lib/errors.test.ts`
- `test/lib/schema-transforms.test.ts`
- `test/lib/transforms.test.ts`
- `test/integration/mcp-tools.test.ts`
- `test/routes/mcp.test.ts`

---

### Task 1: Delete OAuth files and remove OAuth dependency

**Files:**
- Delete: `src/github-handler.ts`
- Delete: `src/workers-oauth-utils.ts`
- Delete: `src/utils.ts`
- Delete: `src/lib/key-storage.ts`

- [ ] **Step 1: Remove OAuth dependency**

```bash
cd /Users/samuelkey/Development/hevy-mcp-server
npm remove @cloudflare/workers-oauth-provider
```

- [ ] **Step 2: Delete OAuth source files**

```bash
rm src/github-handler.ts src/workers-oauth-utils.ts src/utils.ts src/lib/key-storage.ts
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "Remove OAuth files and @cloudflare/workers-oauth-provider dependency"
```

---

### Task 2: Simplify app.ts — new Env, remove OAuth routes

**Files:**
- Modify: `src/app.ts`

- [ ] **Step 1: Rewrite src/app.ts**

Replace the entire file with:

```typescript
import { Hono } from "hono";
import { createMcpRoutes } from "./routes/mcp.js";
import utilityRoutes from "./routes/utility.js";
import { mcpHandlers } from "./mcp-handlers.js";
import type { MyMCP } from "./mcp-agent.js";

// Single-user environment — no OAuth, no KV sessions
export interface Env {
  MCP_OBJECT: DurableObjectNamespace<MyMCP>;
  HEVY_API_KEY: string;
  MCP_AUTH_TOKEN: string;
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
app.route("/", createMcpRoutes(mcpHandlers));
app.route("/", utilityRoutes);

// 404 handler
app.notFound((c) => {
  return c.text("Not found", 404);
});

export default app;
```

- [ ] **Step 2: Verify types compile (expect errors in files not yet updated)**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: errors from auth.ts, mcp-agent.ts, routes referencing old types. This is fine — we fix them in subsequent tasks.

- [ ] **Step 3: Commit**

```bash
git add src/app.ts
git commit -m "Simplify app.ts: remove OAuth routes, single-user Env"
```

---

### Task 3: Rewrite auth middleware — static token comparison

**Files:**
- Modify: `src/middleware/auth.ts`

- [ ] **Step 1: Rewrite src/middleware/auth.ts**

Replace the entire file with:

```typescript
import { createMiddleware } from "hono/factory";
import type { Env, Variables } from "../app.js";

/**
 * Bearer token authentication middleware.
 * Compares the Authorization header against the MCP_AUTH_TOKEN secret.
 */
export const bearerAuth = createMiddleware<{ Bindings: Env; Variables: Variables }>(
  async (c, next) => {
    const authHeader = c.req.header("Authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return c.json(
        {
          error: "unauthorized",
          message: "Authentication required. Please provide a valid Bearer token.",
        },
        401,
        {
          "WWW-Authenticate": `Bearer realm="${c.req.url}", error="invalid_token"`,
        }
      );
    }

    const token = authHeader.substring(7);

    if (!token || token !== c.env.MCP_AUTH_TOKEN) {
      return c.json(
        { error: "unauthorized", message: "Invalid token." },
        401
      );
    }

    c.set("authenticated", true);
    await next();
  }
);
```

- [ ] **Step 2: Commit**

```bash
git add src/middleware/auth.ts
git commit -m "Rewrite auth middleware: static bearer token comparison"
```

---

### Task 4: Simplify MCP agent — read HEVY_API_KEY from env

**Files:**
- Modify: `src/mcp-agent.ts`

- [ ] **Step 1: Update the Env interface and init() method in src/mcp-agent.ts**

Replace the Env interface (lines 30-39) with:

```typescript
// Single-user environment
interface Env {
  MCP_OBJECT: DurableObjectNamespace<MyMCP>;
  HEVY_API_KEY: string;
  MCP_AUTH_TOKEN: string;
}
```

Replace the `init()` method's authentication/key-loading block (lines 51-83) with:

```typescript
async init() {
  if (!this.env.HEVY_API_KEY) {
    throw new Error(
      "HEVY_API_KEY not configured. Set it with: wrangler secret put HEVY_API_KEY"
    );
  }

  this.client = new HevyClient({
    apiKey: this.env.HEVY_API_KEY,
  });
```

Remove the import of `getUserApiKey` from `./lib/key-storage.js` and the import of `Props` from `./utils.js`.

Update the class declaration from:
```typescript
export class MyMCP extends McpAgent<Env, Record<string, never>, Props> {
```
to:
```typescript
export class MyMCP extends McpAgent<Env, Record<string, never>, Record<string, never>> {
```

- [ ] **Step 2: Commit**

```bash
git add src/mcp-agent.ts
git commit -m "Simplify MCP agent: read HEVY_API_KEY directly from env"
```

---

### Task 5: Update MCP routes — remove Props/session handling

**Files:**
- Modify: `src/routes/mcp.ts`

- [ ] **Step 1: Rewrite src/routes/mcp.ts**

Replace the entire file with:

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add src/routes/mcp.ts
git commit -m "Simplify MCP routes: remove Props/session context passing"
```

---

### Task 6: Simplify utility routes — remove /stats, clean landing page

**Files:**
- Modify: `src/routes/utility.ts`

- [ ] **Step 1: Rewrite src/routes/utility.ts**

Replace the entire file with:

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add src/routes/utility.ts
git commit -m "Simplify utility routes: remove /stats, JSON landing page"
```

---

### Task 7: Update wrangler.jsonc — remove KV, routes, update compat date

**Files:**
- Modify: `wrangler.jsonc`

- [ ] **Step 1: Rewrite wrangler.jsonc**

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "hevy-mcp-server",
  "main": "src/index.ts",
  "compatibility_date": "2025-03-10",
  "compatibility_flags": ["nodejs_compat"],
  "limits": {
    "cpu_ms": 50
  },
  "migrations": [
    {
      "new_sqlite_classes": ["MyMCP"],
      "tag": "v1"
    }
  ],
  "durable_objects": {
    "bindings": [
      {
        "class_name": "MyMCP",
        "name": "MCP_OBJECT"
      }
    ]
  },
  "observability": {
    "enabled": true
  }
}
```

- [ ] **Step 2: Type-check — should now compile clean**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add wrangler.jsonc
git commit -m "Simplify wrangler config: remove KV, custom domain, dev env"
```

---

### Task 8: Update tests for new auth model

**Files:**
- Modify: `test/middleware/auth.test.ts`
- Modify: `test/app.test.ts`
- Modify: `test/routes/utility.test.ts`

- [ ] **Step 1: Rewrite test/middleware/auth.test.ts**

```typescript
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
        { error: "unauthorized", message: "Invalid token." },
        401
      );
      expect(next).not.toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 2: Rewrite test/app.test.ts**

```typescript
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
```

- [ ] **Step 3: Rewrite test/routes/utility.test.ts**

```typescript
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
```

- [ ] **Step 4: Run all tests**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add test/
git commit -m "Update tests for single-user auth model"
```

---

### Task 9: Update package.json version and verify build

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Bump version to 3.2.0**

In `package.json`, change `"version": "3.1.0"` to `"version": "3.2.0"`.

- [ ] **Step 2: Full verification**

```bash
npx tsc --noEmit && npx vitest run
```

Expected: clean compile, all tests pass.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "Bump version to 3.2.0 — single-user simplification"
```

---

### Task 10: Deploy to Cloudflare Workers

- [ ] **Step 1: Deploy the worker**

```bash
npx wrangler deploy
```

This will create the worker on Cloudflare. Note the URL it returns (e.g., `https://hevy-mcp-server.<subdomain>.workers.dev`).

- [ ] **Step 2: Set secrets**

```bash
# Hevy API key from https://hevy.com/settings?developer
wrangler secret put HEVY_API_KEY
# Generate a random auth token for MCP clients
wrangler secret put MCP_AUTH_TOKEN
```

For MCP_AUTH_TOKEN, generate a random string:
```bash
openssl rand -hex 32
```

- [ ] **Step 3: Verify deployment**

```bash
# Health check — should return JSON
curl https://hevy-mcp-server.<subdomain>.workers.dev/health

# MCP without auth — should return 401
curl https://hevy-mcp-server.<subdomain>.workers.dev/mcp

# MCP with auth — should return MCP protocol response
curl -X POST https://hevy-mcp-server.<subdomain>.workers.dev/mcp \
  -H "Authorization: Bearer <your-mcp-auth-token>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'
```

- [ ] **Step 4: Push all changes**

```bash
git push origin main
```

- [ ] **Step 5: Commit wrangler state if any .wrangler files were created**

Check for any generated files and commit if needed.
