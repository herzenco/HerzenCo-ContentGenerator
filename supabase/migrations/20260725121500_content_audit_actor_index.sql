create index if not exists content_audit_events_actor_created_idx
  on public.content_audit_events(actor_user_id, created_at desc);
