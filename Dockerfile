# Stdio bridge to the hosted Nitrozen MCP server (https://mcp.nitrozen.io/mcp).
# The server itself runs on Cloudflare Workers; this image lets stdio-only MCP
# clients and directories (e.g. Glama) connect to it via mcp-remote.
#
# Usage:
#   docker build -t nitrozen-mcp .
#   docker run -i --rm -e NITROZEN_API_TOKEN=your_token nitrozen-mcp
#
# Create a token at https://app.nitrozen.io/api-tokens. Without a token the
# server still starts and lists its tools, but API calls will be rejected.
FROM node:20-slim

RUN npm install -g mcp-remote@0.15.1 && npm cache clean --force

ENV NITROZEN_MCP_URL=https://mcp.nitrozen.io/mcp \
    NITROZEN_API_TOKEN=""

ENTRYPOINT ["/bin/sh", "-c", "exec mcp-remote \"$NITROZEN_MCP_URL\" --transport http-only --header \"Authorization: Bearer ${NITROZEN_API_TOKEN:-public}\""]
