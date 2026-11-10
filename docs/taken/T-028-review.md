# T-028 — review (ronde 7, na "eindcontrole faalt")

Beoordeeld: de werkmap tegen `HEAD` (`805b045`). Gewijzigd zijn `src/i18n/{nl,fr}.json`, `src/lib/auth.ts`, `src/pages/SignInPage.tsx`, `tests/db/admin.test.ts`, `tests/e2e/auth.spec.ts`, `tests/e2e/language.spec.ts`, `tests/helpers/supabase-admin.ts`, `tests/unit/i18n.test.ts` en `vitest.config.ts`. Nieuw zijn de migratie `supabase/migrations/20261108110000_sign_in_status.sql` en de tests `tests/db/sign-in-status.test.ts`, `tests/unit/auth.test.ts` en `tests/unit/sign-in-no-code.test.ts`.

`CLAUDE.md` en `REQUIREMENTS.md` zijn niet gewijzigd. `VRAGEN.md` heeft geen blok voor T-028. Volgens `docs/loop-log.md` slaagt de build nu.

## Kernbeslissingen
- **Geen geheime sleutels:** de client roept alleen `rpc('sign_in_status')`, `signInWithOtp` en `verifyOtp` aan met de anon-sleutel. De testhelper `requestCode` gebruikt `anonClient()`.
- **Rechten in de databank:** `sign_in_status` is `security definer` met `search_path = ''`. Alleen anon en authenticated krijgen `execute`, en de functie geeft alleen een tekstwaarde terug. Het echte slot blijft bij de triggers `handle_user_created`/`handle_user_confirmed` uit T-027. Anon kan zo een onbevestigde gebruiker zonder geldige uitnodiging verwijderen. Zo'n gebruiker kan toch niet meer bevestigen, omdat `accept_invitation` dan een fout geeft, dus er gaat geen data verloren.
- **Migratie:** er komt één nieuwe functie bij en het schema van geen enkele tabel verandert. De functies `check_invite` en `refresh_pending_invite` zijn al in T-027 gedropt, dus de aanpassing in `admin.test.ts` klopt.
- **Teksten:** `nl.json` en `fr.json` verliezen dezelfde twee sleutels, en `auth.unknownAddress` is in beide talen herschreven.

## Dekking per criterium
1. Een e2e-test in NL en FR vindt precies één tekstveld en geen code-knop, code-label of `input[name="invite"]`. Daarnaast doorzoeken unit-tests de bron en de sleutels.
2. De db-test dekt de drie gevallen: nooit uitgenodigd, verlopen op 7 d + 1 s, en ingetrokken. Hij telt de mails in Mailpit en de rijen in `auth.users`, en voert ook een rechtstreekse `signInWithOtp` uit. De e2e-test telt de `/auth/v1/otp`-requests en controleert dat de melding bij het veld staat.
3. De db-test controleert `accepted_at`/`accepted_by`, de status `member`, dat er één rij is en dat `createUser` faalt. De e2e-test doorloopt beide varianten (met en zonder de mail van de beheerder) en gebruikt een adres in hoofdletters met spaties eromheen.
4, 6, 8 en 9: de bestaande tests blijven staan. Voor 6 komt er een controle bij dat de tabellen na de RPC dicht blijven.
5. Een e2e-test controleert dat er geen request naar `sign_in_status` of `/otp` vertrekt. De Franse variant staat in `language.spec.ts`.
7. De tests controleren de link, één code van 6 cijfers, dat een foute code `codeInvalid` geeft en dat de uitnodiging dan niet opgebruikt raakt.

## Bevindingen

### 1. `tests/unit/auth.test.ts:18`: ernst laag, voor de tester
**Probleem:** dit punt uit ronde 6 is nog open. `vi.stubGlobal('window', …)` wordt nergens teruggezet. Met `isolate: false` en `pool: 'threads'` delen de testbestanden hun globals. Een nep-`window` kan dan doorlekken naar een later bestand dat `supabase-js` laadt, en dat pakket kijkt naar `typeof window`. Of het misgaat, hangt af van de volgorde waarin de bestanden draaien.
**Voorstel:** voeg `afterEach(() => vi.unstubAllGlobals())` toe.

### 2. `src/lib/auth.ts:61-63`: ernst laag, voor de ontwikkelaar
**Probleem:** voor een uitgenodigd adres wordt elke `500` van GoTrue gelezen als "onbekend adres". Een mislukte mail (SMTP) geeft ook een `500`. De uitgenodigde krijgt dan de melding "Geen account met dit e-mailadres. Vraag een beheerder om een uitnodiging.", terwijl hij wel uitgenodigd is. Voor een lid is dit al opgelost. Voor een uitgenodigde zit het risico erin dat de race tussen de controle en de request zeldzamer is dan een mailfout.
**Voorstel:** gebruik `unknownAddress` alleen als de foutboodschap op de trigger wijst (`/database error/i`). Een andere `500` blijft dan `auth.error`. Pas daarna de `it.each`-case in `auth.test.ts` aan.

### 3. `vitest.config.ts:14-15`: ernst laag, voor de ontwikkelaar
**Probleem:** de wissel naar `pool: 'threads'` hoort niet bij R-002. Hij is wel nodig voor een groene eindcontrole en staat in `docs/beslissingen.md` (de sectie "T-028 — vitest-pool").
**Voorstel:** laten staan en in het commitbericht apart vermelden.
