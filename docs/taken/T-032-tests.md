# T-032 — tests (R-033)

Bestanden: `tests/db/unit-measure.test.ts`, `tests/unit/unitMeasure.test.ts`, `tests/e2e/unit-measure.spec.ts`; helpers in `tests/helpers/recipe-form.ts` uitgebreid (`text`, `measureQuestion`, `measureChoice`, `factorField`, `factorSave`, `googleLink`, `startNewUnit`); bestaande test "a new unit asks … Ja creates a unit" in `ingredient-picker.spec.ts` aangepast (na "Ja" volgt nu "Geen van beide").

Controle: `npx tsc --noEmit` geeft alleen `Cannot find module '../../src/lib/unitMeasure'` (testnaad voor de ontwikkelaar). `playwright --list` en `vitest run` kon ik in deze sessie niet draaien (commando's vragen goedkeuring); nog niet uitgevoerd.

## Wat de ontwikkelaar moet leveren (testnaden en namen)
- `src/lib/unitMeasure.ts`: `parseFactor(text): number | null` (null = ongeldig), `googleSearchUrl(unit, 'ml' | 'g', 'nl' | 'fr'): string`.
- `validateCatalogItem` krijgt optioneel `measure` en `factor` en geeft `'invalidFactor'` bij een slechte combinatie.
- Migratiebestand met `unit_measure` in de naam; `measure text not null default 'none'`; raakt `recipes` niet.
- `admin_update_catalog(p_kind, p_id, p_name_nl, p_name_fr, p_synonyms, p_measure, p_factor)` en `admin_list_catalog` met `measure`, `factor`. `add_unit(p_name, p_lang, p_measure, p_factor)`.
- Tekstsleutels (nl.json en fr.json): `form.measureQuestion` ({name}), `form.measureVolume|Weight|None|Unknown`, `form.factorQuestionVolume|Weight` ({name}), `form.factorInvalid`, `form.factorBack`, `form.googleLink`, `form.googleQueryVolume|Weight` ({name}), `catalogAdmin.measure`, `catalogAdmin.measureVolume|Weight|None`, `catalogAdmin.factor`, `catalogAdmin.error.factor`.
- Markup die de e2e-tests aannemen: de soortvraag is een `role="group"` met als naam de ingevulde `form.measureQuestion`; de factorstap is een `group` rond het factorveld (textbox met naam = ingevulde `form.factorQuestion…`, `inputmode="decimal"`), met knoppen `form.save` en `form.factorBack` en de link; de fout heeft `aria-invalid` + `aria-describedby` naar een element met `form.factorInvalid`. Google-link: `<a target="_blank" rel="noopener noreferrer">` met naam `form.googleLink`. Beheer: keuze als radio of knop (naam `catalogAdmin.measure…`), factorveld als textbox met naam `catalogAdmin.factor` (alleen bij eenheid en volume/gewicht), `aria-invalid` bij een slechte waarde. Soortknoppen ≥ 44 px hoog.

## Gedekt
1. Check-constraint: alle zeven weigeringen (`23514`) plus onbekende soort; aanvaarde grenzen; geen stille afronding; update-pad; `add_unit` (4 par.) met geldig/ongeldig; oude `add_unit` → none; bestaande sleutel laat soort ongemoeid (db-test).
2. Startlijst: 8 sleutels + de 22 overige met `none`/null (db-test).
3. Bestaande gegevens: gedeeltelijk — een eenheid via de oude `add_unit` is `none`/null en een receptregel blijft gelijk; de migratie-tekst wordt statisch gecontroleerd (default `'none'`, geen `recipes`-wijziging).
4. Soortvraag na "Ja" met vier knoppen, nog niets in de databank, ≥ 44 px, geen horizontaal scrollen (e2e, NL en FR).
5. `parseFactor` (unit, alle waarden uit de brief); e2e: ongeldige waarden → `aria-invalid`/`aria-describedby`, niets opgeslagen; "250" → volume/250 en regel gekoppeld (`unit_id`, detailpagina toont eenheid); gewicht; "Terug".
6. Geen van beide en Ik weet het niet → `none`/null, regel gekoppeld.
7. `googleSearchUrl` (NL, FR, codering); e2e: `target`, `rel`, `href` bij Ik-weet-het-niet, volume, gewicht; geen verzoek naar `google.` zonder tik.
8. "Nee": geen soortvraag, niets in de databank; de bestaande R-020-tests blijven bestaan.
9. Beheer: `admin_update_catalog` (admin ok, `23514`, gewone gebruiker `42501`, ingrediënt met soort `22023`, `p_measure` null = ongewijzigd), directe update door gewone gebruiker verandert niets, `admin_list_catalog` met kolommen, `validateCatalogItem`; e2e als beheerder met eigen eenheid (Volume + 0 → melding, 250 → opgeslagen, na herladen zichtbaar).
10. e2e: "2 el olie" bij 8 porties → "4 el", niet "60"/"ml"; gekoppelde "el" blijft "el".
11. Sleutelcontrole voor alle nieuwe sleutels in beide bestanden (unit); soortvraag, keuzes en factorvraag in het Frans (e2e). De bestaande i18n-sleuteltest dekt pariteit.

## Niet of beperkt gedekt
- Crit. 3 echte migratie-run met bestaande data: niet mogelijk zonder de migratie in een tussentoestand te draaien; vervangen door de gedeeltelijke controle hierboven.
- Crit. 9 e2e gebruikt een eigen `zq…`-eenheid in plaats van "kop", om de startlijst niet te wijzigen.
- Een klik op de Google-link zelf (opent extern tabblad) wordt bewust niet getest: geen netwerk.
- Crit. 10 "R-004 groottelimiet": alleen via de bestaande tests, geen nieuwe.
- Tests nog niet uitgevoerd (zie boven).
