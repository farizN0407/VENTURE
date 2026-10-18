# Promptly — AI Literacy

Promptly is a responsive AI literacy learning app built with Next.js App Router, TypeScript, Tailwind CSS, Supabase, and Stripe. The landing page follows the supplied Promptly HTML design. Challenge and lesson content is included in the repository; account-backed progress and billing require external service configuration.

## Local setup

Requirements: Node.js 20.9 or newer and npm.

```bash
npm ci
npm run dev
```

Open `http://localhost:3000`. Run `npm run lint`, `npx tsc --noEmit`, `npm run test:questions`, `npm run test:browser`, and `npm run build` to check the application. The repository uses npm and its checked-in `package-lock.json`.

## Available learning features

- Seven short lessons: Prompting, Fact Checking, AI for Research, Critical Thinking, Responsible AI, AI Knowledge, and Practical Application.
- Eight example challenges mapped to seven learning topics. Each topic attempt randomly selects five of ten scenarios and shuffles options. Answers, correct choices, and explanations are revealed after submission.
- The landing page and account dashboard show a zero-start profile. Overall score is derived from completed quiz attempts; skill scores use stored correct and total answers. Opening a lesson or starting a quiz does not change profile scores.
- Quiz results remain visible on the result page for guests. Signed-in users can save attempts to Supabase and see recent attempts on `/account`.
- Pro billing is not offered in the UI. All lessons and included quizzes are currently free.

## Supabase setup and access controls

1. Create a Supabase project and copy `.env.example` to `.env.local`.
2. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and the server-only `SUPABASE_SERVICE_ROLE_KEY` from that project. Never prefix a secret with `NEXT_PUBLIC_` or expose the service-role key to browser code.
3. Apply `supabase/schema.sql` in that project's SQL Editor. It adds profile, attempt, module completion, subscription, and database-managed learning content tables, RPCs, grants, and RLS policies. Public signup always receives the `user` role. The client cannot update roles, insert quiz scores, or write module completion records directly.
4. To designate the single admin, create the account through normal signup, find that account's UUID in Supabase Auth, then run `select public.provision_designated_admin('USER-UUID'::uuid);` in SQL Editor as the project owner. The partial unique index prevents a second admin; the provisioning function is not executable by API roles. Do not add an admin role to signup metadata.
5. Configure Supabase Auth email confirmation and allowed redirect URLs for local and production domains.

Topic quiz answers are graded on the server. Completed attempts from authenticated users are saved only when the server-side service-role key and current schema are configured. The schema adds a unique `(user_id, attempt_id)` index to make repeated submission of the same attempt idempotent. Database-managed challenge attempts are scored and saved by a restricted RPC. If configuration or a write fails, the UI reports that the result was not saved; guest results are session-only. No local or fake account data is generated. Existing Supabase installations must reapply the current `supabase/schema.sql` before topic results can be stored.

The admin CMS manages database content with `custom-` slugs so it cannot overwrite the curated lessons and challenges shipped in source. Public reads can see published content only. Correct options and explanations live in a separate restricted table and are returned through grading RPCs, not catalog queries. Existing installations must apply the current schema before relying on these policies.

## Stripe status and safety

Checkout is intentionally disabled by default. There is no Pro-only feature currently available, and live payments are not supported by the checkout route. The route requires an authenticated Supabase user, an `sk_test_` Stripe key, a configured price, webhook secret, Supabase service-role key, and explicit `STRIPE_ENABLE_CHECKOUT=true`. It rejects live keys. A signed webhook stores subscription state linked to the Supabase user; the account view recognizes only active or trialing subscriptions whose period has not ended.

To test billing after configuring Supabase and Stripe test mode, set the test price ID, webhook signing secret, and `STRIPE_ENABLE_CHECKOUT=true`. Point the Stripe test webhook to `/api/stripe/webhook` and subscribe to checkout completion and subscription created, updated, and deleted events. Verify the complete test flow before considering any production billing work. Do not replace the checkout guard with a live key or advertise Pro until an actual Pro feature and its server-side authorization have been implemented and reviewed.

## Routes

- `/` landing page
- `/learn` and `/learn/[slug]` short lessons and examples
- `/challenges` and `/challenges/[slug]` quiz catalog and interactive challenges
- `/login` sign in and `/register` account creation
- `/account` saved quiz attempts, learning progress, recommendations, and subscription status
- `/admin` server-guarded database content studio (requires the designated Supabase admin)
- `/pricing` currently available free features and billing status
- `/api/quiz-attempts` server-scored quiz result endpoint; authenticated results are persisted when configured
- `/api/quiz-feedback` grading for the single landing preview and custom database challenges; built-in topic quizzes reveal results only after all five responses are submitted
- `/api/module-completions` authenticated lesson progress endpoint
- `/api/stripe/checkout` guarded test-mode checkout endpoint
- `/api/stripe/webhook` signed Stripe subscription-state updates

## Vercel deployment

The Next.js project root is the repository root (the directory containing `package.json`). Import that root into Vercel and configure the Supabase URL and anon key plus server-only service-role key for account features. Add Stripe test secrets only when deliberately validating the guarded test checkout. Apply the Supabase schema and designate the admin before testing authenticated features. Deploy and check `/`, `/learn`, `/challenges`, `/login`, `/account`, `/pricing`, and `/admin`. Account storage, CMS, and Stripe behavior require their services and schema to be configured; do not claim these integrations are live until verified.
