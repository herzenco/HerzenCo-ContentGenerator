insert into public.properties (
  name,
  slug,
  base_url,
  language,
  revalidate_url,
  auto_publish_threshold,
  active
)
values
  (
    'Herzen Co.',
    'herzenco',
    'https://herzenco.co',
    'en',
    'https://herzenco.co/api/revalidate',
    75,
    true
  ),
  (
    'Humanismo Evolutivo',
    'humanismo-evolutivo',
    'https://humanismoevolutivo.com',
    'es',
    'https://humanismoevolutivo.com/api/revalidate',
    75,
    true
  )
on conflict (slug) do update set
  name = excluded.name,
  base_url = excluded.base_url,
  language = excluded.language,
  revalidate_url = excluded.revalidate_url,
  auto_publish_threshold = excluded.auto_publish_threshold,
  active = excluded.active;

insert into public.brand_profiles (
  property_id,
  voice_description,
  audience,
  content_pillars,
  banned_topics_claims,
  style_examples,
  cta_defaults
)
select
  properties.id,
  '',
  '',
  '[]'::jsonb,
  '[]'::jsonb,
  array[]::text[],
  '{}'::jsonb
from public.properties
where slug = 'herzenco'
on conflict (property_id) do update set
  voice_description = excluded.voice_description,
  audience = excluded.audience,
  content_pillars = excluded.content_pillars,
  banned_topics_claims = excluded.banned_topics_claims,
  style_examples = excluded.style_examples,
  cta_defaults = excluded.cta_defaults;

insert into public.brand_profiles (
  property_id,
  voice_description,
  audience,
  content_pillars,
  banned_topics_claims,
  style_examples,
  cta_defaults
)
select
  properties.id,
  '',
  '',
  '[]'::jsonb,
  '[]'::jsonb,
  array[]::text[],
  '{}'::jsonb
from public.properties
where slug = 'humanismo-evolutivo'
on conflict (property_id) do update set
  voice_description = excluded.voice_description,
  audience = excluded.audience,
  content_pillars = excluded.content_pillars,
  banned_topics_claims = excluded.banned_topics_claims,
  style_examples = excluded.style_examples,
  cta_defaults = excluded.cta_defaults;
