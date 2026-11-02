# T-011 — tests

Nieuw: `tests/db/recipe-trait-tags.test.ts`, `tests/e2e/recipe-trait-tags.spec.ts`.
Uitgebreid: `tests/unit/tagFilter.test.ts`, `tests/unit/recipe.test.ts`, `tests/helpers/recipe-form.ts` (`tagGroup/tagButton/newTagField/addTagButton` met optionele groep, `pickTags`, `RecipeInput.traitTags`; `pickDishTags` blijft werken).

## Gedekt
- Crit. 1 startlijst (db: exact 9 trait-namen, dish behoudt 8, seed herhalen; e2e: groep "Kenmerken" met 9 knoppen los van "Soort gerecht").
- Crit. 1 nul of meer, rechten, hergebruik, lengtegrenzen, gelijktijdige inserts, zelfde naam in beide groepen, `snack` in trait als nieuwe rij, `42501` op `tags` met `kind = 'trait'`.
- Crit. 1 unit: `validateRecipe`/`toRow`/`draftFromRecord`/`emptyDraft`/dirty voor `traitTags`.
- Crit. 1 interface: opslaan, detailpagina (`recipe-trait-tags`, kop), bewerken, weggooien-vraag, "VEGETARISCH", groepen gescheiden, foutmelding per groep, Enter, geen hernoem/verwijder-knop.
- Crit. 2 unit (`parseTagFilter`, `toSearchParams`, `applyTagFilter`, `hasTagFilter`), db (twee `overlaps`), interface (A–D, "of" binnen groep, URL, herladen, snelle tikken, tijdfilter, "Niets gevonden.").
- Crit. 3 interface (E met spek + tag, F zonder tag) en unit (alleen `trait_tags`).
- Layout: tap targets, geen horizontale scroll met twee groepen, lange label op detailpagina.

## Niet in deze taak gedekt
- i18n-test voor `tags.trait` / `form.traitTagsHint` en `no-hardcoded-styles`: bestaande generieke tests (`i18n.test.ts`, `no-hardcoded-styles.test.ts`) dekken nieuwe sleutels/stijlen vanzelf; geen aparte test.
- "Bestaande R-010-tests blijven slagen": `tagFilter.test.ts` kreeg `trait: []` in de verwachte vormen (het type `TagFilter` krijgt een tweede sleutel); `recipe-tags.spec.ts` gebruikt al groep-gescopede hulpen.
- Hoofdletters in de URL (`?kenmerk=Vegetarisch`): open bevinding R-010, buiten dit criterium.

## Opmerkingen
- `npx tsc --noEmit` faalt nu alleen op `'trait' does not exist in type 'TagFilter'`: testnaad, de ontwikkelaar voegt `TagKind = 'dish' | 'trait'` toe (plan stap 5–6).
- Dish-startlijst in db-test: "onveranderd" is gecontroleerd als alle 8 één keer aanwezig en geen trait-naam in dish, omdat andere testbestanden parallel dish-tags aanmaken. De trait-lijst is wél exact (alleen deze taak maakt trait-tags; opruimen gaat op exacte naam via `fold_key`).
- Opruimen gebeurt nooit met `like`; de starttags blijven staan.
- Tests mogen falen tot de ontwikkelaar klaar is (geen bestaand-gedragstaak).

## Herstel (testfout)
- `recipe-trait-tags.spec.ts` "recipe without trait tags": heading-locator was substring-match en matchte de titel-h1 ("Zonder kenmerken ..."). Nu `exact: true`, plus eerst wachten op de titel-h1 zodat de afwezigheidscontroles niet leeg slagen. Getoetst gedrag ongewijzigd.
