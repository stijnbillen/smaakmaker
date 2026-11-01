# T-003 — Tests (R-002)

`npx tsc --noEmit` geeft nu alleen nog: `src/lib/format` en `src/lib/validation` bestaan niet. Dat zijn de testnaden voor de ontwikkelaar. De tests zelf compileren. Er is niets gedraaid tegen Supabase (taak is geen "bestaand gedrag"; tests mogen falen tot de ontwikkelaar klaar is).

## Gedekt per criterium

| # | Criterium | Test |
|---|-----------|------|
| 1 | Geen account zonder geldige code | `tests/db/auth-invites.test.ts` (onbekende, ontbrekende en gebruikte code via OTP; `admin.createUser` zonder/met foute code; geldige code → gebruiker, na bevestiging `used_by`; code niet verbrand vóór bevestiging; `check_invite` ja/nee). `tests/e2e/auth.spec.ts`: verzonnen en gebruikte code → "Deze code is niet geldig.", `aria-invalid` op het codeveld, geen mail in Mailpit. |
| 2 | Eenmalig, 7 dagen | DB: `invite_is_valid_at` op +7 dagen (waar) en +7 dagen 1 s (onwaar), onbekende/gebruikte code onwaar; code van 7 d + 1 s oud geweigerd (OTP en admin); race met twee adressen: eerste bevestiger wint, tweede geen sessie. |
| 3 | Weergavenaam 2–40 | DB: 1/41 faalt, 2/40 lukt, trim, eigen rij alleen, alleen kolom `display_name`, geen insert/delete, profiel bij nieuwe gebruiker met naam null. Unit: `isValidDisplayName`. E2E: `/welkom` met 1, 41, 2 tekens; gebruiker mét naam ziet `/welkom` niet. |
| 4 | Ongeldig e-mailadres | Unit `isValidEmail` (incl. de lijst uit de brief). E2E: `piet@` → `aria-invalid`, `aria-describedby` naar "Vul een geldig e-mailadres in.", geen request naar `/auth/v1/otp`. |
| 5 | Zonder aanmelding dicht | DB: anon select/insert op `recipes`, select op `profiles`, `invites` dicht voor anon én ingelogde gebruiker. E2E: `/`, `/nieuw`, `/favorieten`, `/profiel` → `/aanmelden`. |
| 6 | Link én code in mail | DB: nieuwe gebruiker (bevestigingsmail) en bestaande (inloglinkmail): link naar `/auth/v1/verify` en precies één 6-cijferige code; juiste code meldt aan, foute en verlopen code (via `backdateCodes`) niet. E2E: juiste code → Recepten, zonder naam → `/welkom`, foute en verlopen code → melding, geen sessie in `localStorage`, blijft op `/aanmelden`; nieuw account met uitnodiging + code; link in nieuwe browsercontext; `inputmode="numeric"` en `autocomplete="one-time-code"`. Unit: `isSixDigitCode`, mailtemplates bevatten `{{ .ConfirmationURL }}` en `{{ .Token }}` en lopen gelijk met `nl.json` (`tests/unit/email-templates.test.ts`). |
| 7 | Afmelden | E2E: Profiel toont naam, "Afmelden" → `/aanmelden`, sleutel weg, `/` blijft op `/aanmelden`. Sessie wordt eenmalig in `localStorage` gezet (niet via init-script, anders komt hij bij elke navigatie terug). |
| 8 | Auteur en datum | Unit `formatDate` (tz Europe/Brussels, ook de dagsgrens). E2E: B ziet "Annemie" en de datum bij A's recept. |
| R-001/R-016 | `/aanmelden` en `/welkom` in routelijst | `routes.ts` heeft nu `auth: 'full' \| 'none' \| 'unnamed'`; `layout.spec.ts` en `a11y.spec.ts` openen elk scherm met de juiste sessie; `navigation.spec.ts` gebruikt `routesWithNav` (die schermen hebben geen navigatiebalk). |

## Niet gedekt
- `AuthorLine` als losse component: er is geen DOM-testomgeving (geen jsdom); gedekt via het e2e-overzicht.
- Reviews en foto's (crit. 5, 8): bestaan nog niet, volgende taken herhalen het patroon.
- Cloud-templates (risico in de brief): niet testbaar lokaal.

## Aannames die de ontwikkelaar moet respecteren
- **Aanmeldscherm, modus "nieuw account":** brief is niet eenduidig ("modus Nieuw account" tegenover schakelaar "Ik heb een uitnodigingscode"). `openInviteMode` klikt een switch/checkbox/tab/radio/knop met naam `uitnodigingscode` of `nieuw account`, tenzij het veld "Uitnodigingscode" al zichtbaar is.
- Labels/knoppen: "E-mailadres", "Uitnodigingscode" (exact), "Code uit de e-mail", knoppen "Stuur mij een code", "Aanmelden" (exact), "Verder", "Afmelden"; veld "Weergavenaam". Foutmeldingen: "Deze code is niet geldig.", "Vul een geldig e-mailadres in.", "Je naam moet 2 tot 40 tekens hebben.".
- `aria-invalid="true"` staat op het codeveld bij een ongeldige uitnodigingscode en op het naamveld bij een foute naam.
- De stap-2-schermen verschijnen na het versturen (veld "Code uit de e-mail" zichtbaar).
- Databank: `invites(code, created_at, used_by)`, `profiles(id, display_name, created_at)`, functies `invite_is_valid_at(code, at)` en `check_invite(code)` (parameternaam `code`); `invites.created_at` is door de service-client te zetten. Tabelrechten voor `service_role` blijven open.
- `validation.ts`: `isValidEmail`, `isValidDisplayName`, `isSixDigitCode` geven `boolean`; `isValidEmail` trimt. `format.ts`: `formatDate(isoString): string`.
- Profielpagina toont de weergavenaam als losse tekst; recept in het overzicht staat in een `li` of `article` met naam en datum.
- Mails worden in Mailpit op `http://127.0.0.1:54324` gelezen (override met `MAILPIT_URL`).

## Waarschuwingen
- **SQL-hulp zonder nieuwe dependency:** `tests/helpers/pg.ts` roept `supabase db query --local -f <bestand> -o json` aan. Ik kon dit commando niet uitvoeren om de vlaggen te bevestigen (geen toestemming in deze sessie). Bestaat het niet in CLI 2.122, dan moet `pg` (devDependency, poort 54322) in `sql()` in de plaats komen; alleen die ene functie verandert. Daarop hangen: `invite_is_valid_at`-grens, `userExists`, `backdateCodes` (verlopen code).
- **Ratelimiet:** de tests sturen veel mails naar lokale Mailpit. `auth.rate_limit.email_sent` staat nu op 2; de ontwikkelaar verhoogt dat (plan stap 2), anders falen de mailtests.
- **Bestaande tests:** `createTestUser` maakt nu een uitnodiging (service-client op `invites`), zet `user_metadata.invite_code` en schrijft `profiles.display_name`. Zonder de migratie falen alle databank- en e2e-tests.
- Open risico uit de brief (zet `verifyOtp` bij een nieuwe gebruiker echt `email_confirmed_at`?) wordt door "geldige code → `used_by`" in de DB-test meteen zichtbaar.

## Herstel testfouten (na melding ontwikkelaar)
- `pg.ts` `sql()`: uitvoer zonder JSON (bv. "UPDATE n") geeft nu `[]` in plaats van een crash; `backdateCodes` werkt daardoor.
- `auth.spec.ts` "a user without a name goes to /welkom after the code": maakt eigen naamloze gebruiker (opgeruimd via `extraUsers`), dus niet meer afhankelijk van testvolgorde. Te toetsen gedrag ongewijzigd. `tsc --noEmit` slaagt.

## Herstel review-bevinding 1 (middel, tester)
- `tests/db/auth-invites.test.ts`, in "invite is single use…": twee tests voor een geblokkeerd adres.
  - Verliezer van de race (code A verbruikt door winnaar) vraagt opnieuw aan met nieuwe code B, bevestigt, krijgt sessie, B staat op gebruikt door hem.
  - Code A verloopt tussen aanvraag en bevestiging; nieuwe aanvraag met code B geeft sessie en B gebruikt.
- Deze tests falen tot de ontwikkelaar de bevinding herstelt (nieuwe aanvraag met geldige code moet de opgeslagen `invite_code` van een onbevestigde gebruiker vervangen, of die rij weghalen). `tsc --noEmit` slaagt.
- Bevinding 5 (laag) niet opgepakt: valt buiten hoog/middel.

## Herstel review ronde 2, bevinding A (middel, tester)
- `tests/db/auth-invites.test.ts`: verlooptest herschreven. Code A wordt aangemaakt met `created_at = nu − 7 dagen + 7 s` (INSERT, geen UPDATE, dus de trigger `invites_drop_stale_pending` start niet). Na de aanvraag wacht de test tot de 7-dagengrens voorbij is.
- Tweede aanvraag volgt het clientpad uit `requestCode`: `check_invite` → `rpc('refresh_pending_invite')` → `signInWithOtp` met code B → `verifyOtp` geeft sessie, B is gebruikt, A niet.
- Negatieve controle (nieuwe test): dezelfde stroom zonder `refresh_pending_invite` geeft geen sessie en B blijft ongebruikt. Zo faalt de test als de aanroep of de functie wegvalt. Die controle leunt op het gedrag van GoTrue (metadata niet herschreven bij herhaalde aanvraag, zoals de migratie vermeldt).
- Beide tests duren ~8 s (echte wachttijd, timeout 40 s). Niet gedraaid in deze sessie; `tsc --noEmit` is de controle.
- Bevinding 5 (laag) en B (ontwikkelaar) niet opgepakt.
