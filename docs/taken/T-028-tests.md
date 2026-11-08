# T-028 — tests (herstel uit stash)

## Gedaan
Uit `stash@{0}` (via `git show`) teruggezet in de werkmap:
- `tests/e2e/auth.spec.ts` (criteria 1, 2, 3, 5, 7), `tests/e2e/language.spec.ts` (vervangt de oude invite-code-test door `piet@` + `FR['auth.emailInvalid']`; geen `auth.haveInvite` meer), `tests/helpers/supabase-admin.ts` (helper `requestCode`), `tests/db/admin.test.ts` (`check_invite` weg).
- `tests/db/sign-in-status.test.ts` en `tests/unit/sign-in-no-code.test.ts` (criteria 1-bronscan, 2, 3-db, 6) uit `stash@{0}^3`.
- `tests/unit/i18n.test.ts`: uitzondering `replacedByT028` (`auth.haveInvite`, `auth.inviteLabel`, `auth.unknownAddress`) erbij, en de T-029-uitzondering (`changedByT029`, in HEAD aanwezig maar niet in de stash) behouden.
- `tests/unit/auth.test.ts` (al in werkmap): unit-tests van `requestCode`/`verifyCode`, inclusief `member` + `500` → `auth.error`.

## Gecontroleerd
- `npx tsc --noEmit`: geen fouten.
- `haveInvite`/`inviteLabel`/`invite-error` komen in `tests/` en `src/` alleen nog voor in de bronscan-test en de oude fixture `nl-before-T-018.json` (bedoeld).

## Niet gedraaid
`npx vitest run` en `npx playwright test --list` werden in deze sessie niet toegestaan. Dus niet bevestigd dat de unit-, db- en e2e-tests slagen; de ontwikkelaar/bouwloop draait ze met `BouwCommando`.

## Dekking
Criteria 1–3, 5–7 gedekt (e2e/db/unit). Criteria 4, 8, 9: bestaande tests blijven gelden, geen nieuwe tests.
