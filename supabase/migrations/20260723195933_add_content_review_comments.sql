create table if not exists public.content_review_comments (
  id uuid primary key default gen_random_uuid(),
  content_item_id uuid not null references public.content_items(id) on delete cascade,
  content_version integer not null check (content_version > 0),
  author_user_id uuid references auth.users(id) on delete set null,
  author_email text not null check (char_length(author_email) between 3 and 320),
  body text not null check (char_length(body) between 1 and 5000),
  anchor_text text check (anchor_text is null or char_length(anchor_text) <= 5000),
  status text not null default 'open' check (status in ('open', 'applied')),
  applied_in_version integer check (applied_in_version is null or applied_in_version > content_version),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists content_review_comments_item_status_idx
  on public.content_review_comments(content_item_id, status, created_at);

create index if not exists content_review_comments_author_idx
  on public.content_review_comments(author_user_id);

alter table public.content_review_comments enable row level security;

create policy "Team can read review comments"
  on public.content_review_comments for select to authenticated
  using (public.has_app_role('admin', 'publisher', 'reviewer', 'editor', 'viewer'));

create policy "Review team can create comments"
  on public.content_review_comments for insert to authenticated
  with check (
    public.has_app_role('admin', 'publisher', 'reviewer', 'editor')
    and (select auth.uid()) = author_user_id
  );

create policy "Review team can update comment status"
  on public.content_review_comments for update to authenticated
  using (public.has_app_role('admin', 'publisher', 'reviewer', 'editor'))
  with check (public.has_app_role('admin', 'publisher', 'reviewer', 'editor'));

grant select, insert, update on public.content_review_comments to authenticated;
grant all on public.content_review_comments to service_role;
