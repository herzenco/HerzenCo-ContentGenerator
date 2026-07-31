create table if not exists public.property_feedback_rules (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete restrict,
  entry_type text not null check (entry_type in ('feedback', 'edit', 'rule')),
  instruction text not null check (length(trim(instruction)) > 0),
  rationale text,
  source_comment_id uuid references public.content_review_comments(id) on delete restrict,
  source_content_item_id uuid references public.content_items(id) on delete restrict,
  supersedes_id uuid references public.property_feedback_rules(id) on delete restrict,
  created_by uuid references auth.users(id) on delete set null,
  created_by_email text,
  created_at timestamptz not null default now()
);

create index if not exists property_feedback_rules_property_created_idx
  on public.property_feedback_rules(property_id, created_at desc);

create unique index if not exists property_feedback_rules_comment_idx
  on public.property_feedback_rules(source_comment_id)
  where source_comment_id is not null;

alter table public.property_feedback_rules enable row level security;

create policy "Content team can read property feedback rules"
  on public.property_feedback_rules
  for select
  to authenticated
  using (
    coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in
      ('admin', 'publisher', 'reviewer', 'editor', 'viewer')
  );

revoke insert, update, delete on public.property_feedback_rules from anon, authenticated;
grant select on public.property_feedback_rules to authenticated;
grant all on public.property_feedback_rules to service_role;

create table if not exists public.property_research_entries (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete restrict,
  title text not null check (length(trim(title)) > 0),
  body text not null check (length(trim(body)) > 0),
  source_url text,
  original_filename text,
  status text not null default 'active' check (status in ('active', 'sunset')),
  expires_at timestamptz not null default (now() + interval '90 days'),
  sunset_at timestamptz,
  sunset_reason text,
  supersedes_id uuid references public.property_research_entries(id) on delete restrict,
  created_by uuid references auth.users(id) on delete set null,
  created_by_email text,
  created_at timestamptz not null default now()
);

create index if not exists property_research_entries_property_created_idx
  on public.property_research_entries(property_id, created_at desc);

create index if not exists property_research_entries_active_expiry_idx
  on public.property_research_entries(property_id, expires_at)
  where status = 'active';

alter table public.property_research_entries enable row level security;

create policy "Content team can read property research"
  on public.property_research_entries
  for select
  to authenticated
  using (
    coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in
      ('admin', 'publisher', 'reviewer', 'editor', 'viewer')
  );

revoke insert, update, delete on public.property_research_entries from anon, authenticated;
grant select on public.property_research_entries to authenticated;
grant all on public.property_research_entries to service_role;

create table if not exists public.property_research_usage (
  id uuid primary key default gen_random_uuid(),
  research_entry_id uuid not null references public.property_research_entries(id) on delete restrict,
  content_item_id uuid not null references public.content_items(id) on delete restrict,
  match_score numeric(5,4) not null,
  match_detail text,
  created_at timestamptz not null default now(),
  unique (research_entry_id, content_item_id)
);

create index if not exists property_research_usage_entry_created_idx
  on public.property_research_usage(research_entry_id, created_at desc);

alter table public.property_research_usage enable row level security;

create policy "Content team can read property research usage"
  on public.property_research_usage
  for select
  to authenticated
  using (
    coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in
      ('admin', 'publisher', 'reviewer', 'editor', 'viewer')
  );

revoke insert, update, delete on public.property_research_usage from anon, authenticated;
grant select on public.property_research_usage to authenticated;
grant all on public.property_research_usage to service_role;
