# T-028 — review (ronde 5, na "eindcontrole faalt")

Beoordeeld: de werkmap tegen `HEAD` (`4d80a66`). Dat zijn de gewijzigde `src/` en `tests/`, de nieuwe migratie `20261108110000_sign_in_status.sql` en de nieuwe tests `tests/db/sign-in-status.test.ts`, `tests/unit/auth.test.ts` en `tests/unit/sign-in-no-code.test.ts`.

`CLAUDE.md` en `REQUIREMENTS.md` zijn niet gewijzigd. Er staat geen blok voor T-028 in `VRAGEN.md`.

## Kernbeslissingen
- **Geen geheime sleutels:** de client gebruikt alleen `supabase.rpc` en `signInWithOtp` met de anon-sleutel. De testhelper `requestCode` gebruikt `anonClient()`, dus dezelfde weg als de app.
- **Migratie en rechten:** er is één nieuwe migratie in `supabase/migrations/`, met `security definer`, `search_path = ''` en `execute` alleen voor anon en authenticated. De hulpfuncties `normalize_email`, `is_valid_email_shape` en `invitation_is_valid_at` bestaan (migratie `20261108100000`). `check_invite` en `refresh_pending_invite` zijn daar al gedropt, dus `admin.test.ts` haalt terecht de aanroep van `check_invite` weg. Het slot blijft de trigger op `auth.users`.
- **Teksten:** `nl.json` en `fr.json` verliezen dezelfde twee sleutels, en `auth.unknownAddress` is in beide talen herschreven. De i18n-uitzondering `replacedByT028` noemt precies die drie sleutels. Buiten de bronscan en die uitzondering komt `haveInvite`, `inviteLabel` of `invite-error` nergens meer voor in `src/` of `tests/`.
- **Documentatie:** `docs/beslissingen.md:77` en `docs/beslissingen.md:431-436` beschrijven de wijziging, en `docs/online-zetten.md:23` vermeldt de migratie. Die tekst stond al in een eerdere commit.

## Dekking per criterium (R-002 en T-028.md)
1. Er is een e2e-test in NL en FR: precies één textbox, geen knop of label voor een code en geen `input[name="invite"]`. Een unit-test scant de bron en de JSON-sleutels.
2. De db-test dekt drie gevallen: (a) nooit uitgenodigd, (b) verlopen met een onbevestigde gebruiker, die daarna weg is, en (c) ingetrokken. Telkens wordt geteld dat er geen mail in Mailpit komt en geen gebruiker in `auth.users`. Een extra test controleert dat een rechtstreekse `signInWithOtp` na de opruiming geen mail stuurt. De e2e-test dekt (a) in NL en FR en (b), en controleert telkens `#email-error`, `aria-invalid`, stap 1 en nul `/auth/v1/otp`-requests.
3. De e2e-test dekt twee varianten: met en zonder de mail van de beheerder, met het adres in hoofdletters en met spaties eromheen. Beide eindigen op `/welkom`. De db-test controleert `accepted_at` en `accepted_by`, dat het adres niet meer in `list_invitations` staat, de status `member`, dat er één rij in `auth.users` blijft en dat `createUser` faalt.
4, 8 en 9. De bestaande tests blijven gelden. Het pad van criterium 3 eindigt op `/welkom`.
5. Een nieuwe e2e-test controleert dat `piet@` geen request naar `rpc/sign_in_status` of `/auth/v1/otp` stuurt. De Franse variant staat in `language.spec.ts`.
6. De db-test controleert dat de functie alleen de drie waarden teruggeeft, als string. Ongeldige invoer (`''`, `'   '`, `piet@`, `geen-adres`) geeft `unknown`, en `recipes`, `reviews` en `invitations` blijven dicht voor anon.
7. De db-test en de e2e-test controleren de link, precies één code van 6 cijfers, en dat een foute code `auth.codeInvalid` geeft zonder sessie en zonder dat de uitnodiging opgebruikt raakt.

De unit-tests van `auth.ts` dekken:
- het normaliseren van het adres;
- `unknown` zonder GoTrue-aanroep;
- `shouldCreateUser` per status, met `lang`;
- een `500` die alleen bij `invited` als onbekend adres telt;
- `otp_disabled`;
- een verbindingsfout zonder veldmelding.

Volgens `docs/loop-log.md` is de build op 2026-11-09 om 21:18 geslaagd. Ik heb de tests zelf niet gedraaid.

## Bevindingen

Geen.
