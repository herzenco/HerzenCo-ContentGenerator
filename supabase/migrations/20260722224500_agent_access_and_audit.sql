alter table public.api_keys
  add column if not exists actor_user_id uuid references auth.users(id) on delete cascade,
  add column if not exists token_prefix text,
  add column if not exists expires_at timestamptz,
  add column if not exists revoked_at timestamptz;

create index if not exists api_keys_actor_user_idx
  on public.api_keys(actor_user_id, revoked_at);

create table if not exists public.agent_audit_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor_user_id uuid references auth.users(id) on delete set null,
  api_key_id uuid references public.api_keys(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists agent_audit_actor_created_idx
  on public.agent_audit_log(actor_user_id, created_at desc);

alter table public.agent_audit_log enable row level security;

create or replace function public.has_app_role(variadic allowed_roles text[])
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select auth.jwt() -> 'app_metadata' ->> 'role') = any(allowed_roles),
    false
  );
$$;

grant execute on function public.has_app_role(variadic text[]) to authenticated, service_role;

drop policy if exists "Authenticated users can manage properties" on public.properties;
drop policy if exists "Authenticated users can manage brand profiles" on public.brand_profiles;
drop policy if exists "Authenticated users can manage topics" on public.topics;
drop policy if exists "Authenticated users can manage content items" on public.content_items;
drop policy if exists "Authenticated users can manage content versions" on public.content_versions;
drop policy if exists "Authenticated users can manage eval results" on public.eval_results;
drop policy if exists "Authenticated users can manage jobs" on public.jobs;
drop policy if exists "Authenticated users can manage job runs" on public.job_runs;
drop policy if exists "Authenticated users can manage schedules" on public.schedules;
drop policy if exists "Authenticated users can manage api keys" on public.api_keys;
drop policy if exists "Authenticated users can manage prompt templates" on public.prompt_templates;
drop policy if exists "Authenticated users can manage brand context docs" on public.brand_context_docs;
drop policy if exists "Authenticated users can manage content metrics" on public.content_metrics_daily;
drop policy if exists "Authenticated users can manage models" on public.models;
drop policy if exists "Authenticated users can manage routing rules" on public.routing_rules;
drop policy if exists "Authenticated users can manage autopilot settings" on public.autopilot_settings;
drop policy if exists "Authenticated editors can manage the published content feed" on public.published_content_feed;

create policy "Team can read properties"
  on public.properties for select to authenticated
  using (public.has_app_role('admin', 'publisher', 'editor', 'viewer'));
create policy "Admins can manage properties"
  on public.properties for all to authenticated
  using (public.has_app_role('admin')) with check (public.has_app_role('admin'));

create policy "Team can read brand profiles"
  on public.brand_profiles for select to authenticated
  using (public.has_app_role('admin', 'publisher', 'editor', 'viewer'));
create policy "Admins can manage brand profiles"
  on public.brand_profiles for all to authenticated
  using (public.has_app_role('admin')) with check (public.has_app_role('admin'));

create policy "Team can read brand context docs"
  on public.brand_context_docs for select to authenticated
  using (public.has_app_role('admin', 'publisher', 'editor', 'viewer'));
create policy "Admins can manage brand context docs"
  on public.brand_context_docs for all to authenticated
  using (public.has_app_role('admin')) with check (public.has_app_role('admin'));

create policy "Team can read content items"
  on public.content_items for select to authenticated
  using (public.has_app_role('admin', 'publisher', 'editor', 'viewer'));
create policy "Editors can create review content"
  on public.content_items for insert to authenticated
  with check (
    public.has_app_role('admin', 'publisher')
    or (public.has_app_role('editor') and status in ('draft', 'in_qa', 'needs_review', 'failed'))
  );
create policy "Editors can update review content"
  on public.content_items for update to authenticated
  using (public.has_app_role('admin', 'publisher', 'editor'))
  with check (
    public.has_app_role('admin', 'publisher')
    or (public.has_app_role('editor') and status in ('draft', 'in_qa', 'needs_review', 'failed'))
  );
create policy "Admins can delete content items"
  on public.content_items for delete to authenticated
  using (public.has_app_role('admin'));

create policy "Team can read content versions"
  on public.content_versions for select to authenticated
  using (public.has_app_role('admin', 'publisher', 'editor', 'viewer'));
create policy "Editors can create content versions"
  on public.content_versions for insert to authenticated
  with check (public.has_app_role('admin', 'publisher', 'editor'));
create policy "Editors can update content versions"
  on public.content_versions for update to authenticated
  using (public.has_app_role('admin', 'publisher', 'editor'))
  with check (public.has_app_role('admin', 'publisher', 'editor'));
create policy "Admins can delete content versions"
  on public.content_versions for delete to authenticated
  using (public.has_app_role('admin'));

create policy "Team can read topics"
  on public.topics for select to authenticated
  using (public.has_app_role('admin', 'publisher', 'editor', 'viewer'));
create policy "Editors can manage topics"
  on public.topics for all to authenticated
  using (public.has_app_role('admin', 'publisher', 'editor'))
  with check (public.has_app_role('admin', 'publisher', 'editor'));

create policy "Team can read eval results"
  on public.eval_results for select to authenticated
  using (public.has_app_role('admin', 'publisher', 'editor', 'viewer'));
create policy "Editors can manage eval results"
  on public.eval_results for all to authenticated
  using (public.has_app_role('admin', 'publisher', 'editor'))
  with check (public.has_app_role('admin', 'publisher', 'editor'));

create policy "Team can read content metrics"
  on public.content_metrics_daily for select to authenticated
  using (public.has_app_role('admin', 'publisher', 'editor', 'viewer'));
create policy "Admins can manage content metrics"
  on public.content_metrics_daily for all to authenticated
  using (public.has_app_role('admin')) with check (public.has_app_role('admin'));

create policy "Admins can manage jobs"
  on public.jobs for all to authenticated
  using (public.has_app_role('admin')) with check (public.has_app_role('admin'));
create policy "Admins can manage job runs"
  on public.job_runs for all to authenticated
  using (public.has_app_role('admin')) with check (public.has_app_role('admin'));
create policy "Admins can manage schedules"
  on public.schedules for all to authenticated
  using (public.has_app_role('admin')) with check (public.has_app_role('admin'));
create policy "Admins can manage API keys"
  on public.api_keys for all to authenticated
  using (public.has_app_role('admin')) with check (public.has_app_role('admin'));
create policy "Admins can manage prompt templates"
  on public.prompt_templates for all to authenticated
  using (public.has_app_role('admin')) with check (public.has_app_role('admin'));
create policy "Admins can manage models"
  on public.models for all to authenticated
  using (public.has_app_role('admin')) with check (public.has_app_role('admin'));
create policy "Admins can manage routing rules"
  on public.routing_rules for all to authenticated
  using (public.has_app_role('admin')) with check (public.has_app_role('admin'));
create policy "Admins can manage autopilot settings"
  on public.autopilot_settings for all to authenticated
  using (public.has_app_role('admin')) with check (public.has_app_role('admin'));

create policy "Publishers can manage published content feed"
  on public.published_content_feed for all to authenticated
  using (public.has_app_role('admin', 'publisher'))
  with check (public.has_app_role('admin', 'publisher'));

create policy "Admins can read agent audit log"
  on public.agent_audit_log for select to authenticated
  using (public.has_app_role('admin'));

revoke all on public.api_keys from authenticated;
grant select, insert, update, delete on public.api_keys to authenticated, service_role;
grant select on public.agent_audit_log to authenticated;
grant all on public.agent_audit_log to service_role;

update public.brand_profiles
set
  voice_description = 'Founder-facing, conversational, confident, human, direct, practical, lightly opinionated, and useful. Sound like an embedded operator inside the work. Open bluntly, show a concrete operating moment in the first 50 words, and get to the reframe quickly. Keep sentences compact and language plain.',
  content_pillars = '["Teams shipping chaos instead of progress", "Stakeholder and developer drift", "Missing ownership of digital work", "Shifting priorities", "Founders forced to translate priorities, chase updates, and clarify requirements", "Output without business progress", "Execution problems misdiagnosed as developer problems", "Embedded project management", "Fractional product leadership", "Product strategy and execution"]'::jsonb,
  banned_topics_claims = '["Xyren or Xelerate", "Emojis", "More than three hashtags", "Em dashes", "Cheesy hooks", "Fake stories", "Unsupported claims or metrics", "Corporate or consultant tone", "Dev-shop positioning", "Generic productivity advice", "Long abstract setup", "Polished marketing CTAs", "Execution glue", "Context switching", "Business intent", "Drive alignment", "Unlock value", "Move the needle", "Video or LinkedIn Live"]'::jsonb,
  style_examples = array[
    'Most founders do not need another productivity tool. They need someone who actually owns follow-through.',
    'If you are translating priorities, chasing updates, clarifying requirements, and checking whether anything moved, you are not leading the work. You are holding it together by hand.',
    'On Tuesday the team changes priorities. By Thursday engineers are waiting on two decisions, and the founder has spent the day answering Slack instead of steering the company. That is not a motivation problem. It is an ownership gap.'
  ]
where property_id = (select id from public.properties where slug = 'herzenco-social');

update public.brand_context_docs
set content_md = content_md
  || E'\n\n## Specificity and edge\nMake the problem felt before explaining it. Put one concrete operating moment in the first 50 words. Cut 20 to 30 percent from a safe first draft. Prefer blunt, compact sentences over polished B2B transitions. Avoid familiar phrases such as execution glue, context switching, business intent, drive alignment, unlock value, and move the needle. Default to 120 to 220 words. End on the reframe, a clean punch, or a genuinely useful question rather than a marketing CTA.'
where property_id = (select id from public.properties where slug = 'herzenco-social')
  and active = true
  and content_md not like '%## Specificity and edge%';
