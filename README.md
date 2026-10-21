# nitrozen-mcp

Remote MCP server for the [Nitrozen.io](https://nitrozen.io) changelog API, hosted on Cloudflare Workers.

## Tools

| Tool | Description |
|------|-------------|
| `get_user` | Get authenticated user profile and plan |
| `get_usage` | Get usage statistics and plan limits |
| `list_projects` | List all changelog projects |
| `create_project` | Create a new project |
| `get_project` | Get a project by ID |
| `update_project` | Update project name/description |
| `delete_project` | Delete a project |
| `list_entries` | List entries for a project (paginated) |
| `create_entry` | Create a changelog entry |
| `get_entry` | Get an entry by ID |
| `update_entry` | Update an entry |
| `delete_entry` | Delete an entry |
| `list_tokens` | List API tokens |
| `create_token` | Create a new API token |
| `revoke_token` | Revoke an API token |
| `get_public_entries` | List published entries by project slug (no auth) |

## Authentication

OAuth-capable MCP clients sign in through nitrozen.io automatically (discovery via `/.well-known/oauth-protected-resource`). Other clients send a Nitrozen.io API token as `Authorization: Bearer YOUR_API_TOKEN`. Create a token on the [API Tokens](https://nitrozen.io/api-tokens) page.

## Setup

```bash
npm install
```

## Local Development

```bash
npm run dev
```

## Deploy

```bash
npm run deploy
```

## Connect to Claude

Add the remote MCP server URL in your client's settings and sign in when prompted:

```
https://mcp.nitrozen.io/mcp
```

## Registry listing

`server.json` describes this server for the official MCP Registry (registry.modelcontextprotocol.io) under the DNS-verified namespace `io.nitrozen`. Publish steps: see PUBLISHING.md.
