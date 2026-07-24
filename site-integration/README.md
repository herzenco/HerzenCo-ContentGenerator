# Site Integration Update 01

Deploy `metrics-beacon.tsx` into each integrated Next.js site and render it on
article pages after the content slug is known.

```tsx
<MetricsBeacon
  engineUrl={process.env.NEXT_PUBLIC_ENGINE_URL ?? ""}
  propertySlug="herzenco"
  slug={article.slug}
/>
```

Use `propertySlug="humanismo-evolutivo"` for `humanismoevolutivo.com`.

The beacon sends only `{ propertySlug, slug }`. The engine endpoint resolves the
content item server-side and uses a daily IP hash only for short-window dedupe;
it does not require cookies or client identifiers.

## Confirm the final public URL

After the website has generated and deployed an article page, its server-side
build or deployment completion job must confirm the canonical URL:

```ts
await fetch(`${process.env.CONTENT_ENGINE_URL}/api/publishing/confirm`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-publish-secret": process.env.PUBLISH_SECRET ?? "",
  },
  body: JSON.stringify({
    contentId: article.id,
    url: `https://herzenco.co/resources/${article.slug}/`,
  }),
});
```

Keep `PUBLISH_SECRET` server-side. The endpoint rejects non-HTTPS URLs and URLs
whose hostname does not match the content property. The confirmed URL is stored
as `publishedUrl` and returned through the agent API and MCP so Lupe can report
the exact live link.
