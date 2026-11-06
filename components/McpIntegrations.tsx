'use client';
import { useCallback, useEffect, useState } from 'react';
import Icon from './Icon';
import { api } from '@/lib/client/api';
import { ErrorNote, useWs } from './ws';

type Tool = { name: string; description: string };
type Conn = {
  id: string; title: string; url: string; tools: Tool[]; allowedTools: string[];
  status: 'connected' | 'error'; lastError: string | null; lastSyncAt: string | null; hasToken: boolean;
};
type Activity = { id: string; action: string; toolName: string | null; status: string; detail: Record<string, unknown>; createdAt: string };

export default function McpIntegrations() {
  const { toast } = useWs();
  const [connections, setConnections] = useState<Conn[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [storage, setStorage] = useState<string>('');
  const [missing, setMissing] = useState<string[]>([]);
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [runTool, setRunTool] = useState<{ conn: string; tool: string; args: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/mcp', { cache: 'no-store' });
      const d = await r.json();
      if (!r.ok) { setMissing(d.setup ?? ['SESSION_SECRET']); setConnections([]); return; }
      setConnections(d.connections ?? []);
      setStorage(d.storage ?? '');
      setMissing([]);
      const a = await fetch('/api/mcp/activity?limit=20', { cache: 'no-store' }).then(x => x.json()).catch(() => ({ events: [] }));
      setActivity(a.events ?? []);
    } catch (e) { setError(e); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function connect() {
    setBusy('connect'); setError(null);
    try {
      const r = await api<{ connection: Conn }>('/api/mcp', { url, token });
      setConnections(c => [r.connection, ...c.filter(x => x.id !== r.connection.id)]);
      setUrl(''); setToken('');
      toast(`MCP connected · ${r.connection.tools.length} tools`);
      load();
    } catch (e) { setError(e); } finally { setBusy(''); }
  }

  async function disconnect(id: string) {
    setBusy(id);
    try {
      await fetch(`/api/mcp?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      setConnections(c => c.filter(x => x.id !== id));
      toast('MCP disconnected');
      load();
    } catch (e) { setError(e); } finally { setBusy(''); }
  }

  async function retest(id: string) {
    setBusy(`t-${id}`);
    try {
      const r = await api<{ connection: Conn }>(`/api/mcp/${id}`, {});
      setConnections(c => c.map(x => x.id === id ? r.connection : x));
      toast('Connection OK');
      load();
    } catch (e) { setError(e); } finally { setBusy(''); }
  }

  async function toggleWrite(conn: Conn, tool: string, on: boolean) {
    const next = on ? [...new Set([...conn.allowedTools, tool])] : conn.allowedTools.filter(t => t !== tool);
    try {
      const r = await api<{ connection: Conn }>(`/api/mcp/${conn.id}`, { allowedTools: next }, 'PATCH');
      setConnections(c => c.map(x => x.id === conn.id ? r.connection : x));
    } catch (e) { setError(e); }
  }

  async function execute(connId: string, tool: string, argsText: string, approved: boolean) {
    setBusy(`run-${tool}`);
    try {
      const args = argsText.trim() ? JSON.parse(argsText) : {};
      const r = await api<{ result?: unknown; needsApproval?: boolean; message?: string }>('/api/mcp/execute', { connectionId: connId, tool, arguments: args, approved });
      if (r.needsApproval) {
        if (!confirm(r.message || 'Allow this write tool to run?')) return;
        return execute(connId, tool, argsText, true);
      }
      toast('Tool finished');
      alert(JSON.stringify(r.result, null, 2).slice(0, 4000));
      load();
    } catch (e) { setError(e); } finally { setBusy(''); setRunTool(null); }
  }

  const setupBlock = !!missing.length;

  return <section className="int-sec">
    <div className="int-head"><h2 className="h2">MCP servers</h2>
      <p className="small muted">Advanced: connect remote Model Context Protocol servers (https only). Native integrations above stay the default for OAuth and publishing. Agents can call allowed tools; write tools need explicit enablement and confirmation.</p>
      <span className="small muted">{connections.filter(c => c.status === 'connected').length}/{connections.length} connected{storage ? ` · ${storage}` : ''}</span></div>
    {setupBlock && <p className="note setup small">Add {missing.join(', ')} to store MCP connections{storage === 'preview' ? ' in preview mode' : ''}.</p>}
    <ErrorNote error={error} onClose={() => setError(null)} />
    <div className="stack" style={{ marginBottom: 16 }}>
      <div className="two"><input className="input" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://mcp.example.com/mcp" disabled={setupBlock} />
        <input className="input" type="password" value={token} onChange={e => setToken(e.target.value)} placeholder="Bearer token (optional, stored sealed)" disabled={setupBlock} /></div>
      <button className="btn sm" disabled={setupBlock || !url || busy === 'connect'} onClick={connect}>{busy === 'connect' ? 'Connecting…' : 'Connect & discover tools'}</button>
    </div>
    <div className="int-rows">{connections.map(c => {
      const writeTools = c.tools.filter(t => /\b(create|update|delete|send|post|publish|write|execute|run|launch)\b/i.test(t.name));
      return <div key={c.id} className="int-row"><div><b>{c.title}</b><p className="small muted">{c.url} · {c.tools.length} tools{c.hasToken ? ' · token saved' : ''}</p>
        {c.lastError && <p className="small warn-text">{c.lastError}</p>}
        {expanded === c.id && <div className="stack" style={{ marginTop: 8 }}>
          <div className="chips">{c.tools.slice(0, 30).map(t => <span key={t.name} className="chip" title={t.description}>{t.name}</span>)}</div>
          {writeTools.length > 0 && <div className="small"><p className="muted">Write tools (enable before agents may run them):</p>
            {writeTools.slice(0, 15).map(t => <label key={t.name} className="row" style={{ gap: 8 }}><input type="checkbox" checked={c.allowedTools.includes(t.name)} onChange={e => toggleWrite(c, t.name, e.target.checked)} /><span>{t.name}</span></label>)}</div>}
          {runTool?.conn === c.id && <div className="two"><input className="input" value={runTool.args} onChange={e => setRunTool({ ...runTool, args: e.target.value })} placeholder='{"query":"..."}' />
            <button className="btn sm" disabled={!!busy} onClick={() => execute(c.id, runTool.tool, runTool.args, false)}>Run {runTool.tool}</button></div>}
        </div>}</div>
        <span className={`pill ${c.status === 'connected' ? 'on' : 'warn'}`}>{c.status === 'connected' ? 'Connected' : 'Error'}</span>
        <div className="int-act row">
          <button className="btn ghost sm" onClick={() => setExpanded(expanded === c.id ? null : c.id)}>{expanded === c.id ? 'Hide' : 'Tools'}</button>
          <button className="btn ghost sm" disabled={busy === `t-${c.id}`} onClick={() => retest(c.id)}>Test</button>
          <button className="btn ghost sm" disabled={busy === c.id} onClick={() => disconnect(c.id)}>Disconnect</button>
        </div></div>;
    })}{!connections.length && <p className="small muted">No MCP servers connected yet.</p>}</div>
    {activity.length > 0 && <details className="small"><summary>Recent MCP activity ({activity.length})</summary>
      <div className="table" style={{ marginTop: 8 }}>{activity.map(a => <div key={a.id} className="tr"><span>{a.action}{a.toolName ? ` · ${a.toolName}` : ''}</span><span className={`pill ${a.status === 'ok' ? 'on' : a.status === 'denied' ? 'warn' : 'off'}`}>{a.status}</span><span className="small muted">{new Date(a.createdAt).toLocaleString()}</span></div>)}</div></details>}
    <p className="small muted"><Icon name="lock" size={12} /> Remote https only — no local stdio commands. Tokens are sealed server-side and never sent back to the browser.</p>
  </section>;
}
