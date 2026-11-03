# Smaakmaker

PWA om recepten bij te houden (React + TypeScript + Supabase). Zie `REQUIREMENTS.md` en `PROGRESS.md`.

## Opstarten

1. Installeer Docker Desktop en start het.
2. `npm install`
3. `npx supabase start` (lokale Supabase; past de migraties in `supabase/migrations/` toe).
4. Kopieer `.env.example` naar `.env.local` en vul de waarden uit `npx supabase status`.
5. `npm run dev` voor ontwikkelen.

## Testen

`npm run build && npm test` bouwt de app en draait Vitest (logica, build, databank) en daarna Playwright (360 px).
De tests praten alleen met de lokale Supabase; zonder `supabase start` falen ze met een duidelijke melding.
