create index if not exists content_items_unpublished_by_idx
  on public.content_items(unpublished_by)
  where unpublished_by is not null;
