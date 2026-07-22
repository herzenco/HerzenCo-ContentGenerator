-- Reviewers can inspect and edit authoring data, and may transition an item
-- from needs_review to approved. Publishing remains limited to admin/publisher.

drop policy if exists "Team can read properties" on public.properties;
create policy "Team can read properties"
  on public.properties for select to authenticated
  using (public.has_app_role('admin', 'publisher', 'reviewer', 'editor', 'viewer'));

drop policy if exists "Team can read brand profiles" on public.brand_profiles;
create policy "Team can read brand profiles"
  on public.brand_profiles for select to authenticated
  using (public.has_app_role('admin', 'publisher', 'reviewer', 'editor', 'viewer'));

drop policy if exists "Team can read brand context docs" on public.brand_context_docs;
create policy "Team can read brand context docs"
  on public.brand_context_docs for select to authenticated
  using (public.has_app_role('admin', 'publisher', 'reviewer', 'editor', 'viewer'));

drop policy if exists "Team can read content items" on public.content_items;
create policy "Team can read content items"
  on public.content_items for select to authenticated
  using (public.has_app_role('admin', 'publisher', 'reviewer', 'editor', 'viewer'));

drop policy if exists "Editors can create review content" on public.content_items;
create policy "Editors can create review content"
  on public.content_items for insert to authenticated
  with check (
    public.has_app_role('admin', 'publisher')
    or (
      public.has_app_role('reviewer', 'editor')
      and status in ('draft', 'in_qa', 'needs_review', 'failed')
    )
  );

drop policy if exists "Editors can update review content" on public.content_items;
create policy "Editors can update review content"
  on public.content_items for update to authenticated
  using (public.has_app_role('admin', 'publisher', 'reviewer', 'editor'))
  with check (
    public.has_app_role('admin', 'publisher')
    or (public.has_app_role('reviewer') and status in ('draft', 'in_qa', 'needs_review', 'approved', 'failed'))
    or (public.has_app_role('editor') and status in ('draft', 'in_qa', 'needs_review', 'failed'))
  );

drop policy if exists "Team can read content versions" on public.content_versions;
create policy "Team can read content versions"
  on public.content_versions for select to authenticated
  using (public.has_app_role('admin', 'publisher', 'reviewer', 'editor', 'viewer'));

drop policy if exists "Editors can create content versions" on public.content_versions;
create policy "Editors can create content versions"
  on public.content_versions for insert to authenticated
  with check (public.has_app_role('admin', 'publisher', 'reviewer', 'editor'));

drop policy if exists "Editors can update content versions" on public.content_versions;
create policy "Editors can update content versions"
  on public.content_versions for update to authenticated
  using (public.has_app_role('admin', 'publisher', 'reviewer', 'editor'))
  with check (public.has_app_role('admin', 'publisher', 'reviewer', 'editor'));

drop policy if exists "Team can read topics" on public.topics;
create policy "Team can read topics"
  on public.topics for select to authenticated
  using (public.has_app_role('admin', 'publisher', 'reviewer', 'editor', 'viewer'));

drop policy if exists "Editors can manage topics" on public.topics;
create policy "Editors can manage topics"
  on public.topics for all to authenticated
  using (public.has_app_role('admin', 'publisher', 'reviewer', 'editor'))
  with check (public.has_app_role('admin', 'publisher', 'reviewer', 'editor'));

drop policy if exists "Team can read eval results" on public.eval_results;
create policy "Team can read eval results"
  on public.eval_results for select to authenticated
  using (public.has_app_role('admin', 'publisher', 'reviewer', 'editor', 'viewer'));

drop policy if exists "Editors can manage eval results" on public.eval_results;
create policy "Editors can manage eval results"
  on public.eval_results for all to authenticated
  using (public.has_app_role('admin', 'publisher', 'reviewer', 'editor'))
  with check (public.has_app_role('admin', 'publisher', 'reviewer', 'editor'));

drop policy if exists "Team can read content metrics" on public.content_metrics_daily;
create policy "Team can read content metrics"
  on public.content_metrics_daily for select to authenticated
  using (public.has_app_role('admin', 'publisher', 'reviewer', 'editor', 'viewer'));
