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
  ),
  (
    'Social Media Content',
    'herzenco-social',
    'https://www.linkedin.com',
    'en',
    null,
    100,
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

insert into public.brand_profiles (
  property_id,
  voice_description,
  audience,
  content_pillars,
  banned_topics_claims,
  style_examples,
  cta_defaults,
  visual_style_description,
  visual_palette,
  visual_rules
)
select
  properties.id,
  'Founder-facing, conversational, confident, human, direct, practical, lightly opinionated, and useful. Sound like an embedded operator who owns execution from inside the work, never a consultant, dev shop, or generic productivity creator. Use mostly we; use I only for genuine ownership or conviction.',
  'Founders at funded startups and established founder-led companies with digital products, especially non-technical founders navigating product and engineering complexity, shifting priorities, missing ownership, and stakeholder/developer drift.',
  '["Teams shipping chaos instead of progress", "Stakeholder and developer drift", "Missing ownership of digital work", "Shifting priorities", "Founders acting as translator and execution glue", "Output without business progress", "Execution problems misdiagnosed as developer problems", "Embedded project management", "Fractional product leadership", "Product strategy and execution"]'::jsonb,
  '["Xyren or Xelerate", "Emojis", "Hashtags unless requested", "Em dashes", "Cheesy hooks", "Fake stories", "Unsupported claims or metrics", "Corporate or consultant tone", "Dev-shop positioning", "Generic productivity advice", "Fluff", "Leading with website, build, or development work"]'::jsonb,
  array[
    'Lead with a founder problem that feels immediately familiar, explain the operating failure underneath it, then offer one practical change the team can use this week.',
    'The team can be shipping every week and still not be making progress. Output is not the same as execution when priorities move, decisions disappear, and nobody owns the path from stakeholder intent to what engineering builds.',
    'Keep the translator role implicit. Show that we understand where business intent gets lost and how an embedded owner closes the gap.'
  ],
  '{"guidance":"Use no CTA when the insight lands cleanly. When useful, end with a low-pressure founder-facing question or an invitation to compare how execution ownership works inside their team. Never force a sales pitch."}'::jsonb,
  '',
  '',
  '["LinkedIn posts are text-first", "Do not generate an image unless explicitly requested", "Keep requested visuals editorial, restrained, and operator-led"]'::jsonb
from public.properties
where slug = 'herzenco-social'
on conflict (property_id) do update set
  voice_description = excluded.voice_description,
  audience = excluded.audience,
  content_pillars = excluded.content_pillars,
  banned_topics_claims = excluded.banned_topics_claims,
  style_examples = excluded.style_examples,
  cta_defaults = excluded.cta_defaults,
  visual_style_description = excluded.visual_style_description,
  visual_palette = excluded.visual_palette,
  visual_rules = excluded.visual_rules;

insert into public.brand_context_docs (
  property_id,
  title,
  content_md,
  source,
  active,
  sort_order
)
select
  properties.id,
  'Herzen Co. — LinkedIn Content Strategy (July 22, 2026)',
  $guide$# Herzen Co. — LinkedIn Content Strategy

Write directly to founders at funded startups and established founder-led digital-product companies, especially non-technical founders navigating product and engineering complexity. Position Herzen Co. as an embedded execution partner personally led by Herzen, not a consultant or dev shop.

Lead with a real problem, make the pain specific, diagnose why it happens, offer a practical fix or reframe, and end cleanly. Center stakeholder/developer drift, teams shipping chaos instead of progress, missing ownership, shifting priorities, founders forced to translate between business and technical teams, and output without business progress.

Use a conversational, confident, human, direct, useful, lightly opinionated operator voice. Use mostly “we,” with “I” only when it adds ownership or conviction. The reader should feel: “This person gets the chaos I’m dealing with” and “I need this person inside my team.”

Never mention Xyren or Xelerate. Use no emojis, hashtags unless requested, em dashes, cheesy hooks, fake stories, vague inspiration, unsupported claims, corporate language, consultant tone, dev-shop positioning, generic productivity advice, fluff, or excessive formatting. Keep build and website work in the background unless explicitly requested.

Default to 150–300 words. Return: Title; LinkedIn post draft; Primary pain angle; Why this angle should resonate; Suggested CTA, if any. Vary posts across pain diagnosis, execution lessons, founder reframes, operating principles, team dysfunction, and practical how-we-think posts.$guide$,
  'written',
  true,
  0
from public.properties
where slug = 'herzenco-social'
and not exists (
  select 1
  from public.brand_context_docs existing
  where existing.property_id = properties.id
    and existing.title = 'Herzen Co. — LinkedIn Content Strategy (July 22, 2026)'
);
