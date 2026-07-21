drop view public.published_content_feed;

create table public.published_content_feed (
  id uuid primary key references public.content_items(id) on delete cascade,
  property_slug text not null,
  type public.content_type not null,
  slug text not null,
  title text not null,
  body_mdx text not null,
  excerpt text not null,
  meta_title text not null,
  meta_description text not null,
  faq jsonb not null default '[]'::jsonb,
  json_ld jsonb not null default '{}'::jsonb,
  hero_image_url text,
  published_at timestamptz not null,
  updated_at timestamptz not null default now(),
  unique (property_slug, slug)
);

alter table public.published_content_feed enable row level security;

create policy "Public can read the published content feed"
  on public.published_content_feed
  for select
  to anon
  using (true);

create policy "Authenticated editors can manage the published content feed"
  on public.published_content_feed
  for all
  to authenticated
  using (true)
  with check (true);

grant select on public.published_content_feed to anon;
grant all on public.published_content_feed to authenticated, service_role;
