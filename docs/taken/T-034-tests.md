# T-034 — Tests (R-032 Boodschappenlijst)

Bestanden:
- `tests/unit/shoppingList.test.ts` (crit. 1–8 voor de sleutel, 9, 11, 12)
- `tests/db/shoppingList.test.ts` (crit. 8–11, 13, Leegmaken) + aanvulling in `tests/db/weekMenu.test.ts` (clear_week_menu wist ook beide nieuwe tabellen)
- `tests/e2e/shoppingList.spec.ts` (crit. 1, 2, 7–12, 14, leeg menu, geen verbinding; nl en fr waar taalafhankelijk)
- `tests/helpers/shopping.ts` (nieuwe helper: ingrediënt/eenheid zaaien, regelzoekers, tikdoelcontrole)

## Gedekt
1. Omrekenen zonder afronding, `servings` null = 1 (unit); e2e 200 → 600 g meel.
2. g/kg en volume optellen, eenheid van gebruiker (pond) (unit); e2e "1,2 kg meel".
3. Gewicht/volume apart, soort `none` per eenheid, vrije eenheid zonder soort (unit).
4. `formatMeasured` met alle grenswaarden uit de brief (unit).
5. Formaat en regels zonder hoeveelheid (unit).
6. Vrije tekst samenvoegen / apart van databankingrediënt (unit).
7. Naam in interfacetaal en sortering (unit nl/fr; e2e nl en fr, taalwissel zonder herladen via profiel).
8. Afvinken: `aria-pressed`, `line-through`, onderaan, herlading, terug (e2e nl/fr); sleutels per regel en stabiel bij hoeveelheid/taal (unit); PK `(user_id, line_key)` (db).
9. "Heb ik al": `<details>` dicht, Terugzetten, bought→have→restore is niet gekocht (e2e); check op `state` en één rij per regel (db).
10. Marks blijven/vervallen bij menuwijziging (e2e, beide scenario's); `prune_shopping_marks` incl. null en > 3000 → 22023 (db).
11. `parseCustomItem` (unit); veldmelding met `aria-invalid`/`aria-describedby`, toevoegen/afvinken/verwijderen, 100 items → `customFull` (e2e); check 0/81/blanco, P0100, parallelle inserts, alleen `bought` wijzigbaar (db); Leegmaken wist 3 tabellen, andere gebruiker blijft (db + e2e); leeg menu met eigen items toont alleen "leeg" (e2e).
12. `shoppingText` (unit); klembord lezen + `role=status` "Gekopieerd", en falende `writeText` → melding + readonly `textarea` (e2e, Chromium).
13. RLS: lezen/wijzigen/verwijderen/insert voor B en beheerder, prune en clear van B, anon (db).
14. 50 recepten × 10 regels + 100 eigen items, nl en fr: geen horizontale scroll, alle zichtbare knoppen in `main` ≥ 44 × 44, lijst < 3 s na tik op het tabblad (e2e).
15. Sleutels: niet apart getest; de bestaande i18n-test en bronscan dekken dit. `shopping.unit*` moet door de ontwikkelaar in `SAME_ALLOWED` komen (brief).
Extra: geen verbinding bij laden, afvinken, "Heb ik al", toevoegen en verwijderen (e2e, nl).

## Niet gedekt
- Crit. 14: de tikdoelcontrole geldt voor alle zichtbare knoppen in `main` (strenger dan de lijst uit de brief, ook Leegmaken en tabs).
- Parallelle race tussen twee toestellen voor `prune` (bekend risico in de brief).
- Weergave/stijl (smaak); de stijlscanner dekt tokens.
- `lineKey` direct: de handtekening staat niet in de brief, dus getest via de `key` van `buildShoppingList`.

## Aannames voor de ontwikkelaar (handtekeningen niet vastgelegd in de brief)
- `src/lib/shoppingList.ts` exporteert `buildShoppingList`, `formatMeasured`, `arrangeList`, `shoppingText`, `parseCustomItem`, en de types `MenuSource` (`recipeId`, `menuServings`, `recipeServings`, `ingredients`) en `UnitInfo` (`measure`, `factor`).
- `buildShoppingList(sources, catalog, units, lang)`: `catalog` is een `Map<id, CatalogItem>` met ingrediënten én eenheden; `units` een `Map<unitId, UnitInfo>`. Resultaat is al gesorteerd en bevat `key`, `text`.
- `arrangeList(lines, items: {id, text, bought}[], marks: Map<key, 'bought' | 'have'>)` geeft `{ toBuy, bought, have }`; elk element heeft `text`. Sortering gebruikt de huidige taal (de test zet die via `useLanguage`).
- `shoppingText(toBuy)` neemt de `toBuy` van `arrangeList`.
- `parseCustomItem(text)` geeft `{ ok: true, value } | { ok: false }` (zoals `parseQuantity`).
- `formatMeasured(value, 'weight' | 'volume')` geeft de tekst; onder 0,005 begint die met het deel vóór `{q}` van `servings.belowMinimum` ("<").
- UI: regelknop is een `button[aria-pressed]` met de regeltekst als zichtbare tekst (alleen die tekst); "Heb ik al" en "Verwijderen" zijn knoppen in hetzelfde `listitem`; `shopping.customLabel` is het label van het invoerveld; `shopping.removeLabel` bevat `{text}`; het "Heb ik al"-deel is een `<details>` met `<summary>` = `shopping.haveSection`; foutmelding van een eigen item staat in het element waar `aria-describedby` naar wijst; terugvalvak is `textarea[readonly]`.
- Eenheid in de regeltekst voor gemeten regels komt uit `shopping.unitG/Kg/Ml/L` (g, kg, ml, l).

## Status van het draaien
- `npx tsc --noEmit`: enige resterende fouten komen door de ontbrekende module `src/lib/shoppingList` (testnaad, door de ontwikkelaar te maken) en de impliciete `any` die daaruit volgt.
- `npx playwright test --list`, `npx vitest run` en de databanktests heb ik in deze sessie niet kunnen starten (commando's vereisten toestemming), dus de tests zijn nog niet uitgevoerd. Ze falen tot de ontwikkelaar klaar is.
