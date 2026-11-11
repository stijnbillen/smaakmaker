# T-033 — Review (R-030 Weekmenu)

Beoordeeld: de migratie `20261111100000_week_menu.sql`, `src/lib/weekMenu.ts`, `WeekMenuButton.tsx`, `WeekMenuPage.tsx`, de wijzigingen in App, BottomNav, recipes.ts/recipe.ts, RecipeDetailPage, CSS/tokens en i18n, en de tests (db, unit, e2e, navigation, routes, i18n).

`CLAUDE.md` is niet gewijzigd en er wordt geen kernbeslissing geschonden:
- De rechten staan in RLS en kolomrechten, zonder uitzondering voor de beheerder.
- De limiet en de standaardporties zitten in de databank.
- De receptrij en de limiet van 2 MB worden niet geraakt.
- Alle teksten staan in beide json-bestanden, en `--font-size-nav` is een token.

Er is geen scope bijgekomen die niet in de taak hoort.

## Bevindingen

1. **src/pages/WeekMenuPage.tsx:41-44** — laag — ontwikkelaar
   - **Probleem:** bij een laadfout die geen verbindingsfout is (bv. 500 of 403), gaat `failed` op true, maar `items` blijft `null`. `ListState` toont dan voor altijd de spinner "Weekmenu laden…", naast de foutmelding. Er is geen knop om opnieuw te proberen.
   - **Voorstel:** zet bij `failed` en `items === null` geen laadtoestand. Toon in de plaats alleen de melding, eventueel met een knop om opnieuw te laden.

2. **src/pages/WeekMenuPage.tsx:153-159** — laag — ontwikkelaar
   - **Probleem:** de tabs zijn `Link role="tab"` binnen een `role="tablist"`, maar er is geen `role="tabpanel"` met `aria-labelledby`. Het toetsenbordgedrag van een tablist (pijltjes) ontbreekt ook. Een schermlezer kondigt dus tabs aan die zich niet als tabs gedragen.
   - **Voorstel:** wikkel de inhoud in een `role="tabpanel"` met `aria-labelledby` naar de actieve tab. Een alternatief is navigatielinks met `aria-current="page"` in plaats van de tab-rollen. Daarvoor moet de tester de e2e-test aanpassen.

3. **tests/db/weekMenu.test.ts:121-126** — laag — tester
   - **Probleem:** de taakbrief vraagt een *weigering* voor `anon` op `select` en `delete`. De test aanvaardt ook een geslaagde aanroep met 0 rijen. Komt er per ongeluk een `grant select` voor `anon` bij, dan blijft de test groen. De RLS-policies zijn alleen `to authenticated`, dus er lekt dan niets, maar de kolomrechten worden niet echt gecontroleerd.
   - **Voorstel:** verwacht `error.code === '42501'` voor `select` en `delete` door `anon`. De migratie doet `revoke all ... from anon`, dus dat is het verwachte gedrag.

4. **supabase/migrations/20261111100000_week_menu.sql:331-340 / criterium 8** — laag — ontwikkelaar (T-034)
   - **Probleem:** "Leegmaken wist ook de boodschappenlijst" is nu alleen voor de menurijen getest. Het criterium is pas gehaald als T-034 zijn tabellen aan `clear_week_menu()` toevoegt. Een eigen leegmaakroute in T-034 zou het criterium breken.
   - **Voorstel:** neem in de taakbrief van T-034 uitdrukkelijk op dat `clear_week_menu()` wordt uitgebreid, en dat de db-test van crit. 8 dan ook de rijen van de boodschappenlijst op 0 controleert.

5. **src/components/WeekMenuButton.tsx:65-68** — laag — ontwikkelaar
   - **Probleem:** het plan vroeg "laatste wens telt", zoals bij `FavoriteButton`. De bouwer koos ervoor om tikken te negeren zolang een aanroep loopt. Die keuze staat met reden in `docs/beslissingen.md`, en ze houdt crit. 4 (dubbel tikken) correct. Het gevolg: bij een trage verbinding wordt een tik om het gerecht meteen weer te verwijderen stil genegeerd, zonder zichtbaar teken dat de knop bezig is.
   - **Voorstel:** geef de knop tijdens de aanroep `aria-busy="true"` of een zichtbare bezig-toestand, zodat de genegeerde tik verklaard is.

GOEDGEKEURD
