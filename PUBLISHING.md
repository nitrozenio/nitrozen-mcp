# Publishing nitrozen-mcp to MCP directories

## 1. Deploy the worker first
Merge this PR (it includes the server card from #1), then run `npm run deploy`. Check:
```bash
curl -s https://mcp.nitrozen.io/.well-known/mcp/server-card.json | head -c 200        # 200 JSON, no token
curl -s https://mcp.nitrozen.io/.well-known/oauth-protected-resource                    # 200 JSON
curl -si -X POST https://mcp.nitrozen.io/mcp | grep -i www-authenticate                 # 401 + resource_metadata
```

## 2. Official MCP Registry (namespace io.nitrozen, DNS verified)
Install the publisher (macOS: `brew install mcp-publisher`, or download it from
https://github.com/modelcontextprotocol/registry/releases).

```bash
cd nitrozen-mcp
MY_DOMAIN="nitrozen.io"
# On macOS use OpenSSL 3 (brew install openssl@3) for Ed25519
openssl genpkey -algorithm Ed25519 -out key.pem            # keep key.pem private; never commit it
PUBLIC_KEY="$(openssl pkey -in key.pem -pubout -outform DER | tail -c 32 | base64)"
echo "${MY_DOMAIN}. IN TXT \"v=MCPv1; k=ed25519; p=${PUBLIC_KEY}\""
```
Add that TXT record at the **apex** of nitrozen.io in Cloudflare DNS (name `@`, not a subdomain). Wait a few minutes, then:
```bash
PRIVATE_KEY="$(openssl pkey -in key.pem -noout -text | grep -A3 "priv:" | tail -n +2 | tr -d ' :\n')"
mcp-publisher login dns --domain "${MY_DOMAIN}" --private-key "${PRIVATE_KEY}"
mcp-publisher validate
mcp-publisher publish
curl -s "https://registry.modelcontextprotocol.io/v0/servers?search=io.nitrozen"
```
To release a new version later, bump `version` in server.json (and in SERVER_INFO in src/index.ts), deploy, then run `mcp-publisher publish` again.

**Alternative (GitHub auth):** rename it to `io.github.nitrozenio/nitrozen` and run `mcp-publisher login github`. This needs you to be an **Owner** of the nitrozenio org. DNS is preferred because the name then matches the mcp.nitrozen.io URL.

## 3. Smithery
1. Go to https://smithery.ai/new, sign in with GitHub and enter `https://mcp.nitrozen.io/mcp`.
2. Smithery's scan hits a 401, then falls back to the static server card at `/.well-known/mcp/server-card.json` (from PR #1).
3. If Smithery asks you to authenticate, it uses OAuth with Client ID Metadata Documents: the client_id is a URL, not a pre-registered client. Nitrozen's OAuth server is Laravel Passport, which expects registered clients. If sign-in fails, the listing can still go live from the card, but users won't be able to connect through Smithery's gateway until nitrozen.io accepts URL client_ids (or dynamic client registration). That's a separate nitrozen-app change.
4. Don't block the `SmitheryBot/1.0` user agent in Cloudflare WAF rules.
