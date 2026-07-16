create or replace function public.enforce_herzenco_auth_domain()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.email is null or lower(new.email) !~ '^[^@]+@herzenco\.co$' then
    raise exception 'Only @herzenco.co email addresses can create accounts'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_herzenco_auth_domain on auth.users;

create trigger enforce_herzenco_auth_domain
  before insert or update of email on auth.users
  for each row execute function public.enforce_herzenco_auth_domain();
