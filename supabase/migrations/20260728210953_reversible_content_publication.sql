alter type public.content_status add value if not exists 'unpublished';

alter table public.content_items
  add column if not exists unpublished_at timestamptz,
  add column if not exists unpublished_by uuid references auth.users(id) on delete set null,
  add column if not exists unpublish_reason text,
  add column if not exists publication_sync_status text,
  add column if not exists publication_sync_error text,
  add column if not exists publication_sync_updated_at timestamptz;

alter table public.published_content_feed
  add column if not exists visible boolean not null default true;

drop policy if exists "Public can read the published content feed"
  on public.published_content_feed;
create policy "Public can read visible published content"
  on public.published_content_feed
  for select
  to anon
  using (visible);

alter table public.content_items
  drop constraint if exists content_items_publication_sync_status_check;

alter table public.content_items
  add constraint content_items_publication_sync_status_check
  check (
    publication_sync_status is null
    or publication_sync_status in ('pending', 'synced', 'failed')
  );

create index if not exists content_items_publication_sync_idx
  on public.content_items(publication_sync_status, publication_sync_updated_at)
  where publication_sync_status in ('pending', 'failed');

create or replace function public.enforce_unpublished_content_transition()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.status = 'unpublished' and old.status <> 'published' then
    raise exception 'only_published_content_can_be_unpublished';
  end if;
  if old.status = 'unpublished' and new.status <> 'unpublished' and new.status <> 'published' then
    raise exception 'unpublished_content_can_only_be_republished';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_unpublished_content_transition
  on public.content_items;
create trigger enforce_unpublished_content_transition
  before update of status on public.content_items
  for each row
  when (old.status is distinct from new.status)
  execute function public.enforce_unpublished_content_transition();

create or replace function public.unpublish_content_item(
  p_content_id uuid,
  p_actor_user_id uuid,
  p_actor_email text,
  p_reason text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item public.content_items%rowtype;
  v_version integer;
  v_now timestamptz := now();
begin
  if p_actor_user_id is null or nullif(trim(p_actor_email), '') is null then
    raise exception 'actor_identity_required';
  end if;
  if not exists (
    select 1
      from auth.users
     where id = p_actor_user_id
       and lower(email) = lower(trim(p_actor_email))
       and raw_app_meta_data ->> 'role' in ('admin', 'publisher')
  ) then
    raise exception 'admin_or_publisher_required';
  end if;

  select *
    into v_item
    from public.content_items
   where id = p_content_id
   for update;

  if not found then
    raise exception 'content_not_found';
  end if;
  if v_item.status <> 'published' then
    raise exception 'only_published_content_can_be_unpublished';
  end if;

  select max(version) into v_version
    from public.content_versions
   where content_item_id = p_content_id;

  update public.content_items
     set status = 'unpublished',
         unpublished_at = v_now,
         unpublished_by = p_actor_user_id,
         unpublish_reason = nullif(trim(p_reason), ''),
         publication_sync_status = 'pending',
         publication_sync_error = null,
         publication_sync_updated_at = v_now
   where id = p_content_id;

  update public.published_content_feed
     set visible = false,
         updated_at = v_now
   where id = p_content_id;

  insert into public.content_audit_events (
    content_item_id, actor_user_id, actor_email, actor_type, action,
    content_version, changes, metadata
  )
  values (
    p_content_id, p_actor_user_id, lower(trim(p_actor_email)), 'user',
    'content.unpublish', v_version,
    jsonb_build_array(
      jsonb_build_object('field', 'status', 'before', 'published', 'after', 'unpublished'),
      jsonb_build_object('field', 'unpublished_at', 'before', v_item.unpublished_at, 'after', v_now),
      jsonb_build_object('field', 'unpublished_by', 'before', v_item.unpublished_by, 'after', p_actor_user_id),
      jsonb_build_object('field', 'unpublish_reason', 'before', v_item.unpublish_reason, 'after', nullif(trim(p_reason), '')),
      jsonb_build_object('field', 'publication_sync_status', 'before', v_item.publication_sync_status, 'after', 'pending')
    ),
    jsonb_build_object(
      'published_at', v_item.published_at,
      'published_url', v_item.published_url,
      'reversible', true
    )
  );

  return jsonb_build_object(
    'id', p_content_id,
    'status', 'unpublished',
    'unpublishedAt', v_now,
    'unpublishedBy', p_actor_user_id,
    'unpublishReason', nullif(trim(p_reason), ''),
    'publicationSyncStatus', 'pending',
    'publishedAt', v_item.published_at,
    'publishedUrl', v_item.published_url
  );
end;
$$;

create or replace function public.republish_content_item(
  p_content_id uuid,
  p_actor_user_id uuid,
  p_actor_email text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item public.content_items%rowtype;
  v_version public.content_versions%rowtype;
  v_property_slug text;
  v_now timestamptz := now();
begin
  if p_actor_user_id is null or nullif(trim(p_actor_email), '') is null then
    raise exception 'actor_identity_required';
  end if;
  if not exists (
    select 1
      from auth.users
     where id = p_actor_user_id
       and lower(email) = lower(trim(p_actor_email))
       and raw_app_meta_data ->> 'role' in ('admin', 'publisher')
  ) then
    raise exception 'admin_or_publisher_required';
  end if;

  select *
    into v_item
    from public.content_items
   where id = p_content_id
   for update;

  if not found then
    raise exception 'content_not_found';
  end if;
  if v_item.status <> 'unpublished' then
    raise exception 'only_unpublished_content_can_be_republished';
  end if;
  if v_item.slug is null then
    raise exception 'published_slug_missing';
  end if;

  select *
    into v_version
    from public.content_versions
   where content_item_id = p_content_id
   order by version desc
   limit 1;

  if not found then
    raise exception 'content_version_missing';
  end if;

  select slug into v_property_slug
    from public.properties
   where id = v_item.property_id;

  if v_property_slug is null then
    raise exception 'property_not_found';
  end if;

  update public.content_items
     set status = 'published',
         published_at = v_now,
         publication_sync_status = 'pending',
         publication_sync_error = null,
         publication_sync_updated_at = v_now
   where id = p_content_id;

  insert into public.published_content_feed (
    id, property_slug, type, slug, title, body_mdx, excerpt, meta_title,
    meta_description, faq, json_ld, hero_image_url, published_at, updated_at,
    visible
  )
  values (
    p_content_id, v_property_slug, v_item.type, v_item.slug, v_version.title,
    v_version.body_mdx, v_version.excerpt, v_version.meta_title,
    v_version.meta_description, v_version.faq, v_version.json_ld,
    v_item.hero_image_url, v_now, v_now, true
  )
  on conflict (id) do update set
    property_slug = excluded.property_slug,
    type = excluded.type,
    slug = excluded.slug,
    title = excluded.title,
    body_mdx = excluded.body_mdx,
    excerpt = excluded.excerpt,
    meta_title = excluded.meta_title,
    meta_description = excluded.meta_description,
    faq = excluded.faq,
    json_ld = excluded.json_ld,
    hero_image_url = excluded.hero_image_url,
    published_at = excluded.published_at,
    updated_at = excluded.updated_at,
    visible = true;

  insert into public.content_audit_events (
    content_item_id, actor_user_id, actor_email, actor_type, action,
    content_version, changes, metadata
  )
  values (
    p_content_id, p_actor_user_id, lower(trim(p_actor_email)), 'user',
    'content.republish', v_version.version,
    jsonb_build_array(
      jsonb_build_object('field', 'status', 'before', 'unpublished', 'after', 'published'),
      jsonb_build_object('field', 'published_at', 'before', v_item.published_at, 'after', v_now),
      jsonb_build_object('field', 'publication_sync_status', 'before', v_item.publication_sync_status, 'after', 'pending')
    ),
    jsonb_build_object(
      'prior_unpublished_at', v_item.unpublished_at,
      'prior_unpublished_by', v_item.unpublished_by,
      'prior_unpublish_reason', v_item.unpublish_reason,
      'republication', true
    )
  );

  return jsonb_build_object(
    'id', p_content_id,
    'status', 'published',
    'publishedAt', v_now,
    'publishedUrl', v_item.published_url,
    'publicationSyncStatus', 'pending',
    'version', v_version.version
  );
end;
$$;

revoke all on function public.unpublish_content_item(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.republish_content_item(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.enforce_unpublished_content_transition() from public, anon, authenticated;
grant execute on function public.unpublish_content_item(uuid, uuid, text, text) to service_role;
grant execute on function public.republish_content_item(uuid, uuid, text) to service_role;

comment on function public.unpublish_content_item(uuid, uuid, text, text) is
  'Atomically unpublishes content, hides its preserved public-feed record, and records the human audit event.';
comment on function public.republish_content_item(uuid, uuid, text) is
  'Atomically restores unpublished content from its latest preserved version and records the human audit event.';
