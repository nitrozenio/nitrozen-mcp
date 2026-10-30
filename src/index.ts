import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const API_BASE = "https://nitrozen.io/api/v1";

interface Env {
  NitrozenMcpAgent: DurableObjectNamespace;
}

type Props = {
  token: string;
  [key: string]: unknown;
};

export class NitrozenMcpAgent extends McpAgent<Env, never, Props> {
  server = new McpServer({
    name: "nitrozen",
    version: "1.0.0",
  });

  async init() {
    const token = () => this.props!.token;

    const api = async (
      method: string,
      path: string,
      body?: unknown,
      auth = true
    ) => {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Accept: "application/json",
      };
      if (auth) headers["Authorization"] = `Bearer ${token()}`;

      const res = await fetch(`${API_BASE}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });

      if (res.status === 204) return null;

      const json = await res.json();
      if (!res.ok) {
        const msg = (json as any)?.message ?? res.statusText;
        throw new Error(`${res.status}: ${msg}`);
      }
      return json;
    };

    // ── Users ──────────────────────────────────────────────────────────────

    this.server.registerTool(
      "get_user",
      {
        description: "Get the authenticated user's profile and plan details.",
        inputSchema: {},
      },
      async () => {
        const data = await api("GET", "/user");
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }
    );

    this.server.registerTool(
      "get_usage",
      {
        description: "Get current usage statistics and plan limits.",
        inputSchema: {},
      },
      async () => {
        const data = await api("GET", "/user/usage");
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }
    );

    // ── Projects ───────────────────────────────────────────────────────────

    this.server.registerTool(
      "list_projects",
      {
        description: "List all changelog projects owned by the authenticated user. Each project includes public_url, the address of its public changelog page (verified custom domain, or https://nitrozen.io/c/<slug>).",
        inputSchema: {},
      },
      async () => {
        const data = await api("GET", "/projects");
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }
    );

    this.server.registerTool(
      "create_project",
      {
        description: "Create a new changelog project. The slug is auto-generated from the name.",
        inputSchema: {
          name: z.string().max(255).describe("Project name"),
          description: z.string().max(1000).optional().describe("Optional project description"),
        },
      },
      async ({ name, description }) => {
        const data = await api("POST", "/projects", { name, description });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }
    );

    this.server.registerTool(
      "get_project",
      {
        description: "Get a single changelog project by ID, including public_url (the public changelog page address).",
        inputSchema: {
          project_id: z.number().int().describe("Project ID"),
        },
      },
      async ({ project_id }) => {
        const data = await api("GET", `/projects/${project_id}`);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }
    );

    this.server.registerTool(
      "update_project",
      {
        description: "Update a changelog project's name or description.",
        inputSchema: {
          project_id: z.number().int().describe("Project ID"),
          name: z.string().max(255).optional().describe("New project name"),
          description: z.string().max(1000).nullable().optional().describe("New description (null to clear)"),
        },
      },
      async ({ project_id, name, description }) => {
        const body: Record<string, unknown> = {};
        if (name !== undefined) body.name = name;
        if (description !== undefined) body.description = description;
        const data = await api("PUT", `/projects/${project_id}`, body);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }
    );

    this.server.registerTool(
      "delete_project",
      {
        description: "Permanently delete a changelog project and all its entries.",
        inputSchema: {
          project_id: z.number().int().describe("Project ID"),
        },
      },
      async ({ project_id }) => {
        await api("DELETE", `/projects/${project_id}`);
        return { content: [{ type: "text", text: `Project ${project_id} deleted.` }] };
      }
    );

    // ── Entries ────────────────────────────────────────────────────────────

    this.server.registerTool(
      "list_entries",
      {
        description: "List changelog entries for a project. Supports pagination.",
        inputSchema: {
          project_id: z.number().int().describe("Project ID"),
          page: z.number().int().optional().describe("Page number (default: 1)"),
          per_page: z.number().int().optional().describe("Results per page (default: 15)"),
        },
      },
      async ({ project_id, page, per_page }) => {
        const params = new URLSearchParams();
        if (page !== undefined) params.set("page", String(page));
        if (per_page !== undefined) params.set("per_page", String(per_page));
        const qs = params.toString() ? `?${params}` : "";
        const data = await api("GET", `/projects/${project_id}/entries${qs}`);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }
    );

    this.server.registerTool(
      "create_entry",
      {
        description: "Create a new changelog entry for a project.",
        inputSchema: {
          project_id: z.number().int().describe("Project ID"),
          title: z.string().max(255).describe("Entry title"),
          content: z.string().describe("Entry content (Markdown)"),
          category: z
            .string()
            .describe(
              "Entry category slug. Every project has the built-in categories 'new', " +
                "'improvement', 'fix', and 'announcement'; projects with custom categories " +
                "enabled may also have additional project-specific slugs."
            ),
          is_published: z.boolean().optional().describe("Publish immediately (default: false)"),
          published_at: z
            .string()
            .optional()
            .describe("ISO 8601 publish date (defaults to now if is_published is true)"),
        },
      },
      async ({ project_id, title, content, category, is_published, published_at }) => {
        const body: Record<string, unknown> = { title, content, category };
        if (is_published !== undefined) body.is_published = is_published;
        if (published_at !== undefined) body.published_at = published_at;
        const data = await api("POST", `/projects/${project_id}/entries`, body);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }
    );

    this.server.registerTool(
      "get_entry",
      {
        description: "Get a single changelog entry by project and entry ID.",
        inputSchema: {
          project_id: z.number().int().describe("Project ID"),
          entry_id: z.number().int().describe("Entry ID"),
        },
      },
      async ({ project_id, entry_id }) => {
        const data = await api("GET", `/projects/${project_id}/entries/${entry_id}`);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }
    );

    this.server.registerTool(
      "update_entry",
      {
        description: "Update a changelog entry's title, content, category, or publish status.",
        inputSchema: {
          project_id: z.number().int().describe("Project ID"),
          entry_id: z.number().int().describe("Entry ID"),
          title: z.string().max(255).optional().describe("New title"),
          content: z.string().optional().describe("New content (Markdown)"),
          category: z
            .string()
            .optional()
            .describe(
              "New category slug. Every project has the built-in categories 'new', " +
                "'improvement', 'fix', and 'announcement'; projects with custom categories " +
                "enabled may also have additional project-specific slugs."
            ),
          is_published: z.boolean().optional().describe("Publish or unpublish the entry"),
          published_at: z.string().nullable().optional().describe("ISO 8601 publish date"),
        },
      },
      async ({ project_id, entry_id, title, content, category, is_published, published_at }) => {
        const body: Record<string, unknown> = {};
        if (title !== undefined) body.title = title;
        if (content !== undefined) body.content = content;
        if (category !== undefined) body.category = category;
        if (is_published !== undefined) body.is_published = is_published;
        if (published_at !== undefined) body.published_at = published_at;
        const data = await api("PUT", `/projects/${project_id}/entries/${entry_id}`, body);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }
    );

    this.server.registerTool(
      "delete_entry",
      {
        description: "Permanently delete a changelog entry.",
        inputSchema: {
          project_id: z.number().int().describe("Project ID"),
          entry_id: z.number().int().describe("Entry ID"),
        },
      },
      async ({ project_id, entry_id }) => {
        await api("DELETE", `/projects/${project_id}/entries/${entry_id}`);
        return { content: [{ type: "text", text: `Entry ${entry_id} deleted.` }] };
      }
    );

    // ── API Tokens ─────────────────────────────────────────────────────────

    this.server.registerTool(
      "list_tokens",
      {
        description: "List all API tokens for the authenticated user.",
        inputSchema: {},
      },
      async () => {
        const data = await api("GET", "/tokens");
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }
    );

    this.server.registerTool(
      "create_token",
      {
        description: "Create a new API token. The plain-text token is only returned once.",
        inputSchema: {
          name: z.string().describe("A descriptive label for the token"),
        },
      },
      async ({ name }) => {
        const data = await api("POST", "/tokens", { name });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }
    );

    this.server.registerTool(
      "revoke_token",
      {
        description: "Permanently revoke an API token by ID.",
        inputSchema: {
          token_id: z.string().describe("Token ID to revoke (from list_tokens)"),
        },
      },
      async ({ token_id }) => {
        await api("DELETE", `/tokens/${token_id}`);
        return { content: [{ type: "text", text: `Token ${token_id} revoked.` }] };
      }
    );

    // ── Public ─────────────────────────────────────────────────────────────

    this.server.registerTool(
      "get_public_entries",
      {
        description:
          "List published changelog entries for a project by its public slug. No authentication required.",
        inputSchema: {
          slug: z.string().describe("Project slug (visible in the public changelog URL)"),
        },
      },
      async ({ slug }) => {
        const data = await api("GET", `/public/projects/${slug}/entries`, undefined, false);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }
    );
  }
}

const mcpHandler = NitrozenMcpAgent.serve("/mcp", { binding: "NitrozenMcpAgent" });

const OAUTH_METADATA = {
  issuer: "https://nitrozen.io",
  authorization_endpoint: "https://nitrozen.io/oauth/authorize",
  token_endpoint: "https://nitrozen.io/oauth/token",
  response_types_supported: ["code"],
  grant_types_supported: ["authorization_code", "refresh_token"],
  code_challenge_methods_supported: ["S256"],
  scopes_supported: ["read", "write", "tokens"],
  token_endpoint_auth_methods_supported: ["none"],
};

const MCP_RESOURCE = "https://mcp.nitrozen.io/mcp";
const RESOURCE_METADATA_URL = "https://mcp.nitrozen.io/.well-known/oauth-protected-resource";

// OAuth 2.0 Protected Resource Metadata (RFC 9728) for this MCP server
const PROTECTED_RESOURCE_METADATA = {
  resource: MCP_RESOURCE,
  resource_name: "Nitrozen MCP server",
  authorization_servers: ["https://nitrozen.io"],
  scopes_supported: ["read", "write", "tokens"],
  bearer_methods_supported: ["header"],
  resource_documentation: "https://nitrozen.io/docs/mcp",
};

const TOKEN_CACHE_TTL_SECONDS = 60;

function unauthorized(error: "invalid_request" | "invalid_token", description: string): Response {
  const challenge =
    error === "invalid_request"
      ? `Bearer realm="Nitrozen MCP", resource_metadata="${RESOURCE_METADATA_URL}"`
      : `Bearer realm="Nitrozen MCP", error="invalid_token", error_description="${description}", resource_metadata="${RESOURCE_METADATA_URL}"`;
  return new Response(JSON.stringify({ error: error === "invalid_request" ? "unauthorized" : "invalid_token", error_description: description }), {
    status: 401,
    headers: {
      "Content-Type": "application/json",
      "WWW-Authenticate": challenge,
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Expose-Headers": "WWW-Authenticate",
    },
  });
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Check a bearer token (OAuth access token or API token) against the Nitrozen API.
 * Results are cached for ~60s per token hash (the token itself is never used as a cache key).
 * Returns the upstream status: 200 valid, 401 invalid/expired/revoked, 403 no API access on plan.
 */
async function validateToken(token: string, ctx: ExecutionContext): Promise<number> {
  const cache = (caches as unknown as { default: Cache }).default;
  const key = new Request(`https://token-cache.mcp.nitrozen.io/${await sha256Hex(token)}`);
  const hit = await cache.match(key);
  if (hit) return Number(await hit.text());

  const res = await fetch(`${API_BASE}/user`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
  });
  const status = res.status;
  if (status === 200 || status === 401 || status === 403) {
    ctx.waitUntil(
      cache.put(key, new Response(String(status), { headers: { "Cache-Control": `max-age=${TOKEN_CACHE_TTL_SECONDS}` } }))
    );
  }
  return status;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // OAuth 2.0 Protected Resource Metadata (RFC 9728), root and path-suffixed forms
    if (url.pathname === "/.well-known/oauth-protected-resource" || url.pathname === "/.well-known/oauth-protected-resource/mcp") {
      return Response.json(PROTECTED_RESOURCE_METADATA, {
        headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=3600" },
      });
    }

    // OAuth 2.0 Authorization Server Metadata (RFC 8414). Kept for older MCP clients
    // (including existing Claude.ai connections) that look for it on the MCP host.
    if (url.pathname === "/.well-known/oauth-authorization-server") {
      return Response.json(OAUTH_METADATA, {
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    }

    // Extract Bearer token from Authorization header
    const authHeader = request.headers.get("Authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;

    if (!token) {
      return unauthorized("invalid_request", "Bearer token required");
    }

    let status: number;
    try {
      status = await validateToken(token, ctx);
    } catch {
      status = 0;
    }
    if (status === 401) {
      return unauthorized("invalid_token", "The access token is invalid, expired or revoked");
    }
    if (status === 403) {
      return new Response(JSON.stringify({ error: "insufficient_access", error_description: "Your Nitrozen plan does not include API access" }), {
        status: 403,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }
    if (status !== 200) {
      return new Response(JSON.stringify({ error: "temporarily_unavailable", error_description: "Could not validate the token, try again" }), {
        status: 503,
        headers: { "Content-Type": "application/json", "Retry-After": "5" },
      });
    }

    (ctx as any).props = { token } satisfies Props;
    return mcpHandler.fetch(request, env, ctx);
  },
};
