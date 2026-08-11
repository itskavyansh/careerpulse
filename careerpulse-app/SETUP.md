# CareerPulse App — Setup Guide

Mobile app (Expo + React Native) for the existing **careerpulse** Supabase backend.

## Prerequisites

- **Node.js 20+** (you already have this for the backend)
- **Expo Go** on your phone, or Android/iOS simulator
- Your Supabase project URL and **anon key** (not the service role key)

## 1. Install dependencies

```bash
cd careerpulse-app
npm install
```

## 2. Environment variables

Copy the example file and fill in your Supabase credentials:

```bash
cp .env.example .env
```

Edit `.env`:

```env
EXPO_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

Find both values in Supabase Dashboard → **Settings → API**.

> **Important:** Use the **anon / publishable** key. Never put the service role key in the mobile app.
>
> `.env` is gitignored — do not commit it.

Expo loads `EXPO_PUBLIC_*` variables automatically from `.env` when you run `npx expo start`. Restart the dev server after changing `.env`.

## 3. Supabase profile trigger (required for subscriptions)

The `subscriptions` table references `profiles`. When a user signs up, a profile row must exist. Add this trigger in the Supabase SQL Editor if you haven't already:

```sql
-- Auto-create a profiles row when a user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id)
  VALUES (NEW.id)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
```

## 4. Run the app

```bash
npm start
```

Then press:
- **a** — Android emulator
- **i** — iOS simulator (macOS only)
- Scan the QR code — Expo Go on your phone

## Project structure

```
careerpulse-app/
├── App.tsx                    — Auth gate + session listener
├── src/
│   ├── lib/supabase.ts        — Supabase client (anon key)
│   ├── types/database.ts      — Company, Job, Subscription types
│   ├── api/index.ts           — fetchCompanies, toggleSubscription, fetchMyJobs
│   ├── screens/
│   │   ├── AuthScreen.tsx     — Email/password login & signup
│   │   ├── CompanyListScreen.tsx
│   │   └── MyJobsScreen.tsx
│   └── navigation/
│       └── MainNavigator.tsx  — Bottom tabs: Companies | My Jobs
└── .env.example
```

## What this app does (Phase 2)

1. **Auth** — Sign up / log in with Supabase Auth
2. **Companies** — List all companies from your backend sync; subscribe to supported ATS platforms
3. **My Jobs** — Active jobs from subscribed companies only (RLS enforced)

## What it does NOT do yet

- Push notifications (Phase 3)
- Search / filters
- Application tracking

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "Missing EXPO_PUBLIC_SUPABASE_URL" | Create `.env` from `.env.example` and restart Expo |
| Subscribe fails with foreign key error | Run the profile trigger SQL above |
| Empty company list | Run the backend sync (`npm run sync:all` in careerpulse-phase0) |
| Auth "email not confirmed" | Disable email confirmation in Supabase Auth settings for dev, or confirm via email |
