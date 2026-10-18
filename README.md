# Promptly — AI Literacy

Promptly is a responsive AI literacy learning app built with Next.js App Router, TypeScript, Tailwind CSS, Supabase, and Stripe. The landing page follows the supplied Promptly HTML design. Challenge and lesson content is included in the repository; account-backed progress and billing require external service configuration.

## Local setup

Requirements: Node.js 20.9 or newer and npm.

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. Run `npm run lint`, `npx tsc --noEmit`, and `npm run build` before deployment. The repository uses npm; `npm install` creates and maintains `package-lock.json`.

## Available learning features

- Five short lessons: Prompting, Fact Checking, AI for Research, Critical Thinking, and Responsible AI.
- Eight example challenges with answer feedback, explanations, scores, retry, and recommended next lessons.
- Quiz results remain visible on the result page for guests. Signed-in users can save attempts to Supabase and see recent attempts on `/account`.
- The sample literacy profile on the landing page is illustrative and is not a user score or certification.
- Pro billing is not offered in the UI. All lessons and included quizzes are currently free.

## Supabase setup

1. Create a Supabase project.
2. Copy `.env.example` to `.env.local`; set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from the project API settings.
3. Run `supabase/schema.sql` in the Supabase SQL editor. It creates profiles, quiz attempts, and subscriptions with row-level security. Clients can read their own data and insert their own quiz attempts; subscription changes are server-only.
4. Configure email confirmation and allowed redirect URLs in Supabase Auth for local and production domains.
5. Never expose `SUPABASE_SERVICE_ROLE_KEY` to browser code. It is only used by the verified Stripe webhook and checkout association.

Without Supabase credentials, quizzes still work, but account creation and saving results are unavailable and the account page explains that state. No local or fake account data is generated.

## Stripe status and safety

Checkout is intentionally disabled by default. There is no Pro-only feature currently available, and live payments are not supported by the checkout route. The route requires an authenticated Supabase user, an `sk_test_` Stripe key, a configured price, webhook secret, Supabase service-role key, and explicit `STRIPE_ENABLE_CHECKOUT=true`. It rejects live keys. A signed webhook stores subscription state linked to the Supabase user; the account view recognizes only active or trialing subscriptions whose period has not ended.

To test billing after configuring Supabase and Stripe test mode, set the test price ID, webhook signing secret, and `STRIPE_ENABLE_CHECKOUT=true`. Point the Stripe test webhook to `/api/stripe/webhook` and subscribe to checkout completion and subscription created, updated, and deleted events. Verify the complete test flow before considering any production billing work. Do not replace the checkout guard with a live key or advertise Pro until an actual Pro feature and its server-side authorization have been implemented and reviewed.

## Routes

- `/` landing page
- `/learn` and `/learn/[slug]` short lessons and examples
- `/challenges` and `/challenges/[slug]` quiz catalog and interactive challenges
- `/login` sign in and registration
- `/account` saved quiz attempts and subscription status
- `/pricing` currently available free features and billing status
- `/api/quiz-attempts` authenticated quiz-result endpoint
- `/api/stripe/checkout` guarded test-mode checkout endpoint
- `/api/stripe/webhook` signed Stripe subscription-state updates

## Vercel deployment

Import the project into Vercel and configure the Supabase public URL and anon key for account features. Add Stripe test secrets only when deliberately validating the guarded test checkout. Deploy and check `/`, `/learn`, `/challenges`, `/login`, `/account`, and `/pricing`. Account storage and Stripe behavior require their services and schema to be configured; do not claim these integrations are live until verified.
