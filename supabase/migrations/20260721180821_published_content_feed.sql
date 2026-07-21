create view public.published_content_feed
with (security_barrier = true)
as
select
  content_items.id,
  properties.slug as property_slug,
  content_items.type,
  content_items.slug,
  latest_version.title,
  latest_version.body_mdx,
  latest_version.excerpt,
  latest_version.meta_title,
  latest_version.meta_description,
  latest_version.faq,
  latest_version.json_ld,
  content_items.hero_image_url,
  content_items.published_at,
  content_items.updated_at
from public.content_items
join public.properties
  on properties.id = content_items.property_id
join lateral (
  select
    content_versions.title,
    content_versions.body_mdx,
    content_versions.excerpt,
    content_versions.meta_title,
    content_versions.meta_description,
    content_versions.faq,
    content_versions.json_ld
  from public.content_versions
  where content_versions.content_item_id = content_items.id
  order by content_versions.version desc
  limit 1
) as latest_version on true
where properties.active = true
  and content_items.status = 'published'
  and content_items.slug is not null
  and content_items.published_at is not null;

revoke all on public.published_content_feed from public;
grant select on public.published_content_feed to anon, authenticated;
