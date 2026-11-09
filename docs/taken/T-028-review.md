# T-028 — review (ronde 6, na "eindcontrole faalt")

Beoordeeld: de werkmap tegen `HEAD` (`0ea6b6a`). Dat zijn de gewijzigde `src/`, `tests/`, `vitest.config.ts` en `docs/beslissingen.md`, de nieuwe migratie `20261108110000_sign_in_status.sql` en de nieuwe tests `tests/db/sign-in-status.test.ts`, `tests/unit/auth.test.ts` en `tests/unit/sign-in-no-code.test.ts`.

`CLAUDE.md` en `REQUIREMENTS.md` zijn niet gewijzigd. In `VRAGEN.md` staat geen blok voor T-028.

## Kernbeslissingen
- **Geen geheime sleutels:** de client gebruikt alleen de anon-sleutel (`rpc('sign_in_status')` en `signInWithOtp`). De testhelper `requestCode` doet hetzelfde via `anonClient()`.
- **Rechten in de databank:** `sign_in_status` is `security definer` met `search_path = ''`, en `execute` gaat alleen naar anon en authenticated. Het echte slot blijft de trigger op `auth.users`. De functie geeft alleen een tekstwaarde terug. Dat een adres zo op te zoeken is, lekte al via `otp_disabled`. Dat staat als aanvaard risico in T-028.md.
- **Migraties:** er is één nieuwe migratie en er wordt geen tabel gewijzigd. `check_invite` en `refresh_pending_invite` werden al in T-027 gedropt, dus de aanpassing in `admin.test.ts` klopt.
- **Teksten:** `nl.json` en `fr.json` verliezen dezelfde twee sleutels. `auth.unknownAddress` is in beide talen herschreven. De uitzondering in `i18n.test.ts` noemt precies die drie sleutels.

## Dekking per criterium
1. De e2e-test in NL en FR vindt precies één tekstveld en geen knop, label of `input[name="invite"]` voor een code. Een unit-test scant de bron en de sleutels.
2. De db-test dekt de drie gevallen (a), (b) en (c). Telkens telt hij de mails in Mailpit en de rijen in `auth.users`, en in geval (b) controleert hij dat de onbevestigde gebruiker is opgeruimd. Een extra test vraagt na de opruiming rechtstreeks `signInWithOtp` aan. De e2e-test dekt (a) in NL en FR en (b), en telt telkens de `/auth/v1/otp`-requests.
3. De e2e-test dekt twee varianten (met en zonder de mail van de beheerder), met een adres in hoofdletters en met spaties eromheen. Beide eindigen op `/welkom`. De db-test controleert `accepted_at`/`accepted_by`, `list_invitations`, de status `member`, dat er precies één rij in `auth.users` staat en dat `createUser` faalt.
4, 8 en 9. De bestaande tests blijven gelden. Het pad van criterium 3 eindigt op `/welkom`.
5. Een nieuwe e2e-test controleert dat er geen request naar `rpc/sign_in_status` of `/auth/v1/otp` vertrekt. De Franse variant staat in `language.spec.ts`.
6. Er zijn alleen drie tekstwaarden, ongeldige invoer geeft `unknown`, en de tabellen blijven dicht voor anon.
7. De test controleert de link, één code van 6 cijfers, en dat een foute code `auth.codeInvalid` geeft en de uitnodiging niet opgebruikt.

De unit-tests van `auth.ts` dekken alle punten uit T-028.md, ook dat een `500` voor een lid een gewone fout blijft.

## Bevindingen

### 1. `tests/unit/auth.test.ts:18`: ernst laag, voor de tester
**Probleem:** `vi.stubGlobal('window', …)` wordt nergens teruggezet. Sinds `vitest.config.ts` `isolate: false` gebruikt, delen alle bestanden dezelfde globals. Een nep-`window` kan dan in een later testbestand terechtkomen, bijvoorbeeld in een db-test die `supabase-js` laadt, en `supabase-js` kijkt naar `typeof window`. Of het misgaat, hangt af van de volgorde (`language.test.ts` en `format.test.ts` roepen wel `vi.unstubAllGlobals()` aan). De build slaagt nu, maar dit is precies het soort gedeelde toestand waartegen het commentaar in `vitest.config.ts` waarschuwt.
**Voorstel:** voeg `afterEach(() => vi.unstubAllGlobals())` toe in `auth.test.ts`.

### 2. `vitest.config.ts:14-15`: ernst laag, voor de ontwikkelaar
**Probleem:** de wissel naar `pool: 'threads'` gaat over de testomgeving en hoort niet bij R-002. De wijziging is wel nodig om de eindcontrole te laten slagen, en ze staat in `docs/beslissingen.md`. Een kernbeslissing wordt niet geraakt. Ik meld ze alleen omdat het scope buiten de taak is.
**Voorstel:** laten staan en in het commitbericht apart vermelden.
