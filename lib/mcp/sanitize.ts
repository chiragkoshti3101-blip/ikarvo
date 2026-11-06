const SECRET_KEYS = /token|secret|password|authorization|api[_-]?key|bearer|credential/i;

export function redactSecrets(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[truncated]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return value.length > 500 ? `${value.slice(0, 500)}…` : value;
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.slice(0, 50).map(v => redactSecrets(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SECRET_KEYS.test(k) ? '[redacted]' : redactSecrets(v, depth + 1);
  }
  return out;
}

export function capJsonSize(obj: unknown, maxChars: number): unknown {
  const s = JSON.stringify(obj);
  if (s.length <= maxChars) return obj;
  return { truncated: true, preview: s.slice(0, maxChars) + '…' };
}

export function parseArgs(raw: unknown, maxChars: number): Record<string, unknown> {
  if (raw === null || raw === undefined) return {};
  if (typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Tool arguments must be a JSON object.');
  const s = JSON.stringify(raw);
  if (s.length > maxChars) throw new Error(`Tool arguments exceed ${maxChars} characters.`);
  return raw as Record<string, unknown>;
}
