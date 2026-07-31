# Content Workflow Standard Operating Procedure

Effective: July 27, 2026

## Purpose

This procedure defines the required fields, lifecycle statuses, transitions, Lupe actions, notifications, recovery rules, and completion criteria for every content item.

Approval is not an acknowledgment. It must trigger a real publishing-system action, scheduling verification, status update, and notification. If any one of those does not happen, the workflow is incomplete.

## Required fields

Every content item must always expose:

| Field | Requirement |
|---|---|
| `content_id` | Stable Content Engine UUID that remains unchanged through revisions. |
| `content_type` | The deliverable type: `article`, `newsletter`, or `social_post`. |
| `target_publish_datetime` | Required ISO-8601 publication date/time with timezone. |
| `current_status` | Exactly one of the statuses defined below. |

An item missing a required field is invalid and must not advance.

## Statuses and operator actions

### `draft`

The item is still being written, assembled, enriched, or quality-checked. It is not ready for review.

Lupe must confirm the required fields, property/type match, complete draft, and QA results. Move it to `in_review` only when the complete version and review link are ready.

### `in_review`

The current version is complete and waiting for Tito’s decision.

Lupe sends the title, required fields, version, review link, and a short decision note. Only an explicit revision request or approval may move it forward. Silence, reactions, and general positive feedback are not approval.

### `revision_requested`

Tito requested changes and the current version is not approved.

Lupe must persist the requested changes, preserve the current version, revise the same `content_id`, apply all open comments, run QA, save a new version, return the item to `in_review`, and send the updated link, version, and change summary.

### `approved`

Tito explicitly approved the current version, but scheduling is not yet verified.

This is a transactional status. Lupe must immediately record the approval, submit the item and target date/time to the scheduler, verify the saved schedule, and then move it to `scheduled`. A scheduling failure moves it to `failed`.

### `scheduled`

The approved version is accepted by the publishing system for the verified target date/time.

Lupe must verify the content ID, version, date, time, and timezone; audit the event; notify Tito; and monitor publication. The next status is `posted` after a live URL is verified, or `failed` if publication does not complete.

### `posted`

The approved content is live and a working public URL exists.

Lupe must verify the URL and content identity, save the canonical URL, audit publication verification, and send Tito the URL immediately. A publish request or deployment start alone is not proof that an item is posted.

### `failed`

A required workflow action did not complete.

The record must include the content ID, prior status, failed action, exact failure point, timestamp, error, attempts, recovery result, and any action needed from Tito.

Lupe must preserve the last valid state, attempt an idempotent recovery, avoid duplicates, and return the item to the correct status if recovery works. If recovery fails or needs new authority, notify Tito with the full failure packet.

## Authoritative transitions

| From | To | Trigger | Verification |
|---|---|---|---|
| `draft` | `in_review` | Draft and QA are complete | Required fields, complete body, QA, review link |
| `in_review` | `revision_requested` | Tito requests changes | Comments and request persisted |
| `revision_requested` | `in_review` | Revised version is complete | New version, QA, working review link |
| `in_review` | `approved` | Tito explicitly approves | Actor, timestamp, approved version |
| `approved` | `scheduled` | Scheduler accepts the item | Saved ID and target date/time match |
| `scheduled` | `posted` | Destination publishes | Canonical URL and content identity verified |
| `approved` | `failed` | Scheduling fails | Error and recovery attempt logged |
| `scheduled` | `failed` | Publishing or verification fails | Error and recovery attempt logged |

`posted` is terminal for this workflow. A later issue starts a new incident or revision workflow without erasing the historical posting event.

## Approval procedure

1. Verify approval applies to the latest version.
2. Verify `target_publish_datetime` exists and includes a timezone.
3. Record approver, timestamp, content ID, and version.
4. Set `current_status` to `approved`.
5. Immediately submit the item to the scheduler.
6. Read the scheduler response and re-read the saved schedule.
7. Compare content ID, version, date, time, and timezone.
8. If they match, set `current_status` to `scheduled`.
9. Notify Tito with the item details, verified date/time, timezone, and review link.
10. If verification fails, set `current_status` to `failed`, attempt recovery, and do not claim success.

## Revision procedure

1. Set `current_status` to `revision_requested`.
2. Persist every requested change.
3. Preserve the current version.
4. Generate a new version on the same content ID.
5. Apply all open comments or identify any requiring clarification.
6. Run OpenAI revision generation and Anthropic QA.
7. Save the revised version and QA result.
8. Set `current_status` to `in_review`.
9. Notify Tito with the review link, version, and material changes.

## Scheduling procedure

When scheduling succeeds, store the verified target date/time and timezone, audit the actor and timestamp, set `current_status` to `scheduled`, send confirmation, and monitor the publishing result.

Changing the target date/time after approval requires a new scheduling event and audit entry. Never silently overwrite the history.

## Post-publication procedure

1. Check the publishing-system result after the target time.
2. Retrieve the destination URL.
3. Verify it is reachable and belongs to the expected destination.
4. Verify it represents the correct content ID and approved version.
5. Save the canonical URL.
6. Set `current_status` to `posted`.
7. Audit verification and notify Tito immediately.

For website content, a deployment hook firing is not enough. The final page must be live.

## Failure recovery

Recovery must be idempotent:

- Check for an existing schedule before retrying a scheduling timeout.
- Check the public feed and destination URL before retrying publication.
- Retry deployment without creating a duplicate content item.
- Preserve a saved draft when generation or QA fails and retry only the failed step.
- Stop credential retries after authentication failure and request repair without exposing secrets.

Notify Tito only after automatic recovery fails or human action is required. Include the item, last valid status, failed action, exact error, attempts, current safe state, and requested action.

## Notifications

| Transition | Required message |
|---|---|
| `draft` → `in_review` | Ready for review, with required fields and review link |
| `in_review` → `revision_requested` | Revision request captured |
| `revision_requested` → `in_review` | Revisions applied, with version, summary, and link |
| `approved` → `scheduled` | Approved and scheduled, with verified date/time and timezone |
| `scheduled` → `posted` | Live, with verified canonical URL |
| any state → `failed` | Send only when unrecovered or human action is needed; include failure packet |

Lupe must also notify Tito when a reply or engagement requires his personal response or decision.

## Definition of done

An item is done only when:

- `current_status` is `posted`
- the intended approved version is live
- the canonical URL is saved and verified
- Tito received the URL
- the audit trail contains approval, scheduling, publication, and verification
- no hidden manual publishing or verification step remains

`approved` is not done. `scheduled` is not done. A successful deployment request without a verified page is not done.
