# Deploy checklist — Promptly

## Before deploy
- [ ] Run `npm ci`, `npm run lint`, `npx tsc --noEmit`, `npm run build`, and `npm run test:browser`.
- [ ] Confirm `.env.local` and other credential files are ignored; only placeholder names belong in `.env.example`.
- [ ] Import this existing repository into Vercel. Do not change its visibility as part of deployment.

## Supabase accounts and quiz history
- [ ] Create a Supabase project and run `supabase/schema.sql`.
- [ ] Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in the Vercel project.
- [ ] Configure email confirmation and production redirect URLs in Supabase Auth.
- [ ] Keep `SUPABASE_SERVICE_ROLE_KEY` server-only. It is required only for guarded billing synchronization.
- [ ] Verify signup, confirmation, login, result saving, and account history with a test account.

## Stripe
- [ ] Current checkout is disabled in the UI; all included content is free and no Pro-only feature is active.
- [ ] For an optional test-only checkout verification, configure a Stripe test key, test price, webhook signing secret, Supabase service-role key, and `STRIPE_ENABLE_CHECKOUT=true`.
- [ ] The checkout handler rejects live Stripe keys. Do not weaken this guard or advertise paid access.
- [ ] Point the test webhook at `/api/stripe/webhook`, enable checkout and subscription created/updated/deleted events, and verify persistence in Supabase.
- [ ] Do not accept live payments until a real Pro feature, server-side entitlement checks, webhook persistence, failure handling, and cancellation behavior have been implemented and reviewed.

## Vercel
- [ ] Deploy a preview from the intended branch.
- [ ] Verify `/`, `/learn`, `/challenges`, `/login`, `/account`, and `/pricing` on desktop and mobile.
- [ ] Configure production Supabase URLs only after preview verification.
- [ ] Set `NEXT_PUBLIC_SITE_URL` to the verified deployment URL.
- [ ] Confirm the deployment is healthy before treating it as production.
