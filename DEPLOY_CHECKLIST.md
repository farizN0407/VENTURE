# Deploy checklist — Promptly

## Before deploy
- [ ] Run `npm ci`, `npm run lint`, `npx tsc --noEmit`, `npm run build`, and `npm run test:browser`.
- [ ] Confirm `.env.local` and other credential files are ignored; only placeholder names belong in `.env.example`.
- [ ] Import this existing repository into Vercel. Do not change its visibility as part of deployment.

## Supabase accounts and quiz history
- [ ] Create a Supabase project and run `supabase/schema.sql`.
- [ ] For an existing project, apply `supabase/migrations/20261019_content_domains.sql` once before deploying this code. It labels only quiz-bank and curated built-in attempts as AI Literacy; scores and review data are not changed. Existing CMS rows stay unclassified until an admin explicitly assigns a domain in Content Studio.
- [ ] Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in the Vercel project (the legacy anon key is supported as a fallback).
- [ ] Set `SUPABASE_SECRET_KEY` server-only for result/progress writes (legacy service-role key is supported as a fallback). Never use an elevated key with a `NEXT_PUBLIC_` prefix.
- [ ] Set `NEXT_PUBLIC_SITE_URL` to the production HTTPS origin and configure its `/auth/callback` URL in Supabase Auth.
- [ ] Configure email confirmation and production redirect URLs in Supabase Auth.
- [ ] Verify signup, confirmation, login, result saving, and account history with a test account.
- [ ] Compare the Supabase project URL configured in Vercel Production with the development URL in `.env.local` using the Supabase dashboard project reference. Never copy or print the API keys while comparing.
- [ ] Promote only reviewed, published AI Literacy CMS content: run `npm run content:export -- --environment=development --project-ref=SOURCE_PROJECT_REF --modules=custom-module-slug --challenges=custom-challenge-slug`, securely transfer the ignored `content-promotion/*.json` bundle, then run `npm run content:import -- --environment=production --project-ref=PRODUCTION_PROJECT_REF --file=filename.json`. Use project references shown in Supabase Project Settings → General; do not use or print API keys. Ensure `.env.production.local` contains the intended production Supabase URL and server-only key before import. The importer verifies the URL project reference, inserts missing rows, skips exact matches, stops on conflicts, and never deletes or updates target rows.
- [ ] Content bundles include correct answers and explanations. Keep them private, do not commit them, and remove them securely after promotion.

## Stripe
- [ ] Current checkout is disabled in the UI; all included content is free and no Pro-only feature is active.
- [ ] For an optional test-only checkout verification, configure a Stripe test key, test price, webhook signing secret, Supabase server-only secret key, and `STRIPE_ENABLE_CHECKOUT=true`.
- [ ] The checkout handler rejects live Stripe keys. Do not weaken this guard or advertise paid access.
- [ ] Point the test webhook at `/api/stripe/webhook`, enable checkout and subscription created/updated/deleted events, and verify persistence in Supabase.
- [ ] Do not accept live payments until a real Pro feature, server-side entitlement checks, webhook persistence, failure handling, and cancellation behavior have been implemented and reviewed.

## Vercel
- [ ] Deploy a preview from the intended branch.
- [ ] Verify `/`, `/learn`, `/challenges`, `/login`, `/account`, and `/pricing` on desktop and mobile.
- [ ] Configure production Supabase URLs only after preview verification.
- [ ] Set `NEXT_PUBLIC_SITE_URL` to the verified deployment URL.
- [ ] Confirm the deployment is healthy before treating it as production.
