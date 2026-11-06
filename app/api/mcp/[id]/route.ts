import { NextResponse } from 'next/server';
import { requireActor } from '@/lib/auth';
import { fail, readJson } from '@/lib/http';
import { discoverMcpServer } from '@/lib/mcp/client';
import { getMcpConnection, mcpStorageReady, updateMcpPermissions, upsertMcpConnection } from '@/lib/mcp/connections';
import { logIntegrationActivity } from '@/lib/mcp/audit';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

/** Re-run discovery (test connection) for one MCP integration. */
export async function POST(_req: Request, { params }: Params) {
  const actor = await requireActor(); if (actor instanceof NextResponse) return actor;
  const store = mcpStorageReady(actor);
  if (!store.ok) return fail(503, 'MCP connections need encrypted storage.', store.missing);
  const { id } = await params;
  try {
    const existing = await getMcpConnection(actor, id);
    if (!existing) return fail(404, 'Connection not found.');
    const discovered = await discoverMcpServer(existing.url, existing.bearerToken);
    const conn = await upsertMcpConnection(actor, {
      id,
      title: existing.title,
      url: existing.url,
      serverInfo: { ...(discovered.serverInfo ?? {}), protocolVersion: discovered.protocolVersion },
      tools: discovered.tools,
      allowedTools: existing.allowedTools,
      status: 'connected',
      lastError: null,
    });
    await logIntegrationActivity(actor, { source: 'mcp', connectionId: id, action: 'test', toolName: null, status: 'ok', detail: { toolCount: conn.tools.length } });
    return NextResponse.json({ connection: conn });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await logIntegrationActivity(actor, { source: 'mcp', connectionId: id, action: 'test', toolName: null, status: 'error', detail: { error: msg } });
    return fail(502, msg);
  }
}

/** Update allowed write tools for a connection. Body: { allowedTools: string[] } */
export async function PATCH(req: Request, { params }: Params) {
  const actor = await requireActor(); if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  const b = await readJson(req);
  const allowed = Array.isArray(b?.allowedTools) ? b.allowedTools.filter((x: unknown) => typeof x === 'string') as string[] : null;
  if (!allowed) return fail(400, 'allowedTools must be an array of tool names.');
  try {
    const conn = await updateMcpPermissions(actor, id, allowed);
    await logIntegrationActivity(actor, { source: 'mcp', connectionId: id, action: 'permissions', toolName: null, status: 'ok', detail: { allowedCount: conn.allowedTools.length } });
    return NextResponse.json({ connection: conn });
  } catch (e) {
    return fail(404, e instanceof Error ? e.message : String(e));
  }
}
