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
