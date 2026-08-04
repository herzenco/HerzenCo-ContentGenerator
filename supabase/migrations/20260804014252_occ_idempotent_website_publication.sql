-- Bring production publication reads forward and persist OCC's approved package identity.

alter type public.content_status add value if not exists 'unpublished';

alter table public.content_items
  add column if not exists unpublished_at timestamptz,
  add column if not exists unpublished_by uuid references auth.users(id) on delete set null,
  add column if not exists unpublish_reason text,
  add column if not exists publication_sync_status text,
  add column if not exists publication_sync_error text,
  add column if not exists publication_sync_updated_at timestamptz,
  add column if not exists external_source text,
  add column if not exists external_source_id text,
  add column if not exists destination text,
  add column if not exists canonical_path text,
  add column if not exists approved_content_hash text,
  add column if not exists publication_metadata jsonb not null default '{}'::jsonb;

alter table public.content_versions
  add column if not exists content_hash text,
  add column if not exists keywords text[] not null default '{}'::text[],
  add column if not exists media jsonb not null default '[]'::jsonb,
  add column if not exists author_name text,
  add column if not exists tags text[] not null default '{}'::text[],
  add column if not exists categories text[] not null default '{}'::text[],
  add column if not exists destination text,
  add column if not exists canonical_path text,
  add column if not exists source_snapshot jsonb not null default '{}'::jsonb;

alter table public.published_content_feed
  add column if not exists visible boolean not null default true,
  add column if not exists keywords text[] not null default '{}'::text[],
  add column if not exists media jsonb not null default '[]'::jsonb,
  add column if not exists author_name text,
  add column if not exists tags text[] not null default '{}'::text[],
  add column if not exists categories text[] not null default '{}'::text[],
  add column if not exists destination text,
  add column if not exists canonical_path text,
  add column if not exists external_source_id text,
  add column if not exists approved_content_hash text;

create unique index if not exists content_items_external_source_id_idx
  on public.content_items(external_source, external_source_id)
  where external_source is not null and external_source_id is not null;

create unique index if not exists content_versions_item_hash_idx
  on public.content_versions(content_item_id, content_hash)
  where content_hash is not null;

create index if not exists content_items_destination_idx
  on public.content_items(property_id, destination, status);

drop policy if exists "Public can read the published content feed" on public.published_content_feed;
drop policy if exists "Public can read visible published content" on public.published_content_feed;
create policy "Public can read visible published content"
  on public.published_content_feed
  for select
  to anon
  using (visible);

grant all on public.content_items, public.content_versions, public.published_content_feed to service_role;

comment on column public.content_items.external_source_id is
  'Stable source-system record identity used to update, never duplicate, website content.';
comment on column public.content_versions.content_hash is
  'Hash of the immutable approved content package; identical retries reuse the existing version.';
