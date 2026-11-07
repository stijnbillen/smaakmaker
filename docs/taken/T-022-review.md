# T-022 — review (R-026: Frans in plaats van Engels)

Beoordeeld: werkkopie tegen `84f5bde` (bron, migraties, templates, config, tests, nieuwe bestanden `fr.json`, `tests/helpers/retired-lang.ts`, `tests/helpers/english-terms.ts`, `tests/unit/no-english.test.ts`).
`CLAUDE.md` is niet gewijzigd. Geen kernbeslissing geraakt: alle teksten staan in `nl.json`/`fr.json` met dezelfde sleutels, de taalkeuze blijft op het toestel, de migraties zijn rechtstreeks aangepast zoals crit. 3 toelaat (nog niet online).
Volgens `docs/loop-log.md` is de laatste build (10:17) geslaagd.

## Per criterium
1. `en.json` is weg, `fr.json` is volledig. Sleutels, lege waarden en plaatsaanduidingen worden getest, net als "niet gelijk aan Nederlands". Ik heb de vertaling nagelezen: correct Frans, Belgisch waar het uitmaakt (chicon, cassonade, fromage blanc, "c. à soupe"). Gehaald.
2. Taalcode alleen `nl|fr`, `detectLanguage` gaat bij fr naar Frans en anders naar Nederlands. Een opgeslagen "en" telt als geen keuze. Gedekt in unit (`language.test.ts`) en e2e (`language.spec.ts:147,170`), met controle op console- en paginafouten. De scan-test heeft negatieve controles. Gehaald.
3. `name_fr` staat in tabellen, grants, `add_*`, `catalog_suggest` en de clienttypes. De scan op `name_en`/`nameEn` is leeg. Gehaald.
4. Startlijst: ongeveer 160 ingrediënten en 29 eenheden met Franse namen, met alle voorbeelden uit R-018 (broccoli/brocoli met beide synoniemen). Gedekt in `tests/db/catalog.test.ts`. Gehaald.
5. De formaatlabels zijn "petite taille", "taille moyenne" en "grande taille", en "2 aardappel (groot)" blijft. Getest. Gehaald.
6. De mail toont eerst het Nederlandse blok en daarna het Franse blok met `lang="fr"`. Het onderwerp is `{nl} / {fr}`. Getal- en datumnotatie: komma in beide talen, `fr-BE`. Getest. Gehaald.
7. Tests draaien met "fr" en Franse termen, en een scan op Engelse catalogustermen. Gehaald.
8. `layout.spec.ts` loopt over nl en fr, en `ingredient-picker.spec.ts` toetst ook in het Frans op 360 px. Gehaald.

## Bevindingen

### 1. `build.log` (niet gevolgd bestand) — laag — ontwikkelaar
Probleem: er staat een losse `build.log` van 09:55 in de hoofdmap. Die toont "3 failed" van een run vóór de helperfix. Het bestand hoort niet bij de taak, en wie het later leest, kan denken dat de e2e-tests falen.
Voorstel: verwijderen en niet committen, of `build.log` aan `.gitignore` toevoegen.

### 2. `tests/unit/no-english.test.ts:6` — laag — tester
Probleem: in het Engelse commentaar staat Nederlands ("the Engelse naam kolom"). `CLAUDE.md` vraagt commentaar in het Engels.
Voorstel: "the English-name column".
