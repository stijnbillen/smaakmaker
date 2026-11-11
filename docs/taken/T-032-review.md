# T-032 — review (R-033)

Bekeken: werkkopie tegen `8d7b949` (migratie `20261111100001_unit_measure.sql`, `unitMeasure.ts`, `CatalogField.tsx`, `CatalogItemEditor.tsx`, `catalogAdmin*.ts`, `recipes.ts`, `ingredientPicker.ts`, i18n, css, nieuwe en aangepaste tests). `CLAUDE.md`, `REQUIREMENTS.md` en `VRAGEN.md` zijn niet gewijzigd; in `VRAGEN.md` staat geen blok voor T-032.

Kernbeslissingen: geen schending.
- De limiet staat in de databank (check `units_measure_valid`).
- Er is geen update-recht voor `authenticated`; wijzigen kan alleen via `admin_update_catalog` met `is_admin()`.
- Er is een nieuwe migratie; oude migraties zijn niet aangepast.
- Waarden en code zijn Engels; de tekst voor de gebruiker staat in `nl.json` en `fr.json`.
- De Google-link is een gewone `<a>`, zonder fetch of preconnect.
- De 2 MB-limiet wordt niet geraakt.

## Bevindingen

### 1. tests/db/unit-measure.test.ts:205–232 — laag — tester
**Probleem:** De test van criterium 3 heet "kopje"-patroon, maar test geen migratie.
- Hij maakt een eenheid aan na de migratie, met een willekeurige naam.
- Hij zet in de receptregel de tekst `'kopje'`, die niet bij die eenheid hoort.
- Hij vergelijkt `ingredients` met de net ingevoegde waarde. Dat test alleen of jsonb heen en terug gaat.

Wat echt iets dekt, is de statische controle van de migratietekst (`default 'none'`, geen wijziging aan `recipes`). Omdat de migratie eenvoudig is, is het risico klein.

**Voorstel:**
- Volg het patroon van `bilingual-data.test.ts:208` (tussentoestand nabootsen). Doe dat in één transactie die je terugdraait:
  1. Verwijder de constraint en de kolommen.
  2. Voeg een eenheid "kopje" in, en een recept met een gekoppelde en een vrije eenheidsregel.
  3. Voer de `alter`- en `update`-statements uit het migratiebestand opnieuw uit.
  4. Controleer `none`/null op "kopje" en controleer dat `ingredients::text` gelijk is aan de waarde van vóór de migratie.
- Kan dat niet, hernoem de test dan zodat hij niet meer beweert dat hij de migratie test.

### 2. src/components/CatalogField.tsx:69 (FactorStep, knop `form.save`) — laag — ontwikkelaar
**Probleem:** In de factorstap staat een tweede knop "Opslaan" naast de "Opslaan" van het recept. Een schermlezer (en een gebruiker die snel kijkt) ziet twee gelijke knopnamen. De ene bewaart de eenheid, de andere het recept. Er gaat geen data verloren: opslaan van het recept blokkeert zolang de vraag open staat.

**Voorstel:** Geef de knop een eigen sleutel, bv. `form.factorSave` = "Eenheid opslaan" / "Enregistrer l'unité". Pas daarna de helper `factorSave` in `tests/helpers/recipe-form.ts` aan; die vraagt nu `form.save`.

### 3. tests/e2e/unit-measure.spec.ts:306–321 tegenover docs/taken/T-032.md crit. 10 — laag — tester
**Probleem:** De opdracht verwacht dat "2 el olie" bij 8 porties "4 el olie" wordt. Dat klopt alleen als het recept 4 porties heeft. De test zet 2 porties en verwacht dus terecht "8 el". De test zelf is juist; de opdracht en de test spreken elkaar wel tegen.

**Voorstel:** Vermeld in `T-032-tests.md` dat de verwachting is aangepast (2 → 8 porties = ×4 = "8 el").

GOEDGEKEURD
