# T-028 — review (ronde 3)

`CLAUDE.md` en `REQUIREMENTS.md` zijn niet gewijzigd. Geen kernbeslissing geschonden: alleen de anon-sleutel, een nieuwe migratie in `supabase/migrations/` (`20261108110000_sign_in_status.sql`, `security definer`, `search_path = ''`, alleen `execute` voor anon/authenticated), het slot blijft de trigger op `auth.users`, en `nl.json`/`fr.json` houden dezelfde sleutels.

Bevinding 1 en 2 van de vorige ronde zijn opgelost. In `src/lib/auth.ts:61-63` geldt de `500` nu alleen bij `invited`, en `tests/unit/auth.test.ts:67-72` legt vast dat `member` + `500` `auth.error` geeft.

De tests uit `stash@{0}` staan terug in de werkmap: e2e `auth.spec.ts`/`language.spec.ts`, db `sign-in-status.test.ts`/`admin.test.ts`, unit `sign-in-no-code.test.ts`/`i18n.test.ts` en helper `requestCode`. Elk criterium van `T-028.md` heeft een test: 1, 2, 3, 5, 6 en 7 nieuw, 4, 8 en 9 met de bestaande tests. Ik heb gecontroleerd dat de helpers en databankfuncties waar de tests op leunen bestaan: `normalizeEmail`, `setInvitationSentAt`, `createInvitation`, `getInvitation`, `countMails`, `authUser`, `seedLanguage`, `normalize_email`, `is_valid_email_shape` en `invitation_is_valid_at`. `check_invite` en `refresh_pending_invite` zijn in T-027 gedropt.

Let op: volgens `T-028-tests.md` is niets gedraaid, alleen `tsc --noEmit`. Of de tests slagen, moet de bouwloop nog bevestigen.

## Bevindingen

### 1. Verouderde verwijzing naar `invite-error`
- **Bestand:** `docs/beslissingen.md:77`
- **Ernst:** laag
- **Rol:** ontwikkelaar
- **Probleem:** De lijst met vaste veldfout-ids noemt nog `invite-error`. Dat id bestaat niet meer sinds het codeveld uit `SignInPage.tsx` is gehaald.
- **Voorstel:** `invite-error` uit die opsomming halen, met een korte verwijzing naar T-028.
