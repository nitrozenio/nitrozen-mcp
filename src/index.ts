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
        description: "List all changelog projects owned by the authenticated user.",
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
        description: "Get a single changelog project by ID.",
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
            .enum(["new", "improvement", "fix", "announcement"])
            .describe("Entry category"),
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
            .enum(["new", "improvement", "fix", "announcement"])
            .optional()
            .describe("New category"),
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
          token_id: z.number().int().describe("Token ID to revoke"),
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

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const token = url.searchParams.get("token");
    if (!token) {
      return new Response(
        JSON.stringify({ error: "Missing required query parameter: token" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }
    (ctx as any).props = { token } satisfies Props;
    return mcpHandler.fetch(request, env, ctx);
  },
};
