# Unified Integrations (native + MCP)

## Current state (main)

- **Integrations page** (`components/Integrations.tsx`, `GET /api/integrations`): live status for native providers (OAuth cookies, env keys, Meta row in Supabase). Connect / disconnect / test where implemented.
- **MCP** lived under Settings → Skills & MCP: client-side `mcp` document rows, `POST /api/mcp` for one-shot initialize + `tools/list`. Bearer tokens were not persisted; agent tool execution was not wired (documented as STUB in `INTEGRATIONS-v11.md`).
- **Agents** (`POST /api/cmo/chat`): JSON reply only; skills text in context; no tool loop.

## Product direction (approved)

| Layer | Role |
|--------|------|
| **Native integrations** | Reliable, predefined workflows (OAuth, env publishers, Meta). |
| **MCP** | Advanced remote servers; agents discover and call allowed tools flexibly. |
| **Shared** | Per-user connections, permission scopes, validation, sanitized activity logs. |

## Design

### Persistence

- New Supabase tables (owner RLS, same pattern as `meta_connections`):
  - `mcp_connections`: url, sealed bearer token, discovered tools, `allowed_tools`, status, last sync/error.
  - `integration_activity`: audit rows (`mcp` source today; extensible for native events later).
- **Preview mode** (no Supabase): sealed httpOnly cookie `kx_mcp_conns` (requires `SESSION_SECRET`), same fields without DB.

Legacy browser `mcp` docs remain readable; new connections use server storage only.

### Transport & security

- **Remote HTTP only** via `@modelcontextprotocol/sdk` `StreamableHTTPClientTransport` with a custom `fetch` that uses DNS + redirect SSRF checks (`lib/mcp/ssrf.ts`).
- Reject non-https URLs, `stdio`, `command`, and local paths at validation.
- Bounded timeouts, discovery cap (100 tools), truncated descriptions, capped tool results and argument JSON size.
- Secrets sealed with AES-256-GCM; never returned to client; redacted in logs.

### Permissions

- Tools classified **read** vs **write** (heuristic on name/description).
- **Read** tools: allowed when connection is healthy and tool appears in last discovery list (default allow).
- **Write** tools: must be explicitly enabled in `allowed_tools` **and** `approved: true` on execute (UI confirmation / agent gate).
- Blocklist patterns for obviously dangerous tool names (shell, exec, delete_all, …).

### Agent execution

- `POST /api/mcp/execute`: `{ connectionId, tool, arguments, approved? }` → sanitized result or 403 with `needsApproval`.
- CMO can call this from the client when the user confirms; no auto-send/purchase/provision.

### UI

- **Integrations** page: new **MCP servers** section (connect, test, disconnect, enable write tools, recent activity).
- Settings **Skills & MCP**: skills unchanged; MCP moved to Integrations with link.

## Out of scope (this PR)

- Billing/pricing changes.
- stdio/local MCP transports.
- Auto-running write tools without approval.
- Migrating every native integration into `integration_activity` (MCP only for now).
