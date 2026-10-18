# Codex task brief — Promptly MVP

You are working in an existing starter repository for Promptly, an Indonesian AI-literacy quiz web app. Deadline is 3 days. Prioritize a working, secure MVP over adding more sections.

## First steps
1. Inspect all files and explain the existing architecture briefly.
2. Install dependencies and run `npm run build`; fix errors before adding features.
3. Do not rewrite the project from scratch or remove the supplied visual direction.
4. Keep the current visual design: blue `#168bf2`, yellow `#ffd13d`, Space Grotesk + DM Sans, responsive card-based UI.
5. No leaderboard section and no QR section.

## Product requirements
- Landing page with challenge cards, a working quiz preview or direct start, AI literacy profile example, flow, badges, pricing.
- Routes `/challenges`, `/challenges/[slug]`, `/pricing`, `/account`.
- Quiz data must be real and feedback must explain the answer, not only say correct/incorrect.
- Score is computed from answers and clearly described as a practice score, not a scientific certification.
- Free users can access designated free challenges. Pro challenges must be gated on the server using verified subscription status. Never rely only on hiding buttons in the frontend.
- Make navigation and CTA buttons work. Add loading/error/empty states where needed.
- Add keyboard accessibility, focus states, semantic headings, and mobile responsiveness.

## Subscription and security
- Use Stripe Checkout subscriptions in TEST MODE first.
- Before enabling checkout publicly, implement Supabase Auth and require a logged-in user to create checkout.
- Bind Stripe customer/subscription to the authenticated Supabase user via trusted server-side metadata.
- Implement verified webhook handling for checkout completion and subscription updated/deleted events; persist status in `public.subscriptions`.
- Enforce Pro entitlement server-side on protected challenge routes/API, and do not trust a client-provided user ID.
- Add subscription management/Stripe Customer Portal if time permits.
- Never expose `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, or `SUPABASE_SERVICE_ROLE_KEY` to browser code.
- If complete subscription enforcement is not possible before the deadline, disable paid checkout and show a waitlist / "coming soon" state instead. Do not accept real payments with a fake paywall.

## Supabase
- Implement email/password or magic-link auth with clear sign-in/sign-out UI.
- Save quiz attempts and show user's actual progress only for authenticated users.
- Ensure RLS policies prevent users from reading or modifying other users' data.
- Treat subscription rows as server-write-only.

## Quality and deployment
- Ensure `npm run build` passes.
- Check all internal links, quiz flows, mobile layout, and no console errors.
- Add README instructions and `.env.example`.
- Do not invent credentials. Leave missing provider configuration as explicit setup steps.
- Do not push to GitHub, create repositories, or deploy without the user's explicit confirmation and target repository/account details.
