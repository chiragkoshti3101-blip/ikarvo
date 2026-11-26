-- Private bucket for small server-side state. Today it holds only ai-last-model.json, written by /api/status's
-- companion in lib/aiLastModel.ts so every serverless instance can report which model actually answered.
-- Service role only: no storage policies are granted to anon or authenticated, so the client cannot read or write it.
insert into storage.buckets (id, name, public)
values ('app-state', 'app-state', false)
on conflict (id) do nothing;
