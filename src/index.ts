import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const API_BASE = "https://nitrozen.io/api/v1";

interface Env {
  NitrozenMcpAgent: DurableObjectNamespace;
  /** HMAC key for the wrapped OAuth state (Worker secret) */
  OAUTH_STATE_SECRET: string;
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
        title: "Get my profile and plan",
        annotations: { title: "Get my profile and plan", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
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
        title: "Get usage and plan limits",
        annotations: { title: "Get usage and plan limits", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
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
        title: "List changelog projects",
        annotations: { title: "List changelog projects", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
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
        title: "Create a changelog project",
        annotations: { title: "Create a changelog project", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
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
        title: "Get a changelog project",
        annotations: { title: "Get a changelog project", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
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
        title: "Update a changelog project",
        annotations: { title: "Update a changelog project", readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
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
        title: "Delete a changelog project",
        annotations: { title: "Delete a changelog project", readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
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
        title: "List changelog entries",
        annotations: { title: "List changelog entries", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
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
        title: "Create a changelog entry",
        annotations: { title: "Create a changelog entry", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
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
        title: "Get a changelog entry",
        annotations: { title: "Get a changelog entry", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
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
        title: "Update a changelog entry",
        annotations: { title: "Update a changelog entry", readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
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
        title: "Delete a changelog entry",
        annotations: { title: "Delete a changelog entry", readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
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
        title: "List API tokens",
        annotations: { title: "List API tokens", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
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
        title: "Create an API token",
        annotations: { title: "Create an API token", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
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
        title: "Revoke an API token",
        annotations: { title: "Revoke an API token", readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
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
        title: "Get a public changelog",
        annotations: { title: "Get a public changelog", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
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

const MCP_ORIGIN = "https://mcp.nitrozen.io";
const UPSTREAM_ORIGIN = "https://nitrozen.io";

// OAuth 2.0 Authorization Server Metadata (RFC 8414). mcp.nitrozen.io acts as its own
// authorization server origin; its /oauth/* endpoints forward to nitrozen.io, which issues
// the tokens (so tokens keep validating against the Nitrozen API).
const OAUTH_METADATA = {
  issuer: MCP_ORIGIN,
  authorization_endpoint: `${MCP_ORIGIN}/oauth/authorize`,
  token_endpoint: `${MCP_ORIGIN}/oauth/token`,
  registration_endpoint: `${MCP_ORIGIN}/oauth/register`,
  response_types_supported: ["code"],
  grant_types_supported: ["authorization_code", "refresh_token"],
  code_challenge_methods_supported: ["S256"],
  scopes_supported: ["read", "write", "tokens"],
  token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
  authorization_response_iss_parameter_supported: true,
  service_documentation: "https://nitrozen.io/auth.md",
  agent_auth: {
    register_uri: `${MCP_ORIGIN}/oauth/register`,
    documentation: "https://nitrozen.io/auth.md",
    skill: "https://nitrozen.io/auth.md",
  },
};

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Mcp-Session-Id, MCP-Protocol-Version",
  "Access-Control-Expose-Headers": "WWW-Authenticate, Mcp-Session-Id",
};

const OAUTH_CALLBACK = "https://mcp.nitrozen.io/oauth/callback";
const STATE_TTL_SECONDS = 1800;

function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
type WrappedState = { r: string; s: string | null; c: string; e: number };
async function wrapState(secret: string, st: WrappedState): Promise<string> {
  const payload = b64url(new TextEncoder().encode(JSON.stringify(st)));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret), new TextEncoder().encode(payload)));
  return `${payload}.${b64url(sig)}`;
}
async function unwrapState(secret: string, w: string | null): Promise<WrappedState | null> {
  if (!w) return null;
  const [payload, sig] = w.split(".");
  if (!payload || !sig) return null;
  try {
    const ok = await crypto.subtle.verify("HMAC", await hmacKey(secret), b64urlDecode(sig), new TextEncoder().encode(payload));
    if (!ok) return null;
    const st = JSON.parse(new TextDecoder().decode(b64urlDecode(payload))) as WrappedState;
    if (typeof st.r !== "string" || typeof st.e !== "number" || st.e < Math.floor(Date.now() / 1000)) return null;
    return st;
  } catch {
    return null;
  }
}

/** Redirect to the client's own redirect_uri with the given params plus iss (RFC 9207). */
function redirectToClient(redirectUri: string, params: URLSearchParams): Response {
  const target = new URL(redirectUri);
  for (const [k, v] of params) target.searchParams.set(k, v);
  target.searchParams.set("iss", MCP_ORIGIN);
  return new Response(null, { status: 302, headers: { Location: target.toString(), "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}

function oauthErrorPage(status: number, message: string): Response {
  return new Response(`<!doctype html><meta charset="utf-8"><title>Nitrozen sign-in error</title><p style="font-family:system-ui;max-width:32rem;margin:15vh auto">${message}</p>`, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

/**
 * /oauth/authorize: check the request with nitrozen.io (client and redirect_uri), then send the
 * user to nitrozen.io with redirect_uri set to our callback and the original redirect_uri/state
 * wrapped in a signed state, so the response can carry iss=https://mcp.nitrozen.io.
 */
async function handleAuthorize(url: URL, env: Env): Promise<Response> {
  const q = url.searchParams;
  const redirectUri = q.get("redirect_uri");
  const clientId = q.get("client_id");
  if (!redirectUri || !clientId || !env.OAUTH_STATE_SECRET) {
    return new Response(null, { status: 302, headers: { Location: `${UPSTREAM_ORIGIN}/oauth/authorize${url.search}`, "Cache-Control": "no-store" } });
  }
  // Validate client_id + redirect_uri (and other params) against nitrozen.io without a session
  const probe = await fetch(`${UPSTREAM_ORIGIN}/oauth/authorize${url.search}`, { redirect: "manual", headers: { Accept: "text/html" } });
  const loc = probe.headers.get("location") ?? "";
  if (probe.status >= 300 && probe.status < 400 && loc && !loc.startsWith(`${UPSTREAM_ORIGIN}/`)) {
    // Validation error redirected back to the client's own redirect_uri: forward it with iss
    try {
      const errUrl = new URL(loc);
      const base = new URL(redirectUri);
      if (errUrl.origin + errUrl.pathname === base.origin + base.pathname) {
        return redirectToClient(redirectUri, errUrl.searchParams);
      }
    } catch { /* fall through */ }
    return oauthErrorPage(400, "This sign-in request was rejected.");
  }
  if (!(probe.status >= 300 && probe.status < 400)) {
    // Invalid client or redirect_uri: do not redirect anywhere
    const text = await probe.text();
    return new Response(text, { status: probe.status, headers: { "Content-Type": probe.headers.get("content-type") ?? "application/json", "Cache-Control": "no-store" } });
  }
  const wrapped = await wrapState(env.OAUTH_STATE_SECRET, {
    r: redirectUri,
    s: q.get("state"),
    c: clientId,
    e: Math.floor(Date.now() / 1000) + STATE_TTL_SECONDS,
  });
  const upstream = new URL(`${UPSTREAM_ORIGIN}/oauth/authorize`);
  for (const [k, v] of q) upstream.searchParams.set(k, v);
  upstream.searchParams.set("redirect_uri", OAUTH_CALLBACK);
  upstream.searchParams.set("state", wrapped);
  return new Response(null, { status: 302, headers: { Location: upstream.toString(), "Cache-Control": "no-store" } });
}

/** /oauth/callback: unwrap the state and send code (or error), the original state and iss to the client. */
async function handleCallback(url: URL, env: Env): Promise<Response> {
  const st = await unwrapState(env.OAUTH_STATE_SECRET, url.searchParams.get("state"));
  if (!st) return oauthErrorPage(400, "This sign-in link is invalid or has expired. Please start the connection again from your app.");
  const params = new URLSearchParams();
  for (const [k, v] of url.searchParams) {
    if (k !== "state" && k !== "iss") params.set(k, v);
  }
  if (st.s !== null) params.set("state", st.s);
  return redirectToClient(st.r, params);
}

/** Rewrite request bodies for the pass-through: token redirect_uri and DCR redirect_uris. */
async function rewriteOAuthBody(path: string, contentType: string, raw: ArrayBuffer): Promise<ArrayBuffer> {
  const text = new TextDecoder().decode(raw);
  const isJson = contentType.includes("application/json");
  if (path === "/oauth/token") {
    if (isJson) {
      try {
        const d = JSON.parse(text) as Record<string, unknown>;
        if (d.grant_type === "authorization_code" && d.redirect_uri) d.redirect_uri = OAUTH_CALLBACK;
        return new TextEncoder().encode(JSON.stringify(d)).buffer as ArrayBuffer;
      } catch { return raw; }
    }
    const f = new URLSearchParams(text);
    if (f.get("grant_type") === "authorization_code" && f.has("redirect_uri")) {
      f.set("redirect_uri", OAUTH_CALLBACK);
      return new TextEncoder().encode(f.toString()).buffer as ArrayBuffer;
    }
    return raw;
  }
  if (path === "/oauth/register" && isJson) {
    try {
      const d = JSON.parse(text) as Record<string, unknown>;
      if (Array.isArray(d.redirect_uris) && d.redirect_uris.length < 5 && !d.redirect_uris.includes(OAUTH_CALLBACK)) {
        d.redirect_uris = [...d.redirect_uris, OAUTH_CALLBACK];
      }
      return new TextEncoder().encode(JSON.stringify(d)).buffer as ArrayBuffer;
    } catch { return raw; }
  }
  return raw;
}

/** Server-side pass-through of /oauth/token and /oauth/register to nitrozen.io. */
async function proxyOAuth(request: Request, path: string): Promise<Response> {
  const headers = new Headers();
  for (const h of ["content-type", "accept", "authorization"]) {
    const v = request.headers.get(h);
    if (v) headers.set(h, v);
  }
  if (!headers.has("accept")) headers.set("accept", "application/json");
  const ip = request.headers.get("cf-connecting-ip");
  if (ip) headers.set("x-forwarded-for", ip);
  const body = await rewriteOAuthBody(path, request.headers.get("content-type") ?? "", await request.arrayBuffer());
  const upstream = await fetch(`${UPSTREAM_ORIGIN}${path}`, {
    method: "POST",
    headers,
    body,
    redirect: "manual",
  });
  const out = new Headers();
  for (const h of ["content-type", "cache-control", "pragma", "www-authenticate", "retry-after", "x-ratelimit-limit", "x-ratelimit-remaining"]) {
    const v = upstream.headers.get(h);
    if (v) out.set(h, v);
  }
  for (const [k, v] of Object.entries(CORS_HEADERS)) out.set(k, v);
  if (path === "/oauth/register" && upstream.status === 201) {
    return finishRegister(upstream, out, body);
  }
  return new Response(upstream.body, { status: upstream.status, headers: out });
}

async function finishRegister(upstream: Response, out: Headers, body: ArrayBuffer): Promise<Response> {
    // Echo the granted scope (RFC 7591 section 3.2.1) when nitrozen.io leaves it out
    const text = await upstream.text();
    try {
      const data = JSON.parse(text) as Record<string, unknown>;
      if (data && typeof data === "object" && !("scope" in data)) {
        let requested = "";
        try { requested = String((JSON.parse(new TextDecoder().decode(body)) as { scope?: unknown }).scope ?? ""); } catch { /* not JSON */ }
        const allowed = ["read", "write", "tokens"];
        const scopes = requested.split(/\s+/).filter((x) => allowed.includes(x));
        data.scope = scopes.length ? scopes.join(" ") : "read write";
      }
      if (data && typeof data === "object") {
        // Hide the internal callback from the client's view of its registration
        if (Array.isArray(data.redirect_uris)) data.redirect_uris = data.redirect_uris.filter((u) => u !== OAUTH_CALLBACK);
        out.set("content-type", "application/json");
        return new Response(JSON.stringify(data), { status: 201, headers: out });
      }
    } catch { /* fall through with the original body */ }
    return new Response(text, { status: 201, headers: out });
}

const ICON_SOURCES: Record<string, { src: string; type: string }> = {
  "/favicon.ico": { src: `${UPSTREAM_ORIGIN}/nitrozen-logo.png`, type: "image/png" },
  "/favicon.png": { src: `${UPSTREAM_ORIGIN}/nitrozen-logo.png`, type: "image/png" },
  "/apple-touch-icon.png": { src: `${UPSTREAM_ORIGIN}/nitrozen-logo.png`, type: "image/png" },
  "/favicon.svg": { src: `${UPSTREAM_ORIGIN}/favicon.svg`, type: "image/svg+xml" },
};

/** Serve the Nitrozen icon from nitrozen.io, cached at the edge for a day. */
async function serveIcon(path: string, ctx: ExecutionContext): Promise<Response> {
  const { src, type } = ICON_SOURCES[path];
  const cache = (caches as unknown as { default: Cache }).default;
  const key = new Request(`https://icon-cache.mcp.nitrozen.io${path}`);
  const hit = await cache.match(key);
  if (hit) return hit;
  const upstream = await fetch(src, { cf: { cacheTtl: 86400, cacheEverything: true } } as RequestInit);
  if (!upstream.ok) return new Response("Not found", { status: 404, headers: { "Access-Control-Allow-Origin": "*" } });
  const res = new Response(await upstream.arrayBuffer(), {
    status: 200,
    headers: { "Content-Type": type, "Cache-Control": "public, max-age=86400", "Access-Control-Allow-Origin": "*" },
  });
  ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}

const MCP_RESOURCE = "https://mcp.nitrozen.io/mcp";
const RESOURCE_METADATA_URL = "https://mcp.nitrozen.io/.well-known/oauth-protected-resource/mcp";

// OAuth 2.0 Protected Resource Metadata (RFC 9728) for this MCP server
const PROTECTED_RESOURCE_METADATA = {
  resource: MCP_RESOURCE,
  resource_name: "Nitrozen MCP server",
  authorization_servers: ["https://mcp.nitrozen.io"],
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

    // CORS preflight: answer before auth so browser-based MCP clients can connect
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Authorization, Content-Type, Mcp-Session-Id, MCP-Protocol-Version",
          "Access-Control-Expose-Headers": "WWW-Authenticate, Mcp-Session-Id",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    // Icons (used by clients such as ChatGPT for the app icon)
    if ((request.method === "GET" || request.method === "HEAD") && url.pathname in ICON_SOURCES) {
      return serveIcon(url.pathname, ctx);
    }

    // Root: point people to the MCP docs instead of a 401
    if ((request.method === "GET" || request.method === "HEAD") && url.pathname === "/") {
      return new Response(null, { status: 302, headers: { Location: "https://nitrozen.io/docs/mcp", "Cache-Control": "public, max-age=3600" } });
    }

    // OAuth 2.0 Protected Resource Metadata (RFC 9728), root and path-suffixed forms
    if (url.pathname === "/.well-known/oauth-protected-resource" || url.pathname === "/.well-known/oauth-protected-resource/mcp") {
      return Response.json(PROTECTED_RESOURCE_METADATA, {
        headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=3600" },
      });
    }

    // OAuth 2.0 Authorization Server Metadata (RFC 8414), root and path-suffixed forms
    if (url.pathname === "/.well-known/oauth-authorization-server" || url.pathname === "/.well-known/oauth-authorization-server/mcp") {
      return Response.json(OAUTH_METADATA, {
        headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=3600" },
      });
    }

    // No OpenID Connect provider here: answer with a clean JSON 404
    if (url.pathname.startsWith("/.well-known/openid-configuration") || url.pathname.endsWith("/.well-known/openid-configuration")) {
      return Response.json({ error: "not_found", error_description: "OpenID Connect discovery is not supported; use /.well-known/oauth-authorization-server" }, {
        status: 404,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    }

    // Authorization endpoint: redirect to nitrozen.io, preserving the query string
    if (url.pathname === "/oauth/authorize") {
      return handleAuthorize(url, env);
    }

    // Authorization response from nitrozen.io: forward to the client with iss (RFC 9207)
    if (url.pathname === "/oauth/callback") {
      return handleCallback(url, env);
    }

    // Token and dynamic client registration endpoints: server-side pass-through
    if (url.pathname === "/oauth/token" || url.pathname === "/oauth/register") {
      if (request.method !== "POST") {
        return Response.json({ error: "invalid_request", error_description: "Use POST" }, { status: 405, headers: { ...CORS_HEADERS, Allow: "POST, OPTIONS" } });
      }
      return proxyOAuth(request, url.pathname);
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
