create index if not exists agent_audit_api_key_idx
  on public.agent_audit_log(api_key_id);

create index if not exists content_items_topic_idx
  on public.content_items(topic_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
