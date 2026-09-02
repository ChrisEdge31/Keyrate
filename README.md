# Keyrate

A keybr-style typing tutor: learn the keyboard letter by letter, unlocking
each new key once your pace on the current one holds up, then move to free
practice once you know the layout. Built with Astro and Supabase.

## Stack

- [Astro](https://astro.build) — static pages, no SSR adapter
- [Supabase](https://supabase.com) — Auth and Postgres, RLS scoped to the signed-in user
- Plain TypeScript for the lesson and typing engine — no UI framework

## Setup

1. Install dependencies:
   ```sh
   bun install
   ```
2. Create a Supabase project, then copy `.env.example` to `.env.local` and
   fill in the project's URL and anon key (Project Settings → API).
3. Run the migrations in `supabase/migrations/` against your project — via
   the SQL editor, or `supabase db push` if you're linked with the CLI.
4. In Supabase's Auth settings, turn off "Confirm email" unless you want to
   wire up transactional email — this project doesn't send any.
5. (Optional) Deploy the delete-account edge function so account deletion
   actually works, rather than failing gracefully with an error:
   ```sh
   supabase login
   supabase link
   supabase functions deploy delete-account
   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<your service role key>
   ```
6. Start the dev server:
   ```sh
   bun run dev
   ```

## Scripts

| Command           | What it does                          |
| ------------------ | -------------------------------------- |
| `bun run dev`     | Dev server at `localhost:4321`        |
| `bun run build`   | Production build to `./dist/`         |
| `bun run preview` | Preview the production build locally  |

## Project structure

- `src/pages/` — routes: marketing (`index`), auth (`login`, `signup`,
  `onboarding`), the app (`dashboard`, `learn`, `practice`, `profile`), and
  `type.astro` for logged-out practice.
- `src/components/` — Astro components, including the keyboard SVG and the
  shared typing panel.
- `src/lib/` — the actual logic: `lessonState.ts` (key-unlock pacing),
  `typingSession.ts` (typing mechanics), `auth.ts` (Supabase auth and
  profile), `results.ts` (stats), `cache.ts` (localStorage caching), and
  `words.ts` / `dictionary.ts` (passage generation).
- `supabase/migrations/` — schema (`profiles`, `results`) and RLS policies.
- `supabase/functions/delete-account/` — edge function for account
  deletion, since that requires the service role key and can't run in the
  browser.

## Notes

- No committed test suite — verification during development has been
  manual, plus ad hoc Playwright scripts.
- The key-unlock pacing is modeled on
  [keybr.com](https://github.com/aradzie/keybr.com)'s approach — EMA-smoothed
  per-round sampling, gated on the best-ever pace rather than the latest
  round. See `src/lib/lessonState.ts`.

## License

GPL-3.0 — see [LICENSE](LICENSE).
