# WFUMC Sunday School

Companion app for **Todd & Tyler's Excellent Adventure Sunday School Class**.

## What it is (Phase A — current)

- Pastor-side roster, attendance, and topic management for the class
- Pick-rotation widget: alphabetical-of-present-members, with manual override
- Topic state machine: Possible Future → Picked for Next → Active → Past
- Seeded from the sample lesson doc on first run (46 members, ~60 future topics, ~150 past topics)

## What's planned

- **Phase B**: Active lesson editor + Claude (✨ Draft from seed text+images, 💡 Brainstorm, 📖 Insert NRSVUe verses), Word docx export for the lesson and a separate back-page export (future topics + past topics + roster), optional homework field per lesson
- **Phase C**: Public-facing pages (active lesson, past topics, roster, possible future, "Suggest a question" form). No login required to view; submissions require a name only. PWA install enabled.

## Tech

Same stack as the rest of the WFUMC suite: React 18 + Vite + Tailwind + Supabase + vite-plugin-pwa. Deploys via GitHub Actions to GitHub Pages. Shares the existing `claude-proxy` Edge Function for Claude calls.

## Setup

```bash
npm install
cp .env.example .env.local   # fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm run dev
```

Migration `0063_sunday_school.sql` lives in the Bulletin App folder (`WFUMC Bulletin App/supabase/migrations/`). Apply with `supabase db push` from there.
