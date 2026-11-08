# T-029 — Review (R-028)

Beoordeeld: werkmap tegen `c4b23c9`, met de nieuwe bestanden `src/lib/recipeSort.ts`, `src/lib/overviewFilters.ts`, `src/components/SortControl.tsx`, `tests/helpers/overview.ts`, `tests/unit/recipeSort.test.ts`, `tests/unit/overviewFilters.test.ts` en `tests/e2e/overview-filters.spec.ts`.

De blokkade waarmee de taak binnenkwam, geldt niet meer. De tester heeft de tests en de helper opnieuw geschreven (`T-029-tests.md`, herstelronde 2). De ontwikkelaar heeft de implementatie gemaakt. Volgens `docs/loop-log.md` is de build geslaagd.

`CLAUDE.md` is niet gewijzigd en geen enkele kernbeslissing wordt geschonden:
- geen migratie en geen wijziging aan RLS;
- teksten staan in `nl.json` en `fr.json` met dezelfde sleutels;
- identifiers en commentaar zijn Engels;
- CSS gebruikt tokens;
- tikdoel van ≥ 44 px via de globale regel `button { min-width/min-height: var(--tap-min) }`.

In `VRAGEN.md` staat geen blok voor T-029.

Elk acceptatiecriterium heeft een test die echt kan falen. Er zijn geen bevindingen met ernst hoog of middel.

## Bevindingen

1. **tests/e2e/overview-filters.spec.ts:105**: laag, voor de **tester**.
   - **Probleem:** crit. 1 vraagt dat het paneel ook dicht blijft als er filters in de URL staan, op het overzicht én bij de favorieten. De test met filters in de URL draait alleen op `/`.
   - **Voorstel:** maak er een lus over `['/', '/favorieten']` van, met het recept als favoriet.

2. **tests/e2e/overview-filters.spec.ts:316**: laag, voor de **tester**.
   - **Probleem:** crit. 8 (één rij op 360 px) wordt alleen getoetst met de kale knop "Filters"/"Filtres". Het breedste geval ontbreekt: Frans met "Filtres (6)" en "Temps de préparation" gekozen.
   - **Voorstel:** voeg één geval toe op `/?met=a&prep=15&totaal=60&soort=soep&kenmerk=winter&gerief=oven&sorteer=prep` in het Frans, met dezelfde controles op overlap en `scrollWidth ≤ 360`.

3. **tests/e2e/overview-filters.spec.ts:393**: laag, voor de **tester**.
   - **Probleem:** het plan (crit. 11) vraagt een e2e-test die toont dat een taalwissel opnieuw sorteert zonder nieuw verzoek. Die test ontbreekt, en dat staat ook in `T-029-tests.md`. De eis zelf ("in de taal van de lezer") is gedekt door de unit-test met `nl-BE` en `fr-BE` en door de e2e-test per taal.
   - **Voorstel:** laten zoals het is, tot er een taalwissel op het overzicht bestaat. Het gat blijft vermeld in het testverslag.

4. **src/components/RecipeBrowser.tsx:197**: laag, voor de **ontwikkelaar**.
   - **Probleem:** "Alles wissen" verschijnt alleen als de URL een filter bevat. Typ je tekst in "Met ingrediënten" zonder andere filters, dan ontbreekt de knop tot de pauze voorbij is (de zoekopdracht nog niet verstuurd). Dat valt binnen de eis ("filter of zoekopdracht actief"), maar kan even verwarren.
   - **Voorstel:** geen wijziging nodig. Eventueel later ook getypte tekst die nog wacht als actief tellen.
