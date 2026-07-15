create table public.models (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  provider text not null check (provider in ('anthropic', 'openai', 'google', 'replicate')),
  model_id text not null,
  display_name text not null,
  capabilities text[] not null default '{}',
  cost_input_per_mtok numeric,
  cost_output_per_mtok numeric,
  cost_per_image numeric,
  quality_tier text not null check (quality_tier in ('fast', 'standard', 'premium')),
  active boolean not null default true,
  unique (provider, model_id)
);

create table public.routing_rules (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  task text not null check (
    task in ('brief', 'draft', 'qa', 'faq', 'meta', 'image_brief', 'image_gen', 'image_check')
  ),
  property_id uuid references public.properties(id) on delete cascade,
  content_type text,
  language text,
  model_chain uuid[] not null default '{}',
  priority integer not null default 0,
  active boolean not null default true,
  notes text
);

alter table public.properties
  add column images_enabled boolean not null default false;

alter table public.brand_profiles
  add column visual_style_description text,
  add column visual_palette text,
  add column visual_rules jsonb;

alter table public.content_versions
  add column hero_image_alt text;

alter table public.job_runs
  add column registry_model_id uuid references public.models(id) on delete set null,
  add column fallback_used boolean not null default false,
  add column provider_errors jsonb not null default '[]'::jsonb;

create index models_provider_active_idx
  on public.models(provider, active);

create index models_capabilities_idx
  on public.models using gin(capabilities);

create index routing_rules_match_idx
  on public.routing_rules(active, task, priority desc);

create trigger set_models_updated_at
  before update on public.models
  for each row execute function public.set_updated_at();

create trigger set_routing_rules_updated_at
  before update on public.routing_rules
  for each row execute function public.set_updated_at();

alter table public.models enable row level security;
alter table public.routing_rules enable row level security;

create policy "Authenticated users can manage models"
  on public.models
  for all
  to authenticated
  using (true)
  with check (true);

create policy "Authenticated users can manage routing rules"
  on public.routing_rules
  for all
  to authenticated
  using (true)
  with check (true);

grant all on public.models to authenticated, service_role;
grant all on public.routing_rules to authenticated, service_role;

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
    'anthropic',
    'claude-sonnet-4-6',
    'Claude Sonnet 4.6',
    array['text'],
    null,
    null,
    null,
    'premium',
    true
  ),
  (
    'anthropic',
    'claude-haiku-4-6',
    'Claude Haiku 4.6',
    array['text'],
    null,
    null,
    null,
    'fast',
    true
  ),
  (
    'openai',
    'gpt-4.1-mini',
    'OpenAI GPT-4.1 mini',
    array['text'],
    null,
    null,
    null,
    'standard',
    true
  ),
  (
    'openai',
    'gpt-image-1',
    'OpenAI Images',
    array['image_gen', 'vision'],
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

insert into storage.buckets (id, name, public)
values ('hero-images', 'hero-images', true)
on conflict (id) do update set public = excluded.public;
