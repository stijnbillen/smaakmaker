# T-028 — review (ronde 4)

`CLAUDE.md` en `REQUIREMENTS.md` zijn niet gewijzigd. Er is geen kernbeslissing geschonden:
- de client gebruikt alleen de anon-sleutel;
- er is één nieuwe migratie in `supabase/migrations/` (`20261108110000_sign_in_status.sql`, `security definer`, `search_path = ''`, `execute` alleen voor anon/authenticated);
- het slot blijft de trigger op `auth.users`;
- `nl.json` en `fr.json` houden dezelfde sleutels (twee weg in beide, één tekst herschreven in beide).

Er staat geen blok voor T-028 in `VRAGEN.md`.

De bevinding van ronde 3 is opgelost: in `docs/beslissingen.md:77` staat `invite-error` niet meer bij de geldige ids. `docs/beslissingen.md:431` heeft het kopje T-028, en `docs/online-zetten.md:23` vermeldt de migratie.

Volgens `docs/loop-log.md` is de build daarna geslaagd (2026-11-08 23:27). Ik heb de tests zelf niet gedraaid.

Dekking per criterium van `T-028.md`:
1. e2e NL/FR (`auth.spec.ts`: één textbox, geen code-knop, label of `input[name="invite"]`) en een unit-bronscan (`sign-in-no-code.test.ts`).
2. db (a), (b) en (c), plus een rechtstreekse `signInWithOtp` na de opruiming (`sign-in-status.test.ts`). e2e (a) NL/FR en (b), met een telling van de `/auth/v1/otp`-requests.
3. e2e met beide varianten (met en zonder mail van de beheerder, adres in hoofdletters en met spaties) tot `/welkom`. db: `accepted_at`, `list_invitations`, `member`, één rij in `auth.users`, en `createUser` faalt.
4, 8, 9. De bestaande tests blijven gelden. Het pad van criterium 3 eindigt op `/welkom`.
5. Nieuwe e2e zonder request naar `rpc/sign_in_status` of `/auth/v1/otp`. Franse variant in `language.spec.ts`.
6. db: de functie geeft alleen een string met drie mogelijke waarden, ongeldige invoer geeft `unknown`, en de tabellen blijven dicht voor anon.
7. db en e2e: link, precies één code van 6 cijfers, en een foute code geeft `auth.codeInvalid` zonder sessie.

De unit-tests van `requestCode` en `verifyCode` dekken de punten uit de taak: normaliseren, `unknown` zonder GoTrue-aanroep, `shouldCreateUser` per status met `lang`, `otp_disabled` en `500` (alleen bij `invited`), en een verbindingsfout zonder veldmelding.

## Bevindingen

Geen.
