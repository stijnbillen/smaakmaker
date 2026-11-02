# T-008 — tests

Bestanden: `tests/unit/recipe.test.ts` (uitgebreid), `tests/db/recipe-source-note.test.ts`, `tests/e2e/recipe-source-note.spec.ts`, `tests/helpers/recipe-form.ts` (`source`/`note` optioneel, `sourceField`, `noteField`).

## Gedekt
- Crit. 1: unit (grenzen, code points, trim, `toRow`, `draftFromRecord`, `emptyDraft`, `pruneDraft`, `isDirty`); db (null-default, grenzen 200/1000, 201/1001 met checknamen, trim, whitespace → null, update door auteur, andere gebruiker en beheerder 0 rijen); e2e (melding + `aria-invalid` + geen POST, geen `maxlength`, grenswaarden, leeg, bewerken + weggooi-vraag, getrimd opgeslagen).
- Crit. 2: e2e (leeg, alleen opmerking, alleen bron, `null`-rij zonder fout).
- Crit. 3: unit `sourceLink`; e2e (`href`/`target`/`rel`, nieuw tabblad met afgevangen route, gewone tekst voor `Oma`, `javascript:`, `www.`, tekst vóór URL; lange URL op 360 px, tikhoogte ≥ 44 px).
- Extra: opmerking met regeleinden (`pre-line`) en letterlijke HTML.

## Niet gedekt
- Visueel verborgen "opent in een nieuw tabblad" en `.visually-hidden`: geen criterium, alleen plan.
- i18n-test en stijlscanner: bestaande tests dekken nl.json en tokens automatisch.
- Bestaande specs via formulierhulp: blijven ongewijzigd draaien.
- Tikdoeltest via `tests/e2e/routes.ts`: bestaand; hier alleen een eigen hoogtecontrole op de link.

## Testnaad / verwachtingen voor de ontwikkelaar
- `src/lib/recipe.ts` moet `sourceLink` exporteren (nu enige `tsc`-fout, verwacht).
- Foutcodes in `validateRecipe`: `errors.source = 'sourceTooLong'`, `errors.note = 'noteTooLong'` (zelfde patroon als `servingsInvalid`).
- `sourceLink` geeft de getrimde tekst terug (originele hoofdletters behouden).
- Detailpagina: `data-testid="recipe-source"` (bevat de `<a>` of tekst) en `"recipe-note"` (bevat tekst, `white-space: pre-line`); kop "Opmerking" als heading; label "Bron" als tekst.
- Formulier: velden met toegankelijke naam `form.source` / `form.note` (exact), meldingen via `aria-describedby`.
