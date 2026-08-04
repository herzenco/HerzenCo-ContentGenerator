import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { hashOccApprovedFields, occPublicationPayloadSchema, validateOccPublicationPayload } from "./occ-publication-contract.ts";

function approvedPayload() {
  const approved = {
    title: "Approved title",
    body: "Approved body with [preserved formatting](https://herzen.co).",
    content_type: "article" as const,
    destination: "resource_library",
    slug: "approved-title",
    canonical_path: "/resources/approved-title/",
    seo: { title: "SEO title", description: "SEO description", keywords: ["operations"] },
    featured_image: { url: "https://cdn.herzen.co/approved.jpg", role: "featured", alt_text: "Approved image" },
    media: [{ url: "https://cdn.herzen.co/approved.jpg", role: "featured", alt_text: "Approved image" }],
    author: "Herzen Co.",
    publish_date: "2026-09-03T14:00:00.000Z",
    tags: ["operations"],
    categories: ["Operating systems"],
    status: "published" as const,
  };
  const hash = hashOccApprovedFields(approved);
  return occPublicationPayloadSchema.parse({
    schema_version: 1,
    content_item_id: "3b0958e9-9d4c-4ad9-88fe-3e44448cba75",
    idempotency_key: `occ:3b0958e9-9d4c-4ad9-88fe-3e44448cba75:${hash}`,
    approved_content_hash: hash,
    ...approved,
    source: { system: "occ", approved_at: "2026-08-04T01:00:00.000Z", approved_by: "Tito" },
  });
}

test("the website contract accepts an approved resource-library package", () => {
  const payload = approvedPayload();
  assert.deepEqual(validateOccPublicationPayload(payload, payload.idempotency_key), []);
});

test("destination, path, idempotency, and approved hash are hard validation gates", () => {
  const payload = approvedPayload();
  const errors = validateOccPublicationPayload({ ...payload, destination: "landing_page", canonical_path: "/wrong/", body: "changed after approval" }, "different-key");
  assert.equal(errors.length, 3);
  assert.match(errors.join(" "), /Unsupported website destination/);
  assert.match(errors.join(" "), /Idempotency-Key/);
  assert.match(errors.join(" "), /approved content hash/);
  assert.match(validateOccPublicationPayload({ ...payload, canonical_path: "/wrong/" }).join(" "), /Canonical path/);
});

test("the persistence migration keys items by OCC ID and versions by approved hash", () => {
  const migration = readFileSync(new URL("../../supabase/migrations/20260804014252_occ_idempotent_website_publication.sql", import.meta.url), "utf8");
  assert.match(migration, /unique index if not exists content_items_external_source_id_idx/);
  assert.match(migration, /unique index if not exists content_versions_item_hash_idx/);
  assert.match(migration, /visible boolean not null default true/);
});

test("the writer appends immutable versions and records idempotent replays", () => {
  const implementation = readFileSync(new URL("./published-content.ts", import.meta.url), "utf8");
  assert.match(implementation, /from\("content_versions"\)\.insert/);
  assert.doesNotMatch(implementation, /from\("content_versions"\)\.update/);
  assert.match(implementation, /content\.publish_idempotent_replay/);
});
