# T-016 — Tests (R-012 Reviews)

Bestanden: `tests/db/reviews.test.ts`, `tests/unit/reviews.test.ts`, `tests/e2e/reviews.spec.ts`.

`npx tsc --noEmit` faalt alleen op ontbrekende productienaden: `canEditReview`/`canDeleteReview` in `permissions.ts` en `src/lib/reviews.ts`. Dat is verwacht (geen bestaande-gedragsfase).

## Gedekt
1. Score 1–5: DB (1, 5, 0, 6, null, 3,5, update 0/6), unit `validateReview`, UI ("Kies een score.", `aria-describedby`, geen verzoek).
2. Tekst ≤ 500: DB (500, emoji/accent, 501, spaties → null, trim), unit (code points, trim), UI (501 → melding, geen `maxlength`, teller `501/500`, geen verzoek).
3. Eén review per recept: DB (23505, ander recept/andere gebruiker, eigen recept, update/delete/opnieuw, kolomrecht 42501), UI (formulier weg/terug, 23505 in tweede tab).
4. Gemiddelde/aantal: DB (4,3 / 4,5 / 1,8 / 4,3 / null; tellers), unit (`formatRating`, `reviewCountText`), UI (`rating-summary`, "Nog geen reviews", live update zonder herladen).
5. Overzicht: DB (select + order met nullsFirst false + `lte`), UI (`recipe-rating`, sortering A, D, C, B, URL `sorteer`, herladen, onbekende waarde, filter en sortering wissen elkaar niet).
6. Volgorde/auteur/datum: DB (embed + order), UI (omgekeerde volgorde, "5 van 5 sterren", naam, "2 november 2026", bewerkte review behoudt plaats en datum).
7. Rechten: DB (B 0 rijen, vreemde `author_id` 42501, beheerder delete 1 / update 0, anoniem, cascade), unit (`canEditReview`/`canDeleteReview`), UI (geen knoppen, beheerder alleen Verwijderen, `ConfirmDialog`, 0 rijen → "Verwijderen mislukt.").
8. Geen kolom `rating*`/`review*` op `recipes` (via pg-hulp op `information_schema`).
- Extra: `nl.json`-teksten, fieldset/legend "Score", radio's ≥ 44 px, pijltjestoetsen, label "Tekst (optioneel)", verbindingsfout behoudt invoer, lange tekst geen horizontaal scrollen (360 px).

## Niet gedekt
- Criterium 8, echte grootteproef: groottelimiet bestaat nog niet (groottetaak).
- Contrasttest van `--color-star` tegenover `--color-bg`: de bestaande tokentest kent het token niet via naamgeving; ik wijzig die niet blind. Ontwikkelaar kiest een naam die al onder de bestaande regels valt of voegt een expliciete regel toe.
- `no-hardcoded-styles` en axe (a11y.spec): scannen bestaand alle stijl/routes; de detailpagina wordt vanzelf meegenomen. Geen nieuwe test nodig.
- De lay-outcontrole in `layout.spec.ts` kreeg geen detailpagina met reviews; dekking staat in `reviews.spec.ts` (laatste test).

## Aannames voor de ontwikkelaar (testnaden)
- `data-testid`: `rating-summary` (detail), `recipe-rating` (overzicht), `review-item` (elke review in de lijst).
- Sterren: `fieldset` met `legend` "Score"; radio's met naam "1 ster", "2 sterren" … ; een radio of zijn `label` is ≥ 44 × 44 px.
- `validateReview` geeft een object waarvan `rating`/`body` bij een fout gezet zijn; `parseSort` geeft een waarde vergelijkbaar met `===`; `toSearchParams(sort, base)` geeft `URLSearchParams` met behoud van andere parameters.
- "Sorteren" is een `<select>` met label "Sorteren" en opties "Nieuwste"/"Beoordeling".
- Datum in de lijst via `AuthorLine` ("2 november 2026").
- De bevestiging bij verwijderen is een `dialog` met een knop "Verwijderen".

## Herstel na melding ontwikkelaar
- reviews.spec.ts: alertdialog i.p.v. dialog; "Nieuw" gescoped op review-item; 23505-test wacht eerst op geladen lijst.
- a11y.spec.ts: radiogroep telt als één tabstop in dekkingscheck (pijltjestoetsen-criterium).
