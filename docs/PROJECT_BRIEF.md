# Herzen Content Engine — Project Brief

Last reviewed: July 25, 2026

## Executive summary

Herzen Content Engine is the centralized system for creating, reviewing, scheduling, publishing, and distributing content for Herzen Co. properties. It supports human operators through a web dashboard and Lupe through authenticated REST and MCP interfaces.

The production application is `https://content.herzenco.co`. The repository is hosted at `https://github.com/herzenco/HerzenCo-ContentGenerator`.

The current content workflow is:

1. Select the correct property and content type.
2. Generate and save a complete draft with OpenAI.
3. Review the result with Anthropic and populate QA, brand, SEO/AEO, and metadata findings.
4. Send the item to the human review queue.
5. Review the draft through its stable shareable review link.
6. Add persistent passage-level or whole-draft comments.
7. Generate a new version that incorporates all open comments.
8. Approve by choosing either **publish now** or a future publication date.
9. Publish immediately or allow the scheduled-publishing cron to publish it later.
10. Receive and retain the final public URL supplied by the destination website.

Every meaningful content mutation is recorded in a permanent audit trail with the actor, timestamp, action, content version, and field-level before/after values.

## Properties and channel boundaries

| Property slug | Destination | Language | Allowed content |
|---|---|---|---|
| `herzenco` | Herzenco.co website | English | Articles and newsletters |
| `humanismo-evolutivo` | HumanismoEvolutivo.com website | Spanish | Articles and newsletters |
| `herzenco-social` | Herzen Co. LinkedIn/social | English | Social posts only |

The engine enforces these boundaries. Website properties must not produce social posts, and the social property must not produce website articles.

## Product surfaces

### Operator application

The Next.js dashboard provides:

- Home/Quick Generate
- Content queue and review
- Stable draft review pages at `/review/{content-id}`
- Passage-level annotations and whole-draft comments
- Comment-driven revision generation
- QA results and review reasons
- Approval, scheduling, publishing, and rejection
- Property and brand-context management
- Calendar, topics, settings, and performance surfaces
- A visible content audit timeline

### Lupe and agent access

Production integration:

- MCP endpoint: `https://content.herzenco.co/mcp`
- MCP manifest: `https://content.herzenco.co/mcp-server.json`
- Transport: Streamable HTTP
- Authentication: bearer token

Principal MCP tools:

- `list_properties`
- `list_content`
- `get_content`
- `list_comments`
- `generate_draft`
- `revise_draft`
- `revise_from_comments`
- `run_qa`
- `submit_for_review`
- `approve_content`
- `get_content_audit`

Equivalent authenticated REST routes exist under `/api/agent`. Human workspace operations use authenticated routes under `/api/workspace`.

Lupe has her own account and agent identity. Her operating instructions live in `docs/LUPE_CONTENT_ENGINE_OPERATIONAL_BRIEF.md`. Tokens and provider keys must remain in private runtime/Vercel environment storage and must never be committed or printed.

## AI generation and quality workflow

- OpenAI is the primary draft-generation provider.
- Anthropic is the independent reviewer/checker.
- Anthropic QA populates quality, brand alignment, SEO/AEO feedback, metadata, keywords, and actionable reasons for holding a draft.
- “Needs a final human pass” is not treated as a substantive failure reason by itself.
- Draft titles are editorially generated and should never merely echo the user’s prompt.
- Generation uses the selected property’s brand profile, context documents, audience, voice, banned topics, and content rules.
- Drafts remain reviewable and recoverable if QA is temporarily unavailable.

For Herzen Co. LinkedIn content, the intended voice is direct, concrete, founder-facing, and operator-led. The work should open with a lived operational problem, avoid generic B2B language, and follow the property-specific format mix and style constraints.

## Drafts, versions, comments, and links

- Draft metadata is stored in Supabase `content_items`.
- The complete text and enriched fields for each revision are stored in `content_versions`.
- A revision creates a new immutable version rather than silently overwriting the previous one.
- Review comments persist in Supabase and can target selected text or the full draft.
- Comment-driven revision consumes every open comment, creates a new version, and marks the incorporated comments as applied.
- Each item has a stable authenticated review URL:

  `https://content.herzenco.co/review/{content-id}`

The content UUID, rather than the title or slug, is the durable review identity.

## Approval, scheduling, and publishing

Approval requires an explicit publication choice:

- **Publish now:** the item becomes published immediately.
- **Schedule:** the item becomes scheduled with an ISO-8601 `publish_at` value.

The scheduled publish route is `/api/cron/publish` and is protected by `CRON_SECRET`. When a scheduled time becomes due, the job publishes the item and triggers the property-specific Vercel deployment hook.

Public, publish-safe content is exposed through:

- `GET /api/content?property={property-slug}`
- `GET /api/content/{slug}?property={property-slug}`

The destination website consumes the feed during its build, creates or updates the public page, and can confirm the final canonical URL through:

- `POST /api/publishing/confirm`

Published agent responses include `publishedUrl`. Lupe should return that exact URL and must not invent or reconstruct one.

## Audit trail

The `content_audit_events` table is the authoritative change history. It records:

- content item
- actor user ID when available
- actor email
- actor type: user, agent, system, or website
- action
- timestamp
- content version
- field-level before/after values
- supporting metadata

Events cover creation, draft generation, edits, revisions, comment-driven changes, QA, review submission, approval, scheduling, publication, rejection, and final URL confirmation. Historical content versions and older agent activity are backfilled and explicitly labeled historical where the original actor cannot be proven.

The timeline is available in the review UI, through authenticated audit REST routes, and through the MCP `get_content_audit` tool.

## Data and security architecture

- Application: Next.js 16 App Router, React 19, TypeScript
- Styling: Tailwind CSS 4
- Database/auth: Supabase Postgres, Auth, RLS, and SSR helpers
- Hosting/deployment: Vercel
- AI SDKs: OpenAI and Anthropic
- Agent protocol: Model Context Protocol
- Validation: Zod

Supabase is authoritative for content, versions, comments, QA results, schedules, properties, identities, and audit events. Public readers can only access the restricted published-content feed. Authoring data requires an authenticated user, an appropriately scoped agent token, or the server-side service role.

Human accounts are restricted to the `@herzenco.co` domain. Application roles and agent scopes separate reading, writing, review/approval, and publishing privileges.

## Principal schema

Core tables include:

- `properties`
- `brand_profiles`
- `brand_context_docs`
- `topics`
- `content_items`
- `content_versions`
- `content_review_comments`
- `content_audit_events`
- `eval_results`
- `jobs`
- `job_runs`
- `schedules`
- `models`
- `routing_rules`
- `api_keys`
- `agent_audit_log`
- `prompt_templates`
- `content_metrics_daily`

The `published_content_feed` view exposes only publish-safe fields.

## Configuration

Primary runtime variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` or `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `OPENAI_TEXT_MODEL`
- `ANTHROPIC_TEXT_MODEL`
- `CRON_SECRET`
- `ENGINE_BASE_URL`

Optional/future integrations include Resend, Replicate, Google Search Console, image generation/storage, and first-party performance reporting.

Real secret values belong in `.env.local` for local development and in the Vercel environment for production. They must never be committed. Any credential previously exposed in chat or screenshots should be considered compromised and rotated.

## Repository map

- `src/app/` — pages, API routes, MCP endpoint, auth callbacks, and cron route
- `src/components/` — operator console and authentication UI
- `src/lib/agent/` — agent authentication and content operations
- `src/lib/ai/` — provider clients and model routing
- `src/lib/auth/` — human authorization and roles
- `src/lib/content-audit.ts` — audit-event creation and change calculation
- `src/lib/published-content.ts` — published-content behavior
- `src/utils/supabase/` — browser, server, admin, and middleware clients
- `supabase/migrations/` — authoritative schema evolution
- `supabase/seed.sql` — launch property seed data
- `site-integration/` — destination-site integration material
- `docs/LUPE_CONTENT_ENGINE_OPERATIONAL_BRIEF.md` — detailed Lupe runbook
- `README.md` — technical overview and local setup

## Local development and validation

```bash
npm install
npm run dev
```

Standard checks:

```bash
npm run lint
npm run typecheck
npm run build
```

The historical local URL has varied by launch command; use the port printed by `npm run dev`.

## Current state

The repository is on `main`, tracks `origin/main`, and was clean when this brief was prepared. The latest implementation work added the complete audit trail and audit-actor indexing.

The major end-to-end pieces now present in the codebase are:

- Supabase-authoritative content persistence
- OpenAI generation and Anthropic QA
- Human and agent authentication
- Property/type enforcement
- Shareable authenticated draft links
- Persistent passage-level comments
- Comment-driven new versions
- Human review and Lupe approval workflow
- Publish-now and scheduled-publication decisions
- Public content feeds and final-URL confirmation
- MCP and REST agent interfaces
- Complete content audit history

## Remaining verification and follow-up

The following should be treated as operational verification items rather than assumed complete merely because code exists:

1. Confirm every migration through `20260725121500_content_audit_actor_index.sql` is applied to production Supabase.
2. Confirm all required environment variables are present in the production Vercel project.
3. Run a production smoke test covering generation, Anthropic QA, comments, revision, approval, scheduling, cron publication, destination deployment, and final URL confirmation.
4. Confirm the HerzenCo.co consumer renders newly published feed items and reports the final canonical URL.
5. Confirm Lupe’s current bearer token has the intended scopes and can read, generate, revise, QA, submit, approve/schedule, and inspect audits without broader administrative access.
6. Confirm the Vercel cron cannot remain stuck in a stale `running` state after a completed or failed batch.
7. Rotate any provider, Supabase, publishing, deploy-hook, or agent credentials ever exposed outside private secret storage.
8. Reconcile or retire older documentation such as `PROJECT_MEMORY.md`, which contains phase-era statements that no longer reflect the current Supabase-backed implementation.

## Source-of-truth hierarchy

When documents disagree, use this order:

1. Current application code and Supabase migrations
2. Production configuration and observed production behavior
3. `docs/LUPE_CONTENT_ENGINE_OPERATIONAL_BRIEF.md`
4. This project brief
5. `README.md`
6. Historical `PROJECT_MEMORY.md` and phase design notes
