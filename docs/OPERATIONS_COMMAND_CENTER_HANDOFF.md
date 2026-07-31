# Herzen Content Engine → Operational Command Center Handoff

Prepared: July 30, 2026

Source repository: https://github.com/herzenco/HerzenCo-ContentGenerator

Production application: https://content.herzenco.co

Source project folder: `/Users/tito/Desktop/HerzenCo-ContentGenerator`

## Purpose of this handoff

Herzen Content Engine is being sunset as a standalone application so its capabilities can be incorporated into the Herzen Co. Operational Command Center. This document records the product behavior, architecture, integrations, data model, security boundaries, operating procedures, and current implementation state that must be preserved during that move.

This is a consolidation, not a data reset. Supabase is the source of truth. Existing content items, immutable versions, comments, feedback, research, audit events, schedules, publication records, analytics, and final URLs must remain intact and accessible throughout the migration.

## Repository and Git state

- GitHub: https://github.com/herzenco/HerzenCo-ContentGenerator
- Remote: `origin`
- Branch: `main`
- Baseline commit before the consolidation handoff: `ec7d717` (`index content audit actors`)
- The local branch tracks `origin/main`.
- The consolidation handoff commit contains the implementation delta documented below.
- Preparing and pushing the code does not apply Supabase migrations or deploy the application.

## Implementation delta included with this handoff

The handoff push adds or updates all of the following:

### Generated-content protection

- A mandatory project skill that treats generated and saved content as immutable user data.
- A pre-push guard that rejects destructive SQL, protected-table deletions, content-version overwrites, destructive Supabase commands, credential patterns, sensitive data exports, modified historical migrations, and non-fast-forward protected-branch updates.
- Ten unit tests covering the guard’s allow and deny behavior.
- A tracked Git pre-push hook that runs both the tests and guard.
- A GitHub Actions workflow that runs the same protection against every push and pull request.
- Expanded `.Codex/data-guardian.json` coverage for review comments, audit events, and the published feed.
- Repository instructions requiring content protection for future code, migration, and Git work.
- Ignore rules preventing generated Python cache files from entering Git.

### Reversible publication lifecycle

- The `unpublished` content state.
- Historical fields for who unpublished an item, when, and why.
- Publication synchronization status, error, and update time.
- A preserved `visible` flag on the public feed.
- Database transition guards that allow only `published → unpublished → published`.
- Atomic server-side database functions for unpublishing and republishing.
- Append-only audit events for the lifecycle transition and subsequent website synchronization.
- Deploy-hook triggering without rolling back the safe database state when the destination build fails.
- Human-only workspace routes restricted to `admin` and `publisher`.
- Operator UI actions, reason capture, status display, and synchronization feedback.
- Explicit prevention of revision or rejection while an item is unpublished.
- Public-feed filtering that returns only visible rows.

### Feedback + Rules

- A property-scoped, append-only rules table.
- Entry types for feedback, edits, and durable rules.
- Rationale, author, source comment, source content item, timestamp, and supersession fields.
- Automatic conversion of applied review comments into reusable edit lessons.
- Operator UI for reviewing and adding rules.
- Authenticated workspace read/write endpoints.
- MCP tools for agents to review the memory and append authorized rules.
- Automatic inclusion of current rules in every property generation context.

### Research

- Property-scoped Markdown research records with source URL, filename, author, expiry, status, sunset reason, and supersession history.
- Research-usage records linking a source to content generated around its topic.
- Operator UI for pasting research or uploading `.md`/`.txt` material.
- Authenticated workspace read/write endpoints.
- MCP research ingestion for K2 and other authorized agents.
- Automatic inclusion of active research in generation context.
- Automatic expiry of stale research.
- Topic-overlap tracking and sunsetting after content is created around the subject.
- Preservation of sunset research and usage history rather than deletion.

### Operator and review experience

- Feedback + Rules and Research tabs inside each property.
- A simplified mobile bottom navigation bar.
- Collapsible mobile sections for lower-priority dashboard information.
- Single-column mobile action layouts and reduced card spacing.
- Focused review-link behavior that suppresses unrelated navigation and backlog content when a specific review UUID is opened.
- Publication-state and synchronization information on content details.

### Agent and MCP surface

- `list_property_knowledge`
- `list_feedback_rules`
- `add_feedback_rule`
- `add_research`
- Unpublished lifecycle fields in agent and workspace content responses.
- Research-use tracking after successful generation, including a recoverable warning if lifecycle tracking fails after the draft itself has already been saved.

### Documentation

- Updated technical README.
- Complete content lifecycle SOP.
- Updated project brief.
- This Operational Command Center consolidation handoff.

## Product summary

The Content Engine is a multi-property content operating system. It supports:

1. property-specific research and editorial memory;
2. AI draft generation;
3. independent AI quality review;
4. human review through stable shareable links;
5. passage-level annotations and whole-draft comments;
6. append-only revisions;
7. approval and publication-date selection;
8. immediate or scheduled publishing;
9. destination-site deployment and live-URL confirmation;
10. complete actor-aware audit history;
11. human and agent access through the application, REST, and MCP.

## Technology

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS 4
- Supabase Postgres, Auth, RLS, SSR clients, and service-role server operations
- Vercel hosting and deploy hooks
- OpenAI SDK for primary drafting and revision
- Anthropic SDK for independent QA
- Model Context Protocol over Streamable HTTP
- Zod validation

Before modifying Next.js code in the destination, read the installed Next.js documentation under `node_modules/next/dist/docs/`; this project uses a version with breaking changes.

## Canonical properties and content boundaries

| Property slug | Destination | Language | Allowed content |
|---|---|---|---|
| `herzenco` | Herzenco.co | English | `article`, `newsletter` |
| `humanismo-evolutivo` | HumanismoEvolutivo.com | Spanish | `article`, `newsletter` |
| `herzenco-social` | Herzen Co. LinkedIn/social | English | `social_post` |

These boundaries are functional requirements:

- Website properties must not generate social posts.
- The social property must not generate website articles.
- The property is both the brand-context boundary and the publishing destination.
- Server-side validation must enforce the mapping; it must not depend only on the UI.

## AI generation and review pipeline

The intended pipeline is:

1. Resolve the selected property and permitted content type.
2. Load its brand profile, context documents, Feedback + Rules, and active Research.
3. Ask OpenAI to generate the complete draft, editorial title, excerpt, metadata, and structured content fields.
4. Save the draft before QA so a provider failure never destroys generated work.
5. Ask Anthropic to independently evaluate writing quality, brand alignment, SEO/AEO readiness, factual safety, and metadata.
6. Store QA findings and concrete reasons for review.
7. Send the content to human review.
8. Preserve every revision as a new `content_versions` row.

Important editorial behavior:

- Titles must be human editorial headlines, not paraphrases of prompts.
- “Needs a final human pass” is not a valid substantive hold reason by itself.
- Review reasons should identify real issues such as weak writing, brand misalignment, unsupported claims, weak structure, or poor SEO/AEO.
- If Anthropic is unavailable, retain the OpenAI draft and mark QA as pending.
- Generation must consult Feedback + Rules and active Research every time.

## Feedback + Rules

Feedback + Rules is permanent, property-scoped generation memory.

It stores:

- direct feedback;
- lessons derived from edits;
- durable writing or brand rules;
- the rationale for each entry;
- the originating review comment and content item when applicable;
- author identity and timestamp;
- append-only supersession links rather than destructive replacement.

When a comment-driven revision is created, the applied reviewer comment can become a reusable property rule so the same mistake is less likely to recur.

C-3PO can:

- read all rules through MCP;
- append its own rules when authorized with `content:write`;
- see authorship, rationale, and source references.

Relevant implementation:

- `src/lib/property-knowledge.ts`
- `src/app/api/workspace/properties/[slug]/knowledge/route.ts`
- `src/app/mcp/route.ts`
- `supabase/migrations/20260730153000_add_property_feedback_and_research.sql`
- `property_feedback_rules`

## Research

Research is a property-scoped inbox for Markdown research supplied by K2 or an authorized operator.

Each entry retains:

- title and complete Markdown body;
- source URL and original filename when supplied;
- author identity and timestamp;
- active or sunset state;
- expiry date;
- sunset date and reason;
- supersession history.

Active research is automatically included in generation context. The current implementation records material topic overlap between research and generated content. Research is sunset when:

- content has already been created around the topic; or
- its active shelf life expires.

Sunsetting is reversible lifecycle metadata, not deletion. Source material and usage history are retained.

Relevant tables:

- `property_research_entries`
- `property_research_usage`

Relevant MCP operations:

- `list_property_knowledge`
- `add_research`

## Draft review and annotations

Every content item has a stable authenticated review URL:

`https://content.herzenco.co/review/{content-id}`

The UUID is the durable identity. A review link must not depend on title or slug.

The review experience includes:

- a focused single-item view rather than the whole backlog;
- draft and relevant metadata near the top;
- passage-level text highlighting;
- comments visually linked to their highlighted passages in a right-side annotation rail;
- whole-draft comments;
- persistent comment history;
- comment-driven regeneration;
- audit history;
- approve, revise, reject, publish, unpublish, and republish actions when authorized.

A revision based on comments must:

1. read every open comment;
2. create a new immutable content version;
3. retain the old version;
4. mark incorporated comments as applied;
5. rerun QA;
6. preserve the same content ID and review URL.

## Content lifecycle

The operating procedure defines these business states:

- `draft`
- `in_review`
- `revision_requested`
- `approved`
- `scheduled`
- `posted`
- `failed`

The current database and older application code also use implementation statuses such as `needs_review`, `published`, `rejected`, and the newer `unpublished`. During consolidation, define one explicit translation layer between the SOP vocabulary and database enum. Do not silently rename historical values.

Required fields on every item:

- `content_id`
- `content_type`
- `target_publish_datetime`
- `current_status`

Definition of done:

- the approved version is live;
- the canonical URL is saved and verified;
- Tito has received the URL;
- the audit trail includes approval, scheduling, publication, and verification;
- no hidden manual publishing step remains.

See `docs/CONTENT_WORKFLOW_SOP.md` for the full transition and notification procedure.

## Approval, scheduling, and publication

Approval requires an explicit publication choice:

- publish now; or
- schedule with an ISO-8601 date/time including timezone.

Approval is not complete until the publishing action or verified schedule succeeds.

Key behaviors:

- Scheduled publishing is handled by `GET /api/cron/publish`, protected by `CRON_SECRET`.
- Publishing writes to the restricted public feed and triggers the property-specific Vercel deploy hook stored in `properties.revalidate_url`.
- A deploy-hook response is not proof the final page is live.
- The destination site confirms the canonical live URL through `POST /api/publishing/confirm`.
- Agent responses retain `publishedUrl`; agents must return the exact stored URL and never invent one.

Public feed:

- `GET /api/content?property={property-slug}`
- `GET /api/content/{slug}?property={property-slug}`

## Reversible unpublishing and republishing

The in-progress local implementation adds:

- `published → unpublished`
- `unpublished → published`

Only authenticated human users with `admin` or `publisher` roles may perform these transitions.

Explicit restrictions:

- Lupe cannot unpublish or republish.
- MCP agents cannot unpublish or republish.
- Ordinary API keys cannot unpublish or republish.
- These operations are intentionally absent from the agent API and MCP registry.
- Unpublishing hides the preserved public-feed record; it never deletes it.
- Versions, comments, audits, analytics, URLs, and publication history remain intact.

Human workspace endpoints:

- `POST /api/workspace/content/{id}/unpublish`
- `POST /api/workspace/content/{id}/republish`

Publication synchronization is tracked independently:

- `pending`
- `synced`
- `failed`

Relevant files:

- `src/lib/publication-lifecycle.ts`
- `src/app/api/workspace/content/[id]/unpublish/route.ts`
- `src/app/api/workspace/content/[id]/republish/route.ts`
- `supabase/migrations/20260728210953_reversible_content_publication.sql`

## Audit trail

`content_audit_events` is the authoritative append-only change history.

It records:

- content item;
- actor user ID when available;
- actor email;
- actor type: user, agent, system, or website;
- action and timestamp;
- affected content version;
- field-level before/after values;
- supporting metadata.

Events cover creation, drafting, revision, comments, QA, review submission, approval, scheduling, publishing, rejection, URL confirmation, unpublishing, republishing, and publication synchronization.

Historical events must never be rewritten to guess an actor. Older events should remain labeled historical or system-generated where attribution cannot be proven.

Audit access:

- review UI timeline;
- `GET /api/workspace/content/{id}/audit`;
- `GET /api/agent/content/{id}/audit`;
- MCP `get_content_audit`.

## Agent access

Production MCP:

- Endpoint: `https://content.herzenco.co/mcp`
- Manifest: `https://content.herzenco.co/mcp-server.json`
- Transport: Streamable HTTP
- Authentication: bearer token

Principal tools:

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
- `list_property_knowledge`
- `list_feedback_rules`
- `add_feedback_rule`
- `add_research`

Equivalent authenticated REST operations live under `/api/agent`.

Scopes separate:

- content reading;
- content writing and revision;
- approval.

Human-only publishing authority must remain separate from agent authority. The destination system must not broaden Lupe, C-3PO, K2, or ordinary bearer-token permissions during consolidation.

Lupe’s detailed runbook is in `docs/LUPE_CONTENT_ENGINE_OPERATIONAL_BRIEF.md`.

## Data model

Principal Supabase objects:

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
- `published_content_feed`
- `property_feedback_rules`
- `property_research_entries`
- `property_research_usage`

Supabase requirements:

- RLS remains enabled.
- Public readers can select publish-safe, visible rows only.
- Authoring tables require authenticated role-aware access or server-side service-role operations.
- Existing IDs must be preserved when the UI and API move.
- Existing migrations are immutable; use forward-only migrations.

## Generated-content protection

Saved content is immutable user data.

Never:

- delete a `content_items` or `content_versions` row;
- update authored fields of an existing version;
- truncate, reset, or reseed a linked production database;
- delete review comments, audits, analytics, publication history, or public-feed rows;
- edit or remove an applied migration;
- bypass the pre-push guard;
- commit database dumps, production content exports, provider credentials, or `.env.local`.

Revisions create monotonically increasing versions. Visibility changes are reversible and audited.

Protection assets in the local working tree:

- `.agents/skills/protect-generated-content/`
- `.githooks/pre-push`
- `.github/workflows/content-protection.yml`
- `npm run guard:content:test`
- `npm run guard:content`

These assets are designed to become immutable after installation. Preserve them when moving the engine into the Command Center.

## Authentication and authorization

- Human accounts are restricted to the `@herzenco.co` domain.
- Supabase Auth supplies the human session.
- Application roles include `admin`, `publisher`, `reviewer`, `editor`, and `viewer`.
- Server-side authorization is under `src/lib/auth/`.
- Agent bearer authentication and scopes are under `src/lib/agent/auth.ts`.
- Provider keys and service-role credentials are server-only.
- Do not place service-role keys, OpenAI keys, Anthropic keys, agent tokens, deploy hooks, or publishing secrets in client bundles or handoff documents.
- Rotate any credential that has previously appeared in chat or a screenshot.

## Runtime configuration

Required or currently referenced environment variables:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
OPENAI_API_KEY
ANTHROPIC_API_KEY
OPENAI_TEXT_MODEL
ANTHROPIC_TEXT_MODEL
CRON_SECRET
ENGINE_BASE_URL
```

Optional or future integrations:

```text
REPLICATE_API_TOKEN
RESEND_API_KEY
GSC_CLIENT_ID
GSC_CLIENT_SECRET
GSC_REFRESH_TOKEN
```

The destination project should use its own secret store and Vercel environment configuration. Copy values securely from the active deployment; never copy `.env.local` into Git.

## Source repository map

- `src/app/` — pages, API routes, MCP endpoint, auth callbacks, and cron route
- `src/components/content-engine-app.tsx` — primary operator workspace UI
- `src/lib/agent/` — agent authentication and content operations
- `src/lib/ai/` — OpenAI/Anthropic provider abstraction and routing
- `src/lib/auth/` — human authorization and roles
- `src/lib/content-audit.ts` — audit creation and field-change calculation
- `src/lib/property-knowledge.ts` — Feedback + Rules and Research lifecycle
- `src/lib/publication-lifecycle.ts` — reversible human publication state
- `src/lib/published-content.ts` — public-feed and deploy-hook behavior
- `src/utils/supabase/` — browser, server, admin, and middleware clients
- `supabase/migrations/` — authoritative forward-only schema evolution
- `supabase/seed.sql` — initial property seed material; do not run against production as a reset
- `site-integration/` — destination-site integration material
- `docs/` — product, agent, workflow, and handoff documentation

## Consolidation procedure

1. Freeze standalone feature development, but do not delete the repository or production deployment.
2. Preserve the exact dirty working tree in a reviewed branch or commit before moving code.
3. Export a schema inventory and migration ledger only. Do not export production content into Git.
4. Confirm which local migrations have actually been applied to production Supabase.
5. Reuse the existing Supabase project and stable IDs unless an explicit, tested data migration is approved.
6. Add the Content Engine to the Operational Command Center behind a feature boundary.
7. Port server services and tests before porting the UI.
8. Preserve API and MCP contracts initially so Lupe, C-3PO, K2, and the destination websites do not break.
9. Port the focused single-draft review experience, annotations, knowledge sections, and mobile behavior.
10. Point a staging Command Center build at a non-production test environment.
11. Validate generation, QA, review, revision, scheduling, publication, URL confirmation, unpublishing, republishing, and audit history.
12. Run the generated-content guard and compare content/version counts before and after every migration rehearsal.
13. Cut over agents and destination sites only after contract tests pass.
14. Keep the standalone deployment available for rollback until production parity and data integrity are verified.
15. Sunset the old deployment only after all traffic, cron jobs, MCP clients, deploy hooks, and destination integrations use the Command Center.

## Required migration validation

At minimum, verify:

- no content item or version count decreases;
- every item retains the same UUID and property;
- every item retains all versions in order;
- every comment retains its anchor and status;
- every audit event remains queryable;
- published items remain visible;
- unpublished items remain preserved and hidden;
- scheduled items retain timezone-aware publication times;
- canonical published URLs remain attached;
- property feedback and research remain property-scoped;
- agent scopes do not expand;
- MCP and REST responses preserve stable fields and review URLs;
- destination deploy hooks still target the correct website projects.

## Validation status at handoff

Completed before the consolidation push:

- TypeScript typecheck passed.
- ESLint completed with no errors. Five legacy unused-helper warnings remain in `content-engine-app.tsx`.
- The generated-content protection suite passed all ten tests.
- The generated-content pre-push guard passed.
- The optimized Next.js production build completed successfully.
- A credential-pattern scan of the handoff found no live secrets.

Still requiring environment-level validation:

- Apply neither new migration until it has been reviewed against the linked Supabase project.
- Confirm whether each new migration is already present in production before any schema action.
- Exercise unpublishing and republishing against a non-production item and verify deploy-hook failure handling.
- Exercise Feedback + Rules and Research with authenticated human and agent roles.
- Verify responsive behavior on physical mobile devices.
- Confirm the production MCP client sees the four new property-knowledge tools after deployment.
- Verify content, version, comment, audit, feed, and analytics counts remain unchanged through consolidation.

Do not infer that a migration is live merely because its SQL file exists, and do not infer that this source push deployed the application.

## Recommended next step

Create a dedicated Command Center integration branch, then bring this handoff and the Content Engine implementation into that branch without changing the active Supabase project or public contracts. First make the existing tests and content-protection guard runnable there. Only then begin UI consolidation.
