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
  'Clear, strategic, practical, and founder-led. Write with confidence, avoid hype, and make ideas useful for operators.',
  'Business owners, founders, and leaders looking for practical strategy, systems, and AI-enabled growth.',
  '["AI operations", "business systems", "content strategy", "founder leverage"]'::jsonb,
  '["Unverifiable revenue claims", "fabricated customer stories", "guaranteed outcomes"]'::jsonb,
  array[
    'Useful beats flashy. Explain the operating principle, then show how to apply it.',
    'Write for a smart operator who wants signal, not filler.'
  ],
  '{"primary_cta":"Work with Herzen Co.","secondary_cta":"Read more insights"}'::jsonb
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
  'Humanista, reflexivo, claro y esperanzador. Escribe en espanol natural, con profundidad accesible y sin exagerar.',
  'Lectores hispanohablantes interesados en crecimiento humano, tecnologia, cultura y evolucion personal.',
  '["humanismo", "evolucion personal", "tecnologia consciente", "cultura"]'::jsonb,
  '["Promesas terapeuticas", "afirmaciones medicas no verificadas", "citas inventadas"]'::jsonb,
  array[
    'La claridad tambien puede ser profunda cuando evita la solemnidad innecesaria.',
    'Explica la idea, aterrizala en la vida diaria y termina con una invitacion humana.'
  ],
  '{"primary_cta":"Explora mas ideas","secondary_cta":"Comparte esta reflexion"}'::jsonb
from public.properties
where slug = 'humanismo-evolutivo'
on conflict (property_id) do update set
  voice_description = excluded.voice_description,
  audience = excluded.audience,
  content_pillars = excluded.content_pillars,
  banned_topics_claims = excluded.banned_topics_claims,
  style_examples = excluded.style_examples,
  cta_defaults = excluded.cta_defaults;
