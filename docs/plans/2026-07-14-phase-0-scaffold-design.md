# Phase 0 Scaffold Design

## Goal

Create the local foundation for the Herzen Content Engine without implementing future pipeline phases early. Phase 0 should leave the repo ready to connect to Supabase, apply the schema, seed the launch properties, and begin Phase 1 provider/prompt work. The product direction now treats Quick Generate as the primary manual entry point.

## Approach

Use a standard Next.js App Router application with TypeScript, Tailwind, ESLint, and npm. Keep the home page as a lightweight operator status screen rather than a dashboard, because the full dashboard is explicitly Phase 6. The page should still make the product shape obvious: a prompt enters Quick Generate, flows through the same queued pipeline, and ends as published, scheduled, or needs review.

Use Supabase SQL files under `supabase/`:

- `supabase/migrations/20260714120000_initial_schema.sql` contains the v1 content engine schema.
- `supabase/seed.sql` inserts the two launch properties and placeholder brand profiles.

The app will not call Supabase during Phase 0. Environment variables are documented in `.env.example`, and runtime clients should be added lazily in later phases to keep builds safe when secrets are missing.

## Data Model

The migration creates the spec tables for properties, brand profiles, topics, content items, versions, eval results, jobs, schedules, API keys, and prompt templates. It also adds `job_runs` so future model calls and job attempts can record model, prompt version, token usage, latency, and errors.

`content_items` includes `scheduled` status, `publish_at`, and `source` so Quick Generate and future scheduled publishing do not require a later schema reshuffle.

RLS is enabled on all public tables. Direct table access is granted to `authenticated` users and `service_role`, not `anon`; the public Content API should be served by Next.js route handlers instead of exposing raw tables.

## Verification

Phase 0 verification is:

- Next.js lint passes.
- TypeScript typecheck passes.
- Production build passes.
- Supabase migration and seed are ready to run once a Supabase project and CLI are available.
