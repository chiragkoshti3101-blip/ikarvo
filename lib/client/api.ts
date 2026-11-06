export class ApiError extends Error { constructor(message: string, public setup?: string[], public status = 0) { super(message); } }

export async function api<T>(url: string, body?: unknown, method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'POST'): Promise<T> {
  const hasBody = body !== undefined;
  const r = await fetch(url, {
    method: hasBody ? method : 'GET',
    cache: 'no-store',
    ...(hasBody ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  });
  const d = await r.json().catch(() => ({}));
  if (hasBody && typeof window !== 'undefined') window.dispatchEvent(new Event('ikarvo:credits'));
  if (!r.ok) throw new ApiError(d.error || `Request failed (${r.status}).`, d.setup, r.status);
  return d as T;
}

export type Feature = { ok: boolean; label: string; missing: string[]; note?: string };
export type Status = { preview: boolean; supabase: Feature; ai: Feature; github: Feature; vercel: Feature; stripe: Feature; media: Feature; sessions: Feature; x: Feature; linkedin: Feature; wordpress: Feature; reddit: Feature; google: Feature; search: Feature; youtube: Feature; xsearch: Feature; grounded: Feature; scheduler: Feature };

export function download(name: string, content: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type })); const a = document.createElement('a');
  a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const uid = () => crypto.randomUUID();
export const fmtDate = (s: string) => new Date(s).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
