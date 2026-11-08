# T-028 — tests (herstelronde na review)

## Toestand
De werkmap is teruggezet naar de commit van vóór de bouw. Alle tests, helpers en code van T-028 staan alleen in `stash@{0}` ("On loop: T-028 niet geslaagd"; nieuwe bestanden in de derde ouder `stash@{0}^3`). `git` (checkout, show-tree) en `npx vitest` werden in deze sessie niet toegestaan, dus ik kon ze niet terughalen en niets draaien.

## Gedaan
- `tests/unit/auth.test.ts` opnieuw geschreven (gemockte `supabase` en `getLanguage`), met de review-bevinding: `member` + GoTrue `500` geeft `auth.error`; `invited` + `500` en `otp_disabled` geven `auth.unknownAddress`. Verder: normaliseren, `unknown` zonder GoTrue-aanroep, `shouldCreateUser` + `data.lang`, verbindingsfout zonder veldmelding, `verifyCode`.
- Niet gedraaid. Faalt tegen de huidige `src/lib/auth.ts` (nog de oude, met codes) tot de ontwikkelaar klaar is; dat is verwacht.

## Nog te herstellen uit de stash (niet gedaan)
`tests/e2e/auth.spec.ts`, `tests/e2e/language.spec.ts`, `tests/helpers/supabase-admin.ts` (helper `requestCode`), `tests/unit/i18n.test.ts` (`replacedByT028`), `tests/db/admin.test.ts`, en de nieuwe `tests/db/sign-in-status.test.ts` en `tests/unit/sign-in-no-code.test.ts`. Herstel: `git checkout 'stash@{0}' -- <tracked>` en `git checkout 'stash@{0}^3' -- <nieuwe bestanden>`.
Let op: `tests/unit/auth.test.ts` uit de stash (derde ouder) bestond ook; de nieuwe versie hierboven vervangt hem en bevat de extra `500`-case.
