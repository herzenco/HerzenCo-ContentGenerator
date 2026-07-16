# PROJECT_MEMORY.md
> Last updated: 2026-07-16 | Session #7 | Agent: Codex

---

## Project Overview

Herzen Content Engine is a centralized AI content hub for generating, quality-checking, publishing, and distributing content to Herzen Co. properties. The initial launch supports `herzenco.co` in English and `humanismoevolutivo.com` in Spanish, with a headless API planned so Lupe can drive the engine without a dashboard.

## Tech Stack

- Frontend/backend: Next.js 16 App Router, React 19, TypeScript
- Styling: Tailwind CSS 4, Geist fonts
- Database/auth/storage: Supabase Postgres, RLS, Auth, Storage; Next.js SSR helpers installed
- Hosting: Vercel
- AI: Anthropic API planned for Phase 1 behind a provider interface
- Email: Resend planned for later failure alerts and newsletters

## File & Folder Map

- `src/app/` - Next.js App Router routes and global app shell
- `src/utils/supabase/` - Browser, server, and middleware Supabase SSR clients
- `middleware.ts` - Supabase session refresh middleware for Next.js requests
- `supabase/migrations/` - SQL migrations for the content engine schema
- `supabase/seed.sql` - Seed data for launch properties and brand profiles
- `.env.example` - Required environment variable names without secrets
- `docs/plans/` - Durable planning/design notes
- `PROJECT_MEMORY.md` - Current project state and handoff notes

## Current State

The repository is initialized locally on `main` and points to `git@github.com:herzenco/HerzenCo-ContentGenerator.git`. Next.js has been scaffolded and the Phase 0 plus Update 01 and Update 02 Supabase migrations have been created. The app is now a clickable local operator console with Quick Generate, overview, properties, review queue, performance, calendar, topics, settings, model routing, and optional hero-image controls backed by browser local storage.

Supabase SSR packages are installed and the app now has reusable browser/server helpers plus middleware that refreshes auth sessions. Local `.env.local` contains the Supabase project URL, publishable key, OpenAI key, and Anthropic key; it is ignored by git.

The dashboard is gated by Supabase Auth. Users can sign in or create an account with email/password only. Account creation is limited to `@herzenco.co` addresses in both the UI and the live Supabase database via the `enforce_herzenco_auth_domain` trigger on `auth.users`.

## What Was Done This Session

- Initialized the empty workspace as the local repo for `HerzenCo-ContentGenerator`.
- Scaffolded a Next.js 16 TypeScript app with App Router, Tailwind, ESLint, npm, and `src/`.
- Added a Phase 0 operator status page and updated metadata.
- Fixed Tailwind v4/Geist font theme tokens.
- Added `.env.example` with the environment variables from the build spec.
- Added Supabase config, initial schema migration, and seed SQL for both launch properties.
- Added a Phase 0 design note under `docs/plans/`.
- Updated the product surface and docs from the newer `content-engine-spec.md`: Quick Generate is the primary entry point, scheduled publishing is explicit, and `GET /api/engine/content/:contentItemId` is the status polling endpoint.
- Updated the initial schema with `scheduled` status, `publish_at`, and `content_items.source`.
- Replaced the static status page with a usable local console: Quick Generate form, simulated draft/QA/publish flow, review queue actions, calendar publishing, topic loading, brand profile edits, settings, and resettable demo data.
- Installed `lucide-react` for dashboard icons.
- Implemented Update 01 in the local console: Properties nav/detail pages, profile completeness, brand context docs, context-enforced Quick Generate, context hashes, Brand Alignment QA, SEO/AEO hard gates, social meta, Performance pageview analytics, Search Console graceful-degradation UI, and the metrics beacon endpoint/snippet.
- Implemented Update 02 in the local console: model registry, routing rules, fallback model-call logging, Settings Models UI, property image opt-in, visual profile fields, Quick Generate image checkbox, review/current-run image display, image regenerate action, and hero image migration/provider scaffolding.
- Installed `@supabase/supabase-js` and `@supabase/ssr`.
- Added Supabase browser, server, and middleware helpers.
- Added root Next.js middleware to refresh Supabase sessions.
- Added `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to `.env.example`.
- Stored the provided Supabase URL and publishable key in local `.env.local` only.
- Added a Supabase Auth login/create-account screen.
- Added a server-side auth gate around the dashboard.
- Added email confirmation callback route at `/auth/confirm`.
- Added dashboard sign-out.
- Added and applied the Supabase migration that blocks non-`@herzenco.co` Auth users.

## Key Decisions Made

- Kept the UI to an operator status screen because the full dashboard is Phase 6.
- Added `job_runs` to the schema even though it was not listed as a table in the data model because the spec requires logged model/job runs with tokens, latency, model, and prompt version.
- Enabled RLS on every public table and granted direct access to `authenticated` and `service_role`, not `anon`; public content should be served through Next.js API routes.
- Used SQL seed data instead of a TypeScript seed script for Phase 0 because it works cleanly with Supabase migrations before app clients exist.
- Treated Quick Generate as the product's daily-driver workflow even before implementing the endpoint, so Phase 2 and the future dashboard have a single contract to build toward.
- Added scheduling columns in the initial migration instead of deferring them, because the updated spec makes `publish_at` part of the Quick Generate contract.
- Kept Update 01 runnable in the local-storage console while adding matching Supabase migrations, so operators can use the workflow before Supabase persistence and AI providers are wired.
- Search Console is represented as settings/env scaffolding and graceful UI degradation until OAuth credentials are available.
- Model routing is an override layer. The seeded local state has zero active routing rules, so the default generation path remains unchanged until an operator adds/enables a rule.
- Hero images are off by default for every property; image failures and incomplete visual profiles never block text publishing.

## Known Bugs / Issues

- Supabase CLI is not installed in this environment, so the migration and seed have not been executed locally.
- GitHub SSH clone failed earlier because local host-key verification is not set up; the remote is configured, but pushing may still require SSH setup.
- npm reported two moderate advisories in installed dependencies during scaffold generation; no forced audit fix has been run.
- The app uses local browser storage and simulated pipeline transitions; Supabase persistence, Anthropic calls, cron processing, and real API routes are not wired yet.
- The metrics beacon endpoint currently validates payloads and returns a local stub; it still needs to be wired to upsert `content_metrics_daily` through the new Supabase server helpers.
- Provider clients are interface scaffolds only; real Anthropic/OpenAI calls still need the production provider implementation and server-side secret wiring.
- Local hero image generation attaches deterministic placeholder paths until OpenAI Images and Supabase Storage upload are wired.

## Next Steps (Prioritized)

- [ ] Install or enable Supabase CLI, link a Supabase project, and run the migration and seed.
- [ ] Verify seeded rows are visible in Supabase.
- [ ] Start Phase 1: add Anthropic provider abstraction, prompt template seeds, and structured output parsing with Zod.
- [ ] Replace local-storage state with Supabase-backed reads/writes once the project is linked.
- [ ] In Phase 2, implement internal `POST /api/engine/generate` with the Quick Generate contract and status polling via `GET /api/engine/content/:contentItemId`.
- [x] Add lazy Supabase server client helpers when application code starts reading/writing the database.
- [ ] Resolve GitHub SSH host verification before the first push.
- [ ] Wire `brand_context_docs`, `content_metrics_daily`, `context_hash`, and `social_meta` to Supabase reads/writes.
- [ ] Replace the local SEO/AEO simulation with persisted `eval_results` rows in the real pipeline.
- [ ] Deploy the `site-integration/metrics-beacon.tsx` one-file update to `herzenco.co` and `humanismoevolutivo.com`.
- [ ] Implement the GSC daily sync once `GSC_CLIENT_ID`, `GSC_CLIENT_SECRET`, and `GSC_REFRESH_TOKEN` are available.
- [ ] Wire model registry and routing rules to persisted Supabase reads/writes.
- [ ] Implement real provider calls for Anthropic/OpenAI on the server, with timeout/fallback logging in `job_runs`.
- [ ] Connect hero image generation to OpenAI Images and upload outputs into the public `hero-images` Supabase Storage bucket.
- [ ] Expose `hero_image_url`, `hero_image_alt`, and `social_meta.ogImage` through the Content API.
- [ ] Configure Supabase Auth Site URL and redirect URLs for production once the Vercel URL/domain is known.
- [ ] Consider custom SMTP before production usage; Supabase default email has tight rate limits.

## Environment & Config Notes

- Required early env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` or `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `CRON_SECRET`, `ENGINE_BASE_URL`.
- Later optional env vars: `RESEND_API_KEY`, `OPENAI_API_KEY`, `REPLICATE_API_TOKEN`, `GSC_CLIENT_ID`, `GSC_CLIENT_SECRET`, `GSC_REFRESH_TOKEN`.
- Real secret values should go in `.env.local` and Vercel, never in Git.
- Target-site env vars later: `CONTENT_ENGINE_URL`, `REVALIDATE_SECRET`.

## Schema / Data Model

Initial migration: `supabase/migrations/20260714120000_initial_schema.sql`.

Update 01 migration: `supabase/migrations/20260714143000_update_01_properties_performance_seo.sql`.

Update 02 migration: `supabase/migrations/20260715093000_update_02_model_routing_images.sql`.

Auth migration: `supabase/migrations/20260716151500_auth_herzenco_domain.sql`.

Tables: `properties`, `brand_profiles`, `topics`, `content_items`, `content_versions`, `eval_results`, `jobs`, `job_runs`, `schedules`, `api_keys`, `prompt_templates`.

`content_items` now includes `scheduled` status, `publish_at`, and `source` (`schedule`, `quick_generate`, `api`, `repurpose`) from the updated product spec.

Update 01 adds `brand_context_docs`, `content_metrics_daily`, `content_versions.context_hash`, and `content_versions.social_meta`.

Update 02 adds `models`, `routing_rules`, `properties.images_enabled`, brand visual profile columns, `content_versions.hero_image_alt`, `job_runs.registry_model_id`, `job_runs.fallback_used`, `job_runs.provider_errors`, and the public `hero-images` storage bucket.

Seed data: `supabase/seed.sql` inserts `herzenco` and `humanismo-evolutivo` properties plus placeholder brand profiles.

## External Resources

- GitHub remote: `git@github.com:herzenco/HerzenCo-ContentGenerator.git`
- Build spec: Codex attachment `cab27965-82b7-4a00-9e91-d9265ceacb87/pasted-text.txt`
- Launch sites: `https://herzenco.co`, `https://humanismoevolutivo.com`

## Session Log

### Session #6 - 2026-07-16

Agent: Codex

Branch/Commit: `main`, no commit yet

Summary: Installed Supabase SSR/client packages, added browser/server/middleware helpers, enabled session refresh middleware, and saved the provided Supabase project env locally without committing secrets.

Files changed: `package.json`, `package-lock.json`, `.env.example`, `middleware.ts`, `src/utils/supabase/*`, project memory.

### Session #7 - 2026-07-16

Agent: Codex

Branch/Commit: `main`, no commit yet

Summary: Added Supabase email/password auth gate for the operator console, restricted account creation to `@herzenco.co`, added email confirmation callback, sign-out, and applied the live Supabase Auth domain trigger migration.

Files changed: `src/app/page.tsx`, `src/app/auth/confirm/route.ts`, `src/components/auth-form.tsx`, `src/components/content-engine-app.tsx`, `supabase/migrations/20260716151500_auth_herzenco_domain.sql`, project memory.

### Session #5 - 2026-07-15

Agent: Codex

Branch/Commit: `main`, no commit yet

Summary: Implemented Update 02 as an additive local product layer with model registry/routing controls and optional hero-image generation scaffolding.

Files changed: `src/components/content-engine-app.tsx`, `src/lib/ai/providers.ts`, `src/lib/ai/routing.ts`, Supabase Update 02 migration, `.env.example`, README, project memory.

### Session #4 - 2026-07-14

Agent: Codex

Branch/Commit: `main`, no commit yet

Summary: Implemented Update 01 as a clickable local product update and verified lint, typecheck, production build, beacon endpoint, and browser rendering for Properties and Performance.

Files changed: `src/components/content-engine-app.tsx`, `src/app/api/metrics/beacon/route.ts`, Supabase Update 01 migration, `site-integration/`, `.env.example`, README, project memory.

### Session #3 - 2026-07-14

Agent: Codex

Branch/Commit: `main`, no commit yet

Summary: Built the clickable local operator console and verified lint, typecheck, and production build.

Files changed: `src/app/page.tsx`, `src/components/content-engine-app.tsx`, `package.json`, `package-lock.json`, README, project memory.

### Session #2 - 2026-07-14

Agent: Codex

Branch/Commit: `main`, no commit yet

Summary: Updated Phase 0 product surface, schema, and docs from `/Users/herzen/Downloads/content-engine-spec.md`.

Files changed: `src/app/page.tsx`, Supabase migration, README, Phase 0 design note, project memory.

### Session #1 - 2026-07-14

Agent: Codex

Branch/Commit: `main`, no commit yet

Summary: Established Phase 0 project foundation from an empty repo.

Files changed: Next.js scaffold, Supabase schema/seed files, README, env example, design note, project memory.
