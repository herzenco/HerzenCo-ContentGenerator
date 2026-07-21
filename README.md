# Herzen Content Engine

Centralized content hub for generating, quality-checking, publishing, and distributing AI-written content to Herzen Co. properties.

Launch targets:

- `herzenco.co` for English content
- `humanismoevolutivo.com` for Spanish content

The engine is the hub. The sites are thin consumers that will fetch published content through the engine's Content API.

The primary manual workflow is Quick Generate: submit a short prompt, pick the target property, optionally set a publish date, and let the same queued pipeline draft, QA, enrich, publish, schedule, or route the item to review.

## Phase 0 Status

This repo currently contains the Phase 0 foundation:

- Next.js 16 App Router with TypeScript, Tailwind, and ESLint
- Clickable local operator console with browser-persisted workspace data
- Supabase schema migration for the v1 data model
- Supabase seed file for both launch properties with empty brand profiles ready for setup
- Environment variable template
- Project memory log for future agent handoffs

The local console lets you exercise Quick Generate, review approvals, regeneration, publishing, scheduled items, topic loading, brand profile edits, and settings. Quick Generate now sends authenticated server-side requests to the configured Anthropic or OpenAI provider. Supabase persistence, cron execution, the public Content API, and external API authentication are still later implementation phases.

## Update 01: Properties, Context, Performance

The local console now includes the first version of Update 01:

- **Properties** replaces the standalone brand profile area. Each property has Profile, Content, and Settings tabs.
- Property profiles include structured brand fields, style examples, default CTAs, and editable/uploadable Markdown or text context documents.
- Quick Generate refuses to run when the selected property profile is incomplete and points the operator to the Profile tab.
- The simulated pipeline assembles full brand context, stamps a `contextHash`, and displays Brand Alignment in QA results.
- SEO/AEO gates now run as named evals, with hard gates for heading hierarchy, metadata, slug, answer-first structure, FAQ structure, and JSON-LD validity.
- Generated content includes `socialMeta` for Open Graph fields.
- **Performance** shows first-party pageview metrics, article-level rows, date range filters, and graceful Search Console degradation.
- `POST /api/metrics/beacon` validates the pageview beacon payload and returns a local stub response until Supabase persistence is connected.

The drop-in website beacon lives in `site-integration/`. Deploy the one-file snippet to both `herzenco.co` and `humanismoevolutivo.com` once those sites are ready to report pageviews.

## Update 02: Models and Images

The local console now includes Update 02 as an additive layer:

- Settings includes a **Models** section with registry rows, editable display names, active toggles, add-model form, routing-rule form, and the recommended cross-provider QA route.
- With zero active routing rules, generation still uses the existing prompt-template/default behavior.
- Routing rules are fallback chains. Missing provider keys are treated as config misses and fall through to the next model/default.
- Properties include `images_enabled` behavior through the **Publishing** tab, off by default.
- Brand context includes optional visual style, palette, and visual rules fields.
- Quick Generate shows **Generate hero image after QA** only for image-enabled properties.
- Review and Current Run show model-call logs, image status, image-check result, mock hero image path, alt text, and an image regenerate action.
- The OpenAI image provider can generate image data, but the dashboard still uses a local placeholder until Supabase Storage upload is connected; text publishing is not blocked by image failures.

## Local Development

```bash
npm run dev
```

Open `http://localhost:3000`.

Useful checks:

```bash
npm run lint
npm run typecheck
npm run build
```

## Environment

Copy `.env.example` to `.env.local` and fill in values when services are ready.

Required for early phases:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ANTHROPIC_API_KEY`
- `ANTHROPIC_TEXT_MODEL` (defaults to `claude-sonnet-4-6`)
- `CRON_SECRET`
- `ENGINE_BASE_URL`

Later phases also use:

- `RESEND_API_KEY`
- `OPENAI_API_KEY`
- `OPENAI_TEXT_MODEL` (defaults to `gpt-5.6-terra`)
- `REPLICATE_API_TOKEN`
- `GSC_CLIENT_ID`
- `GSC_CLIENT_SECRET`
- `GSC_REFRESH_TOKEN`

Never commit real secret values.

## Supabase

Schema files live in `supabase/`.

- `supabase/migrations/20260714120000_initial_schema.sql`
- `supabase/migrations/20260714143000_update_01_properties_performance_seo.sql`
- `supabase/migrations/20260715093000_update_02_model_routing_images.sql`
- `supabase/seed.sql`

Once the Supabase CLI is installed and a project is linked, apply the migration and seed through the normal Supabase workflow.

Current schema posture:

- RLS is enabled on every public table.
- Direct table grants are for `authenticated` and `service_role`.
- `anon` is not granted table access; public content should be exposed through Next.js API routes.
- `content_items` supports `scheduled` status, `publish_at`, and `source` for Quick Generate, API, schedule, and repurposing origins.
- Update 01 adds `brand_context_docs`, `content_metrics_daily`, `content_versions.context_hash`, and `content_versions.social_meta`.
- Update 02 adds `models`, `routing_rules`, `properties.images_enabled`, brand visual profile columns, `content_versions.hero_image_alt`, job-run registry metadata, and the public `hero-images` storage bucket.

## Quick Generate Contract

The later dashboard form and `POST /api/engine/generate` endpoint share the same input shape:

- `property` - target project/site
- `prompt` - the article request or angle
- `content_type` - `article` in v1
- `publish_at` - empty means publish as soon as QA passes; future date means scheduled
- `title` - optional fixed title
- `keywords` - optional SEO/AEO keywords
- `tone_override` - optional one-off voice instruction
- `skip_auto_publish` - optional force-review switch

The endpoint should return `content_item_id` so callers can poll `GET /api/engine/content/:contentItemId`.

## Local Console

The current app uses browser local storage under `herzen-content-engine-state-v1`.

Clickable workflows:

- Generate a real AI draft from the Quick Generate form through the selected model route.
- Watch the simulated run move through draft and QA into published, scheduled, or review.
- Approve, regenerate, reject, or publish content.
- Add backlog topics and load them into Quick Generate.
- Edit brand profile fields.
- Adjust auto-publish thresholds and create local API keys.
- Manage model registry rows and routing rules from Settings.
- Enable optional hero images per property, add a visual profile, and regenerate a local hero image placeholder from Review.
- Clear local workspace data from Settings.

## Build Phases

1. Phase 0: Scaffold, schema, env setup, seed data.
2. Phase 1: AI provider abstraction and prompt templates.
3. Phase 2: Job runner, topic/ad-hoc brief to draft pipeline, and internal Quick Generate endpoint.
4. Phase 3: QA gate, scoring, enrichment, slug dedupe, and scheduled publish logic.
5. Phase 4: Public Content API and first site integration.
6. Phase 5: Second site, schedule cron, due scheduled items, retries, failure alerts.
7. Phase 6: Dashboard with Quick Generate first.
8. Phase 7: External API layer and API key management.
9. Phase 8: Newsletter generation and Resend integration.
