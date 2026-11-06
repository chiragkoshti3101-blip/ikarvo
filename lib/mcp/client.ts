import 'server-only';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { mcpFetchFactory, normalizeHttpsUrl } from '@/lib/mcp/ssrf';

export const MAX_TOOLS = 100;
export const MAX_TOOL_DESC = 400;
const INIT_TIMEOUT = 20_000;
const CALL_TIMEOUT = 30_000;

export type McpTool = { name: string; description: string; inputSchema?: unknown };

export type DiscoverResult = {
  serverInfo: { name?: string; version?: string } | null;
  protocolVersion: string | null;
  tools: McpTool[];
};

function trimTools(tools: McpTool[]): McpTool[] {
  return tools.slice(0, MAX_TOOLS).map(t => ({
    name: t.name.slice(0, 120),
    description: (t.description ?? '').slice(0, MAX_TOOL_DESC),
    inputSchema: t.inputSchema,
  }));
}

/** Connect to a remote MCP server, list tools, then close. */
export async function discoverMcpServer(urlRaw: string, bearerToken?: string): Promise<DiscoverResult> {
  const url = normalizeHttpsUrl(urlRaw);
  const headers: Record<string, string> = {};
  if (bearerToken) headers.Authorization = `Bearer ${bearerToken}`;

  const transport = new StreamableHTTPClientTransport(url, {
    fetch: mcpFetchFactory(INIT_TIMEOUT),
    requestInit: { headers },
  });
  const client = new Client({ name: 'ikarvo', version: '1.0.0' }, { capabilities: {} });
  await client.connect(transport);
  const init = client.getServerVersion();
  const listed = await client.listTools();
  await client.close().catch(() => null);
  const tools = trimTools((listed.tools ?? []).map(t => ({
    name: t.name,
    description: t.description ?? '',
    inputSchema: t.inputSchema,
  })));
  return {
    serverInfo: init ? { name: init.name, version: init.version } : null,
    protocolVersion: null,
    tools,
  };
}

export async function callMcpTool(urlRaw: string, bearerToken: string | undefined, toolName: string, args: Record<string, unknown>) {
  const url = normalizeHttpsUrl(urlRaw);
  const headers: Record<string, string> = {};
  if (bearerToken) headers.Authorization = `Bearer ${bearerToken}`;

  const transport = new StreamableHTTPClientTransport(url, {
    fetch: mcpFetchFactory(CALL_TIMEOUT),
    requestInit: { headers },
  });
  const client = new Client({ name: 'ikarvo', version: '1.0.0' }, { capabilities: {} });
  await client.connect(transport);
  try {
    const result = await client.callTool({ name: toolName, arguments: args });
    return result;
  } finally {
    await client.close().catch(() => null);
  }
}
