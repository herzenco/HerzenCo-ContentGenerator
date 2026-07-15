create table public.brand_context_docs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  property_id uuid not null references public.properties(id) on delete cascade,
  title text not null,
  content_md text not null check (char_length(content_md) <= 50000),
  source text not null check (source in ('upload', 'written')),
  active boolean not null default true,
  sort_order integer not null default 0
);

create table public.content_metrics_daily (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  content_item_id uuid not null references public.content_items(id) on delete cascade,
  date date not null,
  pageviews integer not null default 0 check (pageviews >= 0),
  gsc_impressions integer check (gsc_impressions is null or gsc_impressions >= 0),
  gsc_clicks integer check (gsc_clicks is null or gsc_clicks >= 0),
  gsc_avg_position numeric check (gsc_avg_position is null or gsc_avg_position >= 0),
  unique (content_item_id, date)
);

alter table public.content_versions
  add column context_hash text,
  add column social_meta jsonb not null default '{}'::jsonb;

create index brand_context_docs_property_order_idx
  on public.brand_context_docs(property_id, active, sort_order asc);

create index content_metrics_daily_item_date_idx
  on public.content_metrics_daily(content_item_id, date desc);

create trigger set_brand_context_docs_updated_at
  before update on public.brand_context_docs
  for each row execute function public.set_updated_at();

create trigger set_content_metrics_daily_updated_at
  before update on public.content_metrics_daily
  for each row execute function public.set_updated_at();

alter table public.brand_context_docs enable row level security;
alter table public.content_metrics_daily enable row level security;

create policy "Authenticated users can manage brand context docs"
  on public.brand_context_docs
  for all
  to authenticated
  using (true)
  with check (true);

create policy "Authenticated users can manage content metrics"
  on public.content_metrics_daily
  for all
  to authenticated
  using (true)
  with check (true);

grant all on public.brand_context_docs to authenticated, service_role;
grant all on public.content_metrics_daily to authenticated, service_role;
