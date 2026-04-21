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

## Setup

```bash
npm install
```

## Local Development

```bash
npm run dev
```

Set the `NITROZEN_API_TOKEN` environment variable in a `.dev.vars` file:

```
NITROZEN_API_TOKEN=your_api_token_here
```

## Deploy

```bash
npm run deploy
```

Then set the production secret:

```bash
wrangler secret put NITROZEN_API_TOKEN
```

## Connect to Claude

Once deployed, add the MCP server in Claude's settings:

```
https://nitrozen-mcp.<your-subdomain>.workers.dev/mcp
```
