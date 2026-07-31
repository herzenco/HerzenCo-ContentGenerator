---
name: protect-generated-content
description: Preserve all generated, revised, approved, scheduled, published, and saved content in the HerzenCo Content Generator. Use for every code change, database migration, content workflow change, Git commit, and GitHub push, especially changes involving Supabase, content_items, content_versions, publication, review, QA, exports, backups, or deletion.
---

# Protect Generated Content

Treat saved content as immutable user data. Code may add a new version or change workflow
metadata, but must never delete, overwrite, truncate, reset, anonymize, or silently replace an
existing content item or content version.

## Non-negotiable rules

1. Never run a destructive database command against a linked or production Supabase project.
   This includes `supabase db reset`, `DROP`, `TRUNCATE`, destructive `DELETE`, and destructive
   migration repair.
2. Never update the authored fields of an existing `content_versions` row. Create a new,
   monotonically increasing version instead.
3. Never delete a `content_items` or `content_versions` row. Use reversible lifecycle state for
   visibility changes and retain the version and audit history.
4. Never edit or remove an already-committed migration. Add a forward-only migration.
5. Never commit database dumps, content exports, prompts containing saved content, credentials,
   or production environment files.
6. Never bypass the pre-push guard with `--no-verify`. If it blocks, redesign the change or ask
   the user to review the exact risk. Do not add an override switch.
7. Do not claim content is protected merely because application tests pass. Application code,
   migrations, deployment commands, and Git history must all pass the guard.
8. Public visibility changes must preserve the existing feed record. Toggle an audited visibility
   field; never delete the feed row as an implementation shortcut.
9. The protection skill, guard, tests, pre-push hook, and GitHub workflow become immutable after
   installation. A normal push may not modify, rename, or delete them.

## Required workflow

Before changing a content or database path:

1. Identify whether the change can mutate `content_items`, `content_versions`,
   `published_content_feed`, `content_review_comments`, `content_audit_events`, or related rows.
2. Prefer append-only writes, new content versions, reversible status transitions, and audit
   events.
3. Preserve the current content and public state on every error path. Do not use cleanup deletes
   after partial creation; use a transaction or leave the saved draft recoverable.
4. Run:

   ```bash
   npm run guard:content:test
   npm run guard:content
   ```

5. Run the relevant tests, typecheck, and lint checks.

Before every GitHub push, run the guard again. The tracked `.githooks/pre-push` hook enforces the
guard tests and the same check automatically for command-line pushes after `core.hooksPath` is configured.
`.github/workflows/content-protection.yml` checks every GitHub push and pull request as a second
enforcement layer. Keep that check required in GitHub branch protection for protected branches.

## Handling a blocked push

Read every reported file and line. Replace destructive behavior with an append-only or reversible
design. If a change intentionally affects content visibility, retain all saved versions and audit
the transition. If absolute preservation cannot be demonstrated, stop before pushing and explain
the risk to the user.

Do not weaken patterns, remove the hook, change `core.hooksPath`, or add exclusions to make a push
pass.
