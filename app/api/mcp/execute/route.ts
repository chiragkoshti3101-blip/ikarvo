import { NextResponse } from 'next/server';
import { requireActor } from '@/lib/auth';
import { fail, readJson, str } from '@/lib/http';
import { callMcpTool } from '@/lib/mcp/client';
import { getMcpConnection, mcpStorageReady } from '@/lib/mcp/connections';
import { classifyTool, isToolEnabled, needsApproval } from '@/lib/mcp/classify';
import { capJsonSize, parseArgs, redactSecrets } from '@/lib/mcp/sanitize';
import { logIntegrationActivity } from '@/lib/mcp/audit';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_ARGS = 100_000;
const MAX_RESULT = 50_000;

/** Execute a discovered MCP tool (write tools require allowedTools + approved: true). */
export async function POST(req: Request) {
  const actor = await requireActor(); if (actor instanceof NextResponse) return actor;
  const store = mcpStorageReady(actor);
  if (!store.ok) return fail(503, 'MCP connections need encrypted storage.', store.missing);
  const b = await readJson(req);
  const connectionId = str(b?.connectionId, 80);
  const toolName = str(b?.tool, 120);
  const approved = b?.approved === true;
  if (!connectionId || !toolName) return fail(400, 'connectionId and tool are required.');
  let args: Record<string, unknown>;
  try { args = parseArgs(b?.arguments, MAX_ARGS); } catch (e) { return fail(400, e instanceof Error ? e.message : 'Invalid arguments.'); }

  const conn = await getMcpConnection(actor, connectionId);
  if (!conn) return fail(404, 'Connection not found.');
  if (conn.status !== 'connected') return fail(409, conn.lastError || 'Connection is in error state. Run Test to refresh.');

  const meta = conn.tools.find(t => t.name === toolName);
  if (!meta) {
    await logIntegrationActivity(actor, { source: 'mcp', connectionId, action: 'tool_call', toolName, status: 'denied', detail: { reason: 'unknown_tool' } });
    return fail(404, 'Tool not found on this connection. Re-test the server to refresh tools.');
  }

  const kind = classifyTool(toolName, meta.description);
  if (!isToolEnabled(toolName, kind, conn.allowedTools)) {
    await logIntegrationActivity(actor, { source: 'mcp', connectionId, action: 'tool_call', toolName, status: 'denied', detail: { reason: kind === 'blocked' ? 'blocked' : 'not_allowed', kind } });
    return fail(403, kind === 'blocked' ? 'This tool is blocked for safety.' : 'Enable this write tool under Integrations → MCP before running it.', kind === 'write' ? undefined : undefined);
  }
  if (needsApproval(kind) && !approved) {
    await logIntegrationActivity(actor, { source: 'mcp', connectionId, action: 'tool_call', toolName, status: 'denied', detail: { reason: 'needs_approval', kind } });
    return NextResponse.json({ needsApproval: true, kind, tool: toolName, message: 'This tool can change external systems. Confirm before running.' }, { status: 403 });
  }

  try {
    const raw = await callMcpTool(conn.url, conn.bearerToken, toolName, args);
    const sanitized = capJsonSize(redactSecrets(raw), MAX_RESULT);
    await logIntegrationActivity(actor, { source: 'mcp', connectionId, action: 'tool_call', toolName, status: 'ok', detail: { kind, isError: !!(raw as { isError?: boolean }).isError } });
    return NextResponse.json({ result: sanitized });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await logIntegrationActivity(actor, { source: 'mcp', connectionId, action: 'tool_call', toolName, status: 'error', detail: { error: msg } });
    return fail(502, msg);
  }
}
