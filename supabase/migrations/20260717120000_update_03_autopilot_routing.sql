create extension if not exists vector;

alter type public.content_source add value if not exists 'autopilot';
alter type public.prompt_task add value if not exists 'autopilot_prompt';

alter table public.routing_rules
  drop constraint if exists routing_rules_task_check;

alter table public.routing_rules
  add constraint routing_rules_task_check check (
    task in (
      'brief',
      'draft',
      'qa',
      'faq',
      'meta',
      'autopilot_prompt',
      'image_brief',
      'image_gen',
      'image_check'
    )
  );

create table if not exists public.autopilot_settings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  property_id uuid not null references public.properties(id) on delete cascade,
  enabled boolean not null default false,
  cadence text not null default 'weekly' check (
    cadence in ('daily', 'weekly', 'biweekly', 'monthly', 'custom')
  ),
  custom_cron text,
  pieces_per_cycle integer not null default 1 check (
    pieces_per_cycle >= 1 and pieces_per_cycle <= 5
  ),
  publish_time time,
  publish_days text[],
  content_type public.content_type not null default 'article',
  max_queued integer not null default 3 check (max_queued >= 1),
  backlog_priority_threshold integer not null default 7 check (
    backlog_priority_threshold >= 1 and backlog_priority_threshold <= 10
  ),
  last_run_at timestamptz,
  next_run_at timestamptz,
  unique (property_id)
);

alter table public.content_items
  add column if not exists title_embedding vector(1536);

create index if not exists content_items_title_embedding_idx
  on public.content_items
  using ivfflat (title_embedding vector_cosine_ops)
  with (lists = 100)
  where title_embedding is not null;

create trigger set_autopilot_settings_updated_at
  before update on public.autopilot_settings
  for each row execute function public.set_updated_at();

alter table public.autopilot_settings enable row level security;

create policy "Authenticated users can manage autopilot settings"
  on public.autopilot_settings
  for all
  to authenticated
  using (true)
  with check (true);

grant all on public.autopilot_settings to authenticated, service_role;

insert into public.autopilot_settings (
  property_id,
  enabled,
  cadence,
  pieces_per_cycle,
  publish_time,
  publish_days,
  content_type,
  max_queued,
  backlog_priority_threshold
)
select
  properties.id,
  false,
  'weekly',
  1,
  '09:00'::time,
  array['tue'],
  'article'::public.content_type,
  3,
  7
from public.properties
on conflict (property_id) do nothing;

insert into public.models (
  provider,
  model_id,
  display_name,
  capabilities,
  cost_input_per_mtok,
  cost_output_per_mtok,
  cost_per_image,
  quality_tier,
  active
)
values
  (
    'openai',
    'gpt-4.1',
    'OpenAI GPT-4.1',
    array['text'],
    null,
    null,
    null,
    'premium',
    true
  )
on conflict (provider, model_id) do update set
  display_name = excluded.display_name,
  capabilities = excluded.capabilities,
  quality_tier = excluded.quality_tier,
  active = excluded.active;

delete from public.routing_rules
where property_id is null
  and priority = 0
  and task in ('draft', 'qa', 'autopilot_prompt');

with chain as (
  select array_agg(id order by route_order)::uuid[] as model_chain
  from (
    select id, 1 as route_order
    from public.models
    where provider = 'openai' and model_id = 'gpt-4.1'
    union all
    select id, 2 as route_order
    from public.models
    where provider = 'anthropic' and model_id = 'claude-sonnet-4-6'
  ) models
)
insert into public.routing_rules (
  task,
  property_id,
  content_type,
  language,
  model_chain,
  priority,
  active,
  notes
)
select
  'draft',
  null,
  null,
  null,
  chain.model_chain,
  0,
  true,
  'Update 03 routing flip: OpenAI drafts first, Anthropic premium fallback.'
from chain
where cardinality(chain.model_chain) > 0;

with chain as (
  select array_agg(id order by route_order)::uuid[] as model_chain
  from (
    select id, 1 as route_order
    from public.models
    where provider = 'anthropic' and model_id = 'claude-sonnet-4-6'
    union all
    select id, 2 as route_order
    from public.models
    where provider = 'openai' and model_id = 'gpt-4.1-mini'
  ) models
)
insert into public.routing_rules (
  task,
  property_id,
  content_type,
  language,
  model_chain,
  priority,
  active,
  notes
)
select
  'qa',
  null,
  null,
  null,
  chain.model_chain,
  0,
  true,
  'Update 03 routing flip: Anthropic QA first, OpenAI standard fallback.'
from chain
where cardinality(chain.model_chain) > 0;

with chain as (
  select array_agg(id order by route_order)::uuid[] as model_chain
  from (
    select id, 1 as route_order
    from public.models
    where provider = 'anthropic' and model_id = 'claude-sonnet-4-6'
    union all
    select id, 2 as route_order
    from public.models
    where provider = 'openai' and model_id = 'gpt-4.1-mini'
  ) models
)
insert into public.routing_rules (
  task,
  property_id,
  content_type,
  language,
  model_chain,
  priority,
  active,
  notes
)
select
  'autopilot_prompt',
  null,
  null,
  null,
  chain.model_chain,
  0,
  true,
  'Default routed model call for Autopilot prompt generation.'
from chain
where cardinality(chain.model_chain) > 0;
