alter type public.content_status add value if not exists 'rejected';

create table if not exists public.content_audit_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  content_item_id uuid not null references public.content_items(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_email text not null,
  actor_type text not null check (actor_type in ('user', 'agent', 'system', 'website')),
  action text not null,
  content_version integer,
  changes jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists content_audit_events_item_created_idx
  on public.content_audit_events(content_item_id, created_at desc);

alter table public.content_audit_events enable row level security;

drop policy if exists "Team can read content audit events" on public.content_audit_events;
create policy "Team can read content audit events"
  on public.content_audit_events for select to authenticated
  using (public.has_app_role('admin', 'publisher', 'reviewer', 'editor', 'viewer'));

revoke insert, update, delete on public.content_audit_events from anon, authenticated;
grant select on public.content_audit_events to authenticated;
grant all on public.content_audit_events to service_role;

insert into public.content_audit_events (
  created_at,
  content_item_id,
  actor_user_id,
  actor_email,
  actor_type,
  action,
  content_version,
  changes,
  metadata
)
select
  log.created_at,
  log.target_id::uuid,
  log.actor_user_id,
  coalesce(users.email, case when log.api_key_id is not null then 'lupe@herzenco.co' else 'system@herzenco.co' end),
  case when log.api_key_id is not null then 'agent' else 'user' end,
  log.action,
  case when (log.metadata ->> 'version') ~ '^[0-9]+$' then (log.metadata ->> 'version')::integer else null end,
  '[]'::jsonb,
  log.metadata || jsonb_build_object('historical', true)
from public.agent_audit_log log
left join auth.users users on users.id = log.actor_user_id
where log.target_type = 'content_item'
  and log.target_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and exists (select 1 from public.content_items item where item.id = log.target_id::uuid);

insert into public.content_audit_events (
  created_at,
  content_item_id,
  actor_email,
  actor_type,
  action,
  content_version,
  changes,
  metadata
)
select
  version.created_at,
  version.content_item_id,
  'historical@system'::text,
  'system',
  'content.version_snapshot',
  version.version,
  jsonb_build_array(
    jsonb_build_object('field', 'title', 'before', null, 'after', version.title),
    jsonb_build_object('field', 'body', 'before', null, 'after', version.body_mdx),
    jsonb_build_object('field', 'excerpt', 'before', null, 'after', version.excerpt),
    jsonb_build_object('field', 'meta_title', 'before', null, 'after', version.meta_title),
    jsonb_build_object('field', 'meta_description', 'before', null, 'after', version.meta_description)
  ),
  jsonb_build_object('historical', true, 'source', 'content_versions_backfill')
from public.content_versions version
where not exists (
  select 1 from public.content_audit_events audit
  where audit.content_item_id = version.content_item_id
    and audit.action = 'content.version_snapshot'
    and audit.content_version = version.version
);
