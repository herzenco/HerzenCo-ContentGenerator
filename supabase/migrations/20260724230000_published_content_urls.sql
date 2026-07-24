alter table public.content_items
  add column if not exists published_url text;

comment on column public.content_items.published_url is
  'Canonical public URL returned to agents after publication and replaceable by the website confirmation callback.';
