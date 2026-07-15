# Herzen Content Engine - Environment Secrets Needed

Add these values to `.env.local` for local development and to the production host when deploying.

Do not commit real secret values to git.

## Required For The Engine

| Name | Where to get it | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project settings | Public project URL. Safe for browser use. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase API settings | Public anon key. RLS still protects data. |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase API settings | Secret server-only key. Never expose in client code. |
| `ANTHROPIC_API_KEY` | Anthropic Console | Current default text provider. |
| `CRON_SECRET` | Generate a long random string | Used to protect cron/internal job endpoints. |
| `ENGINE_BASE_URL` | Your deployed engine URL | Local default is `http://localhost:3000`. |

## Required For Update 02 Model Routing And Images

| Name | Where to get it | Notes |
| --- | --- | --- |
| `OPENAI_API_KEY` | OpenAI Platform | Enables OpenAI text routing, cross-provider QA, and OpenAI image generation. Missing key is handled gracefully. |

## Optional / Later

| Name | Where to get it | Notes |
| --- | --- | --- |
| `REPLICATE_API_TOKEN` | Replicate account settings | Reserved for future Flux/Replicate image provider. Not used yet. |
| `RESEND_API_KEY` | Resend dashboard | For future email/newsletter/failure alerts. |
| `GSC_CLIENT_ID` | Google Cloud OAuth client | For Google Search Console sync. |
| `GSC_CLIENT_SECRET` | Google Cloud OAuth client | For Google Search Console sync. |
| `GSC_REFRESH_TOKEN` | Google OAuth flow | For daily Search Console sync. |

## Target Site Values

Add these to each integrated site when deploying the site integration snippet.

| Name | Site | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_ENGINE_URL` | `herzenco.co`, `humanismoevolutivo.com` | Public URL of this engine, used by the pageview beacon. |
| `CONTENT_ENGINE_URL` | `herzenco.co`, `humanismoevolutivo.com` | Server-side URL for pulling published content from the engine. |
| `REVALIDATE_SECRET` | `herzenco.co`, `humanismoevolutivo.com` | Must match the property revalidation secret configured in the engine. |

## Suggested Local `.env.local` Shape

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
CRON_SECRET=
ENGINE_BASE_URL=http://localhost:3000

REPLICATE_API_TOKEN=
RESEND_API_KEY=
GSC_CLIENT_ID=
GSC_CLIENT_SECRET=
GSC_REFRESH_TOKEN=
```
