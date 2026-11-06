import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyTool, isToolEnabled, needsApproval } from '../lib/mcp/classify';
import { normalizeHttpsUrl, privateIp } from '../lib/mcp/url';
import { parseArgs, redactSecrets } from '../lib/mcp/sanitize';

test('classifyTool: read vs write vs blocked', () => {
  assert.equal(classifyTool('search_docs', 'Search documentation'), 'read');
  assert.equal(classifyTool('create_post', 'Create a post'), 'write');
  assert.equal(classifyTool('run_shell', 'Execute shell'), 'blocked');
});

test('write tools need approval and explicit allow list', () => {
  assert.equal(needsApproval('write'), true);
  assert.equal(isToolEnabled('search', 'read', []), true);
  assert.equal(isToolEnabled('create_post', 'write', []), false);
  assert.equal(isToolEnabled('create_post', 'write', ['create_post']), true);
  assert.equal(isToolEnabled('run_shell', 'blocked', ['run_shell']), false);
});

test('normalizeHttpsUrl rejects non-https and stdio', () => {
  assert.throws(() => normalizeHttpsUrl('stdio://x'));
  assert.throws(() => normalizeHttpsUrl('http://example.com/mcp'));
  const u = normalizeHttpsUrl('https://mcp.example.com/mcp');
  assert.equal(u.href, 'https://mcp.example.com/mcp');
});

test('privateIp blocks metadata and loopback', () => {
  assert.equal(privateIp('127.0.0.1'), true);
  assert.equal(privateIp('10.0.0.5'), true);
  assert.equal(privateIp('169.254.169.254'), true);
  assert.equal(privateIp('8.8.8.8'), false);
});

test('parseArgs enforces object and size', () => {
  assert.deepEqual(parseArgs({ q: 'x' }, 1000), { q: 'x' });
  assert.throws(() => parseArgs([], 1000));
  assert.throws(() => parseArgs({ big: 'x'.repeat(2000) }, 100));
});

test('redactSecrets strips sensitive keys', () => {
  const out = redactSecrets({ token: 'secret', nested: { api_key: 'x', ok: 1 } }) as Record<string, unknown>;
  assert.equal(out.token, '[redacted]');
  assert.equal((out.nested as Record<string, unknown>).api_key, '[redacted]');
});
