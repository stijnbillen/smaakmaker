# T-028 — tests

`npx tsc --noEmit` slaagt. Vitest en `playwright --list` kon ik niet draaien (commando's werden niet toegestaan in deze sessie): de ontwikkelaar draait ze eerst.

## Gedekt
| Criterium | Test |
|---|---|
| 1 | `tests/e2e/auth.spec.ts` (NL en FR: één tekstveld, knop, geen code-element) en `tests/unit/sign-in-no-code.test.ts` (sleutels weg, bronscan `src/`, `AuthField`) |
| 2 | `tests/db/sign-in-status.test.ts` (a, b, c + directe `signInWithOtp` zonder mail) en e2e in `auth.spec.ts` (a in NL en FR, b; `#email-error`, `aria-invalid`, geen `/auth/v1/otp`, stap 1) |
| 3 | db: open uitnodiging zonder gebruiker + met gebruiker; `accepted_at`, `list_invitations`, `'member'`, telling 1, `createUser` faalt. e2e: beide varianten in verse context, hoofdletters en spaties, einde op `/welkom` |
| 4 | bestaande tests blijven; e2e-pad van 3 eindigt op `/welkom` |
| 5 | e2e: `piet@` geeft geen request naar `rpc/sign_in_status` of `/auth/v1/otp`; `language.spec.ts` vervangen door `piet@` + `FR['auth.emailInvalid']` |
| 6 | db: `sign_in_status` geeft alleen `member`/`invited`/`unknown`, ongeldige invoer `unknown`, tabellen blijven dicht voor anon |
| 7 | db en e2e: link + precies 6 cijfers; foute code geeft `auth.codeInvalid` |
| 8, 9 | bestaande tests |
| unit `auth.ts` | `tests/unit/auth.test.ts`: normaliseren, `unknown`, `member`/`invited` + `lang`, 500/`otp_disabled`, verbindingsfout, overige fouten |

Andere aanpassingen: uitzondering `replacedByT028` in `tests/unit/i18n.test.ts` (alleen `auth.haveInvite`, `auth.inviteLabel`, `auth.unknownAddress`; `auth.intro` blijft strikt gelijk, want die verwijst niet naar een uitnodigingscode); `check_invite` weg uit `tests/db/admin.test.ts`; helper `requestCode` in `tests/helpers/supabase-admin.ts`.

## Niet gedekt
- Docs (`beslissingen.md`, `online-zetten.md`): geen testwerk.
- De mailcontrole op "geen mail sinds het begin" gebruikt `countMails` (vóór/na), niet een tijdstempel; gelijkwaardig.
- `refresh_pending_invite`/`check_invite` in de databank zelf: de brief eist alleen dat ze uit `src/` verdwijnen.
