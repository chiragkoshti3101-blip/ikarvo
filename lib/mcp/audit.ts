import 'server-only';
import type { Actor } from '@/lib/auth';
import { redactSecrets } from '@/lib/mcp/sanitize';

export type ActivityRow = {
  id: string;
  source: string;
  connectionId: string | null;
  action: string;
  toolName: string | null;
  status: 'ok' | 'denied' | 'error';
  detail: Record<string, unknown>;
  createdAt: string;
};

const previewLog: ActivityRow[] = [];

export async function logIntegrationActivity(
  actor: Actor,
  row: Omit<ActivityRow, 'id' | 'createdAt'>,
) {
  const detail = redactSecrets(row.detail) as Record<string, unknown>;
  if (actor.supabase) {
    await actor.supabase.from('integration_activity').insert({
      user_id: actor.id,
      source: row.source,
      connection_id: row.connectionId,
      action: row.action,
      tool_name: row.toolName,
      status: row.status,
      detail,
    }).then(() => null, () => null);
    return;
  }
  previewLog.unshift({
    ...row,
    detail,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  });
  if (previewLog.length > 200) previewLog.pop();
}

export async function listIntegrationActivity(actor: Actor, limit = 40): Promise<ActivityRow[]> {
  if (actor.supabase) {
    const { data, error } = await actor.supabase.from('integration_activity')
      .select('id,source,connection_id,action,tool_name,status,detail,created_at')
      .order('created_at', { ascending: false }).limit(limit);
    if (error) throw new Error(error.message);
    return (data ?? []).map(r => ({
      id: r.id as string,
      source: r.source as string,
      connectionId: r.connection_id as string | null,
      action: r.action as string,
      toolName: r.tool_name as string | null,
      status: r.status as ActivityRow['status'],
      detail: (r.detail ?? {}) as Record<string, unknown>,
      createdAt: r.created_at as string,
    }));
  }
  return previewLog.slice(0, limit);
}
