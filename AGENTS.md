<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Mandatory generated-content protection

For every code change, database migration, Git operation, or GitHub push, use the
project skill at `.agents/skills/protect-generated-content/SKILL.md`.

Saved content is immutable user data. Never delete or overwrite an existing content item or
content version, never run destructive database commands, and never bypass the content
pre-push guard. Revisions must create append-only versions; visibility changes must be
reversible and audited.
