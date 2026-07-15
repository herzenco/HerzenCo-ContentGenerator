create extension if not exists pgcrypto;

create type public.property_language as enum ('en', 'es');
create type public.topic_status as enum ('backlog', 'briefed', 'drafted', 'published', 'rejected');
create type public.topic_source as enum ('manual', 'ai_suggested', 'lupe');
create type public.content_type as enum ('article', 'newsletter', 'social_post');
create type public.content_status as enum (
  'draft',
  'in_qa',
  'needs_review',
  'approved',
  'scheduled',
  'published',
  'failed'
);
create type public.content_source as enum (
  'schedule',
  'quick_generate',
  'api',
  'repurpose'
);
create type public.job_type as enum (
  'generate_brief',
  'generate_draft',
  'run_qa',
  'publish',
  'distribute',
  'suggest_topics'
);
create type public.job_status as enum ('pending', 'running', 'done', 'failed');
create type public.prompt_task as enum ('brief', 'draft', 'qa', 'faq', 'meta');
create type public.schedule_content_type as enum ('article', 'newsletter', 'social_post');

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.properties (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null,
  slug text not null unique,
  base_url text not null,
  language public.property_language not null,
  revalidate_url text,
  revalidate_secret text,
  auto_publish_threshold integer not null default 75 check (
    auto_publish_threshold >= 0 and auto_publish_threshold <= 100
  ),
  active boolean not null default true
);

create table public.brand_profiles (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  property_id uuid not null references public.properties(id) on delete cascade,
  voice_description text not null,
  audience text not null,
  content_pillars jsonb not null default '[]'::jsonb,
  banned_topics_claims jsonb not null default '[]'::jsonb,
  style_examples text[] not null default '{}',
  cta_defaults jsonb not null default '{}'::jsonb,
  unique (property_id)
);

create table public.topics (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  property_id uuid not null references public.properties(id) on delete cascade,
  title text not null,
  angle text,
  keywords text[] not null default '{}',
  priority integer not null default 0,
  status public.topic_status not null default 'backlog',
  source public.topic_source not null default 'manual',
  brief jsonb
);

create table public.content_items (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  property_id uuid not null references public.properties(id) on delete cascade,
  topic_id uuid references public.topics(id) on delete set null,
  type public.content_type not null default 'article',
  slug text,
  status public.content_status not null default 'draft',
  quality_score integer check (quality_score is null or (quality_score >= 0 and quality_score <= 100)),
  publish_at timestamptz,
  published_at timestamptz,
  source public.content_source not null default 'quick_generate',
  hero_image_url text
);

create table public.content_versions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  content_item_id uuid not null references public.content_items(id) on delete cascade,
  version integer not null,
  title text not null,
  body_mdx text not null,
  excerpt text not null,
  meta_title text not null check (char_length(meta_title) <= 60),
  meta_description text not null check (char_length(meta_description) <= 155),
  faq jsonb not null default '[]'::jsonb,
  json_ld jsonb not null default '{}'::jsonb,
  generation_model text,
  prompt_snapshot text,
  unique (content_item_id, version)
);

create table public.eval_results (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  content_version_id uuid not null references public.content_versions(id) on delete cascade,
  check_name text not null,
  score integer not null check (score >= 0 and score <= 100),
  passed boolean not null,
  details jsonb not null default '{}'::jsonb
);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  type public.job_type not null,
  payload jsonb not null default '{}'::jsonb,
  status public.job_status not null default 'pending',
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  run_at timestamptz not null default now()
);

create table public.job_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  status public.job_status not null,
  model text,
  prompt_template_id uuid,
  prompt_template_version integer,
  tokens_in integer check (tokens_in is null or tokens_in >= 0),
  tokens_out integer check (tokens_out is null or tokens_out >= 0),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  error text,
  metadata jsonb not null default '{}'::jsonb
);

create table public.schedules (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  property_id uuid not null references public.properties(id) on delete cascade,
  cadence text not null,
  content_type public.schedule_content_type not null default 'article',
  active boolean not null default true
);

create table public.api_keys (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null,
  key_hash text not null unique,
  scopes text[] not null default '{}',
  last_used_at timestamptz
);

create table public.prompt_templates (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null,
  task public.prompt_task not null,
  template text not null,
  model text not null,
  version integer not null default 1 check (version > 0),
  active boolean not null default true,
  unique (name, version)
);

alter table public.job_runs
  add constraint job_runs_prompt_template_id_fkey
  foreign key (prompt_template_id)
  references public.prompt_templates(id)
  on delete set null;

create unique index content_items_property_slug_unique
  on public.content_items(property_id, slug)
  where slug is not null;

create index topics_property_status_priority_idx
  on public.topics(property_id, status, priority desc, created_at asc);

create index content_items_property_status_published_idx
  on public.content_items(property_id, status, published_at desc);

create index content_items_scheduled_publish_at_idx
  on public.content_items(status, publish_at asc)
  where status = 'scheduled';

create index jobs_status_run_at_idx
  on public.jobs(status, run_at asc);

create index eval_results_content_version_idx
  on public.eval_results(content_version_id);

create trigger set_properties_updated_at
  before update on public.properties
  for each row execute function public.set_updated_at();

create trigger set_brand_profiles_updated_at
  before update on public.brand_profiles
  for each row execute function public.set_updated_at();

create trigger set_topics_updated_at
  before update on public.topics
  for each row execute function public.set_updated_at();

create trigger set_content_items_updated_at
  before update on public.content_items
  for each row execute function public.set_updated_at();

create trigger set_content_versions_updated_at
  before update on public.content_versions
  for each row execute function public.set_updated_at();

create trigger set_eval_results_updated_at
  before update on public.eval_results
  for each row execute function public.set_updated_at();

create trigger set_jobs_updated_at
  before update on public.jobs
  for each row execute function public.set_updated_at();

create trigger set_job_runs_updated_at
  before update on public.job_runs
  for each row execute function public.set_updated_at();

create trigger set_schedules_updated_at
  before update on public.schedules
  for each row execute function public.set_updated_at();

create trigger set_api_keys_updated_at
  before update on public.api_keys
  for each row execute function public.set_updated_at();

create trigger set_prompt_templates_updated_at
  before update on public.prompt_templates
  for each row execute function public.set_updated_at();

alter table public.properties enable row level security;
alter table public.brand_profiles enable row level security;
alter table public.topics enable row level security;
alter table public.content_items enable row level security;
alter table public.content_versions enable row level security;
alter table public.eval_results enable row level security;
alter table public.jobs enable row level security;
alter table public.job_runs enable row level security;
alter table public.schedules enable row level security;
alter table public.api_keys enable row level security;
alter table public.prompt_templates enable row level security;

create policy "Authenticated users can manage properties"
  on public.properties
  for all
  to authenticated
  using (true)
  with check (true);

create policy "Authenticated users can manage brand profiles"
  on public.brand_profiles
  for all
  to authenticated
  using (true)
  with check (true);

create policy "Authenticated users can manage topics"
  on public.topics
  for all
  to authenticated
  using (true)
  with check (true);

create policy "Authenticated users can manage content items"
  on public.content_items
  for all
  to authenticated
  using (true)
  with check (true);

create policy "Authenticated users can manage content versions"
  on public.content_versions
  for all
  to authenticated
  using (true)
  with check (true);

create policy "Authenticated users can manage eval results"
  on public.eval_results
  for all
  to authenticated
  using (true)
  with check (true);

create policy "Authenticated users can manage jobs"
  on public.jobs
  for all
  to authenticated
  using (true)
  with check (true);

create policy "Authenticated users can manage job runs"
  on public.job_runs
  for all
  to authenticated
  using (true)
  with check (true);

create policy "Authenticated users can manage schedules"
  on public.schedules
  for all
  to authenticated
  using (true)
  with check (true);

create policy "Authenticated users can manage api keys"
  on public.api_keys
  for all
  to authenticated
  using (true)
  with check (true);

create policy "Authenticated users can manage prompt templates"
  on public.prompt_templates
  for all
  to authenticated
  using (true)
  with check (true);

grant usage on schema public to authenticated, service_role;
grant all on all tables in schema public to authenticated, service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
grant execute on function public.set_updated_at() to authenticated, service_role;
