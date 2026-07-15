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
