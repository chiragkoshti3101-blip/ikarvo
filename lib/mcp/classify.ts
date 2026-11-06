/** Heuristic classification for MCP tool permissions (not provider-specific). */

const WRITE = /\b(create|update|delete|remove|send|post|publish|write|insert|upsert|patch|put|execute|run|launch|purchase|charge|provision|deploy|commit|push|merge|invite|email|sms|message|transfer|pay|buy|order|subscribe|cancel|refund|drop|truncate|destroy|kill|shutdown|reboot|format)\b/i;
const BLOCK = /\b(shell|exec|eval|system|sudo|rm\s+-rf|delete_all|wipe|password|secret|credential|token)\b/i;

export type ToolKind = 'read' | 'write' | 'blocked';

export function classifyTool(name: string, description = ''): ToolKind {
  const text = `${name} ${description}`;
  if (BLOCK.test(text)) return 'blocked';
  if (WRITE.test(name) || WRITE.test(description)) return 'write';
  return 'read';
}

export function toolAllowedByDefault(kind: ToolKind): boolean {
  return kind === 'read';
}

export function isToolEnabled(name: string, kind: ToolKind, allowedTools: string[]): boolean {
  if (kind === 'blocked') return false;
  if (kind === 'read') return true;
  return allowedTools.includes(name);
}

export function needsApproval(kind: ToolKind): boolean {
  return kind === 'write';
}
