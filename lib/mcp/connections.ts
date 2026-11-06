import 'server-only';
import { cookies } from 'next/headers';
import { seal, unseal, cookieOpts } from '@/lib/seal';
import { envValue } from '@/lib/env';
import type { Actor } from '@/lib/auth';
import type { McpTool } from '@/lib/mcp/client';

export type McpConnection = {
  id: string;
  title: string;
  url: string;
  serverInfo: Record<string, unknown>;
  tools: McpTool[];
  allowedTools: string[];
  status: 'connected' | 'error';
  lastError: string | null;
  lastSyncAt: string | null;
  hasToken: boolean;
  createdAt: string;
  updatedAt: string;
};

type Stored = McpConnection & { bearerSealed?: string };

type Row = {
  id: string;
  title: string;
  url: string;
  server_info: Record<string, unknown>;
  tools: McpTool[];
  allowed_tools: string[];
  bearer_token: string | null;
  status: 'connected' | 'error';
  last_error: string | null;
  last_sync_at: string | null;
  created_at: string;
  updated_at: string;
};

const COOKIE = 'kx_mcp_conns';
export const MAX_MCP_CONNECTIONS = 20;

function sessionsReady() {
  try {
    return envValue('SESSION_SECRET').length >= 16;
  } catch {
    return false;
  }
}

function fromRow(r: Row): McpConnection {
  return {
    id: r.id,
    title: r.title,
    url: r.url,
    serverInfo: r.server_info ?? {},
    tools: Array.isArray(r.tools) ? r.tools : [],
    allowedTools: r.allowed_tools ?? [],
    status: r.status,
    lastError: r.last_error,
    lastSyncAt: r.last_sync_at,
    hasToken: !!r.bearer_token,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function publicConn(c: Stored): McpConnection {
  const { bearerSealed: _, ...rest } = c;
  return { ...rest, hasToken: rest.hasToken || !!_ };
}

async function readPreview(): Promise<Stored[]> {
  const c = await cookies();
  return unseal<Stored[]>(c.get(COOKIE)?.value) ?? [];
}

async function writePreview(all: Stored[]) {
  const c = await cookies();
  c.set(COOKIE, seal(all.slice(0, MAX_MCP_CONNECTIONS)), { ...cookieOpts, maxAge: 60 * 60 * 24 * 90 });
}

export async function listMcpConnections(actor: Actor): Promise<McpConnection[]> {
  if (actor.supabase) {
    const { data, error } = await actor.supabase.from('mcp_connections').select('id,title,url,server_info,tools,allowed_tools,bearer_token,status,last_error,last_sync_at,created_at,updated_at')
      .order('updated_at', { ascending: false }).limit(50);
    if (error) throw new Error(error.message);
    return (data as Row[]).map(fromRow);
  }
  return (await readPreview()).map(publicConn);
}

export async function getMcpConnection(actor: Actor, id: string): Promise<(McpConnection & { bearerToken?: string }) | null> {
  if (actor.supabase) {
    const { data, error } = await actor.supabase.from('mcp_connections').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    const row = data as Row;
    const token = row.bearer_token ? unseal<{ t: string }>(row.bearer_token)?.t : undefined;
    return { ...fromRow(row), bearerToken: token };
  }
  const hit = (await readPreview()).find(x => x.id === id);
  if (!hit) return null;
  const token = hit.bearerSealed ? unseal<{ t: string }>(hit.bearerSealed)?.t : undefined;
  return { ...publicConn(hit), bearerToken: token };
}

export async function upsertMcpConnection(actor: Actor, input: {
  id?: string;
  title: string;
  url: string;
  serverInfo: Record<string, unknown>;
  tools: McpTool[];
  bearerToken?: string;
  allowedTools?: string[];
  status: 'connected' | 'error';
  lastError?: string | null;
}): Promise<McpConnection> {
  const now = new Date().toISOString();
  const sealedToken = input.bearerToken ? seal({ t: input.bearerToken }) : null;
  if (actor.supabase) {
    const existing = input.id ? await getMcpConnection(actor, input.id) : null;
    const row = {
      ...(input.id ? { id: input.id } : {}),
      user_id: actor.id,
      title: input.title,
      url: input.url,
      server_info: input.serverInfo,
      tools: input.tools,
      allowed_tools: input.allowedTools ?? existing?.allowedTools ?? [],
      ...(sealedToken ? { bearer_token: sealedToken } : existing?.hasToken ? {} : { bearer_token: null }),
      status: input.status,
      last_error: input.lastError ?? null,
      last_sync_at: input.status === 'connected' ? now : null,
      updated_at: now,
    };
    const { data, error } = await actor.supabase.from('mcp_connections').upsert(row).select('id,title,url,server_info,tools,allowed_tools,bearer_token,status,last_error,last_sync_at,created_at,updated_at').single();
    if (error) throw new Error(error.message);
    return fromRow(data as Row);
  }
  if (!sessionsReady()) throw new Error('SESSION_SECRET must be set (at least 32 random characters) to store MCP connections in preview mode.');
  const all = await readPreview();
  const id = input.id ?? crypto.randomUUID();
  const prev = all.find(x => x.id === id);
  const doc: Stored = {
    id,
    title: input.title,
    url: input.url,
    serverInfo: input.serverInfo,
    tools: input.tools,
    allowedTools: input.allowedTools ?? prev?.allowedTools ?? [],
    status: input.status,
    lastError: input.lastError ?? null,
    lastSyncAt: input.status === 'connected' ? now : null,
    hasToken: !!(sealedToken ?? prev?.bearerSealed),
    createdAt: prev?.createdAt ?? now,
    updatedAt: now,
    bearerSealed: sealedToken ?? prev?.bearerSealed,
  };
  await writePreview([doc, ...all.filter(x => x.id !== id)]);
  return publicConn(doc);
}

export async function updateMcpPermissions(actor: Actor, id: string, allowedTools: string[]): Promise<McpConnection> {
  const clean = [...new Set(allowedTools.map(t => t.slice(0, 120)))].slice(0, 100);
  if (actor.supabase) {
    const { data, error } = await actor.supabase.from('mcp_connections').update({ allowed_tools: clean, updated_at: new Date().toISOString() }).eq('id', id).select('id,title,url,server_info,tools,allowed_tools,bearer_token,status,last_error,last_sync_at,created_at,updated_at').single();
    if (error) throw new Error(error.message);
    return fromRow(data as Row);
  }
  const all = await readPreview();
  const idx = all.findIndex(x => x.id === id);
  if (idx < 0) throw new Error('Connection not found.');
  all[idx] = { ...all[idx], allowedTools: clean, updatedAt: new Date().toISOString() };
  await writePreview(all);
  return publicConn(all[idx]);
}

export async function deleteMcpConnection(actor: Actor, id: string) {
  if (actor.supabase) {
    const { error } = await actor.supabase.from('mcp_connections').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return;
  }
  await writePreview((await readPreview()).filter(x => x.id !== id));
}

export function mcpStorageReadyForEnv(hasSupabase: boolean): { ok: boolean; missing: string[] } {
  if (hasSupabase) return { ok: true, missing: [] };
  if (!sessionsReady()) return { ok: false, missing: ['SESSION_SECRET'] };
  return { ok: true, missing: [] };
}

export function mcpStorageReady(actor: Actor): { ok: boolean; missing: string[] } {
  return mcpStorageReadyForEnv(!!actor.supabase);
}
