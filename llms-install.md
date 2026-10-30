# Installing the Nitrozen MCP server (for AI agents such as Cline)

Nitrozen is a **hosted remote server**. Do not clone, build, or run anything locally.

1. Ask the user for a Nitrozen API token. They can create one at https://app.nitrozen.io/api-tokens (sign up at https://nitrozen.io if needed). The `read` scope is enough for read-only use; `write` is needed to create or edit projects and entries.
2. Add this entry to the MCP settings file (for Cline: `cline_mcp_settings.json`), replacing `<your-api-token>` with the user's token:

```json
{
  "mcpServers": {
    "nitrozen": {
      "type": "streamableHttp",
      "url": "https://mcp.nitrozen.io/mcp",
      "headers": { "Authorization": "Bearer <your-api-token>" },
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

3. Verify: call the `get_user` tool. It should return the user's profile and plan. Then try `list_projects`.

Troubleshooting:
- `401 Unauthorized`: the token is missing, mistyped, or revoked. The header must be exactly `Authorization: Bearer <token>`.
- `403` on write tools: the token only has the `read` scope.
- Never commit the token to a repository.

Docs: https://nitrozen.io/docs/mcp
