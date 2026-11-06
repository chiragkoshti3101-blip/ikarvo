import { NextResponse } from 'next/server';
import { requireActor } from '@/lib/auth';
import { fail, readJson, str } from '@/lib/http';
import { discoverMcpServer } from '@/lib/mcp/client';
import { deleteMcpConnection, listMcpConnections, mcpStorageReady, upsertMcpConnection } from '@/lib/mcp/connections';
import { logIntegrationActivity } from '@/lib/mcp/audit';
import { normalizeHttpsUrl } from '@/lib/mcp/ssrf';

export const runtime = 'nodejs';

/** List persisted MCP connections for this user/workspace. */
export async function GET() {
  const actor = await requireActor(); if (actor instanceof NextResponse) return actor;
  const store = mcpStorageReady(actor);
  if (!store.ok) return fail(503, 'MCP connections need encrypted storage. Set SESSION_SECRET or configure Supabase.', store.missing);
  try {
    const connections = await listMcpConnections(actor);
    return NextResponse.json({ connections, storage: actor.supabase ? 'supabase' : 'preview' });
  } catch (e) {
    return fail(503, e instanceof Error ? e.message : String(e));
  }
}

/** Connect: discover tools on a remote MCP server and persist the connection (optional bearer token, sealed). */
export async function POST(req: Request) {
  const actor = await requireActor(); if (actor instanceof NextResponse) return actor;
  const store = mcpStorageReady(actor);
  if (!store.ok) return fail(503, 'MCP connections need encrypted storage. Set SESSION_SECRET or configure Supabase.', store.missing);
  const b = await readJson(req);
  let url: URL;
  try { url = normalizeHttpsUrl(str(b?.url, 500)); } catch (e) { return fail(400, e instanceof Error ? e.message : 'Enter a valid https MCP server URL.'); }
  const token = str(b?.token, 2000) || undefined;
  const title = str(b?.title, 120);
  try {
    const discovered = await discoverMcpServer(url.href, token);
    const conn = await upsertMcpConnection(actor, {
      title: title || discovered.serverInfo?.name || url.hostname,
      url: url.href,
      serverInfo: { ...(discovered.serverInfo ?? {}), protocolVersion: discovered.protocolVersion },
      tools: discovered.tools,
      bearerToken: token,
      status: 'connected',
      lastError: null,
    });
    await logIntegrationActivity(actor, { source: 'mcp', connectionId: conn.id, action: 'connect', toolName: null, status: 'ok', detail: { url: url.href, toolCount: conn.tools.length } });
    return NextResponse.json({ connection: conn });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await logIntegrationActivity(actor, { source: 'mcp', connectionId: null, action: 'connect', toolName: null, status: 'error', detail: { url: url.href, error: msg } });
    return fail(502, msg);
  }
}

/** Disconnect by id (?id=). */
export async function DELETE(req: Request) {
  const actor = await requireActor(); if (actor instanceof NextResponse) return actor;
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return fail(400, 'Missing connection id.');
  try {
    await deleteMcpConnection(actor, id);
    await logIntegrationActivity(actor, { source: 'mcp', connectionId: id, action: 'disconnect', toolName: null, status: 'ok', detail: {} });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(404, e instanceof Error ? e.message : String(e));
  }
}
