-- Unified MCP connections (per user) and integration activity audit log.

create table if not exists public.mcp_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null default '',
  url text not null,
  server_info jsonb not null default '{}'::jsonb,
  tools jsonb not null default '[]'::jsonb,
  allowed_tools text[] not null default '{}',
  bearer_token text,
  status text not null default 'connected' check (status in ('connected','error')),
  last_error text,
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists mcp_connections_user_idx on public.mcp_connections (user_id, updated_at desc);
alter table public.mcp_connections enable row level security;
drop policy if exists "own mcp connections" on public.mcp_connections;
create policy "own mcp connections" on public.mcp_connections for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists public.integration_activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  source text not null,
  connection_id uuid references public.mcp_connections(id) on delete set null,
  action text not null,
  tool_name text,
  status text not null check (status in ('ok','denied','error')),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists integration_activity_user_idx on public.integration_activity (user_id, created_at desc);
alter table public.integration_activity enable row level security;
drop policy if exists "own integration activity" on public.integration_activity;
create policy "own integration activity" on public.integration_activity for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
