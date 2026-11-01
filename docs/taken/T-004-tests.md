# T-004 — tests (R-017)

`npx tsc --noEmit`: alleen de verwachte fouten door ontbrekende productiecode (`formatDateTime` in `src/lib/format.ts`, `src/lib/permissions.ts`). Verder compileert alles.

## Nieuwe en gewijzigde bestanden
- `tests/db/admin.test.ts` (lokale Supabase): criteria 1–4 aan databankzijde.
- `tests/unit/permissions.test.ts`: `canDelete`.
- `tests/unit/format.test.ts`: `formatDateTime` (winter, zomer, dagwissel).
- `tests/unit/admin-setup.test.ts`: tekstzoektest op `grant_admin` en `admins` in `src/`, geen beheerroute in `App.tsx`, inhoud van `docs/beheer.md`.
- `tests/e2e/invites.spec.ts`: link en scherm voor beheerder, omleiding voor gewone gebruiker, statussen, "Nieuwe code", kopiëren, laad- en lege toestand.
- Testhulp: `makeAdmin`, `createInvite({ createdAt, usedBy })` (`tests/helpers/supabase-admin.ts`); sessiesoort `'admin'` in `routes.ts` en `signInForRoute`; `/uitnodigingen` in `routes`, dus 360 px-, tikdoel-, label-, focus- en navigatiechecks (layout/a11y/navigation-specs aangepast met een beheerderssessie).

## Gedekt
- Crit. 1: `42501` voor `list_invites`/`create_invite` (gewone gebruiker en anon), `permission denied` op `invites` select/insert, geen extra rijen; beheerder lukt; link zichtbaar/onzichtbaar; omleiding naar `/profiel` zonder code.
- Crit. 2: coderegex, `check_invite` true, 50 unieke codes, `invite_status` op de grens (+1 s, gebruikt wint), gelijke grens als `invite_is_valid_at`, `list_invites` (velden, naam, expires_at = +7 dagen, volgorde); UI: Open/Gebruikt/Verlopen, naam, vervaldatum, nieuwe code bovenaan, kopiëren, laad- en lege toestand; `formatDateTime`.
- Crit. 3 (databank): eigen recept verwijderen lukt; ander: 0 rijen en recept bestaat nog; beheerder verwijdert elk recept; beheerder kan niet wijzigen; anon verwijdert niets. `canDelete` unit.
- Crit. 4: insert in `admins` geweigerd, `grant_admin` geweigerd voor anon/authenticated, via directe SQL werkt het (idempotent), onbekend adres faalt; `src/` bevat geen `grant_admin`; `docs/beheer.md` bevat de SQL.

## Review-herstel (testkant)
- Bevinding 1: twee Playwright-tests in `tests/e2e/invites.spec.ts` (500 op `list_invites` en op `create_invite` → `role="alert"` met `nl['invites.error']`). Falen tot de ontwikkelaar de melding en sleutel `invites.error` toevoegt.
- Bevinding 2: anon-test op `list_invites` controleert nu code `42501`.

## Niet gedekt
- Crit. 3, knop "Verwijderen" met bevestiging en reviews: detailpagina en reviewtabel bestaan niet (zie brief, Risico's; hoort bij R-003/R-012).
- Plan 13 (code naar hoofdletters in `src/lib/auth.ts`): geen acceptatiecriterium van R-017; de bestaande auth-tests moeten de ontwikkelaar na de wijziging draaien.
- Dubbel tikken op "Nieuwe code" (plan 9): geen criterium.

## Aannames over de interface (voor de ontwikkelaar)
- Elke code staat in een element met rol `listitem` (`li`) met code, statuslabel, naam, vervaldatum en knop "Kopieer" erin; het eerste `listitem` is de nieuwste code. Gebruik in `/uitnodigingen` geen andere `li` buiten de codelijst.
- "Gekopieerd" verschijnt in dezelfde rij; "Kopieer" is een knop met de tekst uit `invites.copy`.
- Vervaldatum staat in de rij als "vervalt op {datum}" (datum met `formatDateTime`).
- `create_invite()` geeft één rij of een array van één rij terug met `code` en `status`.
- `list_invites` wordt via POST op `/rest/v1/rpc/list_invites` aangeroepen (zoals supabase-js `rpc`).
- `profile.invitesLink` bestaat als sleutel in `nl.json`.
