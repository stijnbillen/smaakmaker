# T-013 — tests (R-004 grootte)

Nieuwe taak: de tests mogen falen tot de ontwikkelaar klaar is. `npx tsc --noEmit` faalt nu alleen op ontbrekende testnaden:
- `src/lib/recipeSize.ts` bestaat nog niet;
- `PhotoDraft.bytes` bestaat nog niet;
- `draftFromRecord(record, sizes?)` heeft nog geen tweede parameter.

## Bestanden
- `tests/fixtures/recipe-size-cases.ts`: gedeelde gevallen, met de bytes met de hand uitgerekend.
- `tests/unit/recipeSize.test.ts` en `tests/unit/recipe-bytes.test.ts` (`isDirty` negeert `bytes`, `draftFromRecord` met groottemap).
- `tests/db/recipe-size.test.ts` (lokale Supabase, gewone gebruikersclient).
- `tests/e2e/recipe-size.spec.ts` (360 × 640).
- `tests/helpers/pg.ts`: `setPhotoSize(path, bytes|null)`, herexporteerd door `supabase-admin.ts`.

## Dekking
- **Criterium 1** (som):
  - unit: telgevallen, trim, lege rijen, getallen tellen niet, `recipeSizeBytes`;
  - db: dezelfde fixture tegen `recipe_text_bytes`, `recipe_photo_bytes` met 2 testfoto's, review verandert niets en een recept op de grens krijgt nog een review.
- **Criterium 2** (grens):
  - unit: `checkRecipeSize` op en boven de grens, tekst/foto's-regel;
  - db: insert en update op exact de grens aanvaard, +1 byte geeft `23514`/`recipe_too_large`/detail `photos`, `recipe_size_problem` met detail `text`;
  - e2e: melding zonder databankaanroep en daarna opslaan na een teken minder.
- **Criterium 3** (databank):
  - alle gevallen lopen via PostgREST met een gebruikerssessie;
  - getrimde titel, canonieke tagspelling, update van één kolom (`note`, `dish_tags`, `equipment`), bestand zonder `size` of zonder bestand = 512.000, `anon` mag de functie niet uitvoeren.
- **Criterium 4** (teller):
  - unit: `formatRecipeSize`;
  - e2e: 0,0 bij nieuw, tekst en foto toevoegen en weghalen, opgeslagen foto's uit de opslag, 360 px en geen live-regio, verbindingsfout bij de groottes.
- **Criterium 5** (geweigerde opslag):
  - db: rij ongewijzigd na weigering;
  - e2e: weigering door de client (niets geüpload of geschreven), weigering door de databank (melding, ingevuld formulier, oud recept, nieuw bestand weg), nieuw recept met onderschepte insert (lege map, daarna lukt opslaan).
- **Criterium 6** (nooit geweigerd):
  - db: alle maxima in 4-bytetekens, 3 foto's van 512.000;
  - unit: `checkRecipeSize(0, [])`.
- **i18n:** sleutelwaarden in de unit-test (`size.used`, `size.photosTooLarge`, `size.textTooLarge`).

## Niet gedekt
- **Foutkleur van de teller boven de grens** en `no-hardcoded-styles`: de bestaande stijltest scant alle `src/`, dus die dekt de stijl al. De kleur zelf toets ik niet, want dat is geen acceptatiecriterium.
- **`checkRecipeSize` met een tekst boven de grens in de db:** onmogelijk met geldige invoer. Alleen de pure SQL-functie wordt getest, zoals de brief voorschrijft.
- **Verbinding verloren tijdens het opruimen:** staat als bekende grens in de brief.

## Afwijking in de brief
Het criterium noemt `formatRecipeSize(1.363.149)` = "1,3 van 2 MB". 1.363.149 / 1.048.576 = 1,30000019 en de regel is "naar boven afronden", dus dat geeft "1,4". Ik testte:
- 1.363.148 → "1,3";
- 1.363.149 → "1,4" (de regel wint, ook nodig voor 2.097.153 → "2,1").

Wil de eigenaar echt "1,3" bij 1.363.149, dan moet de brief de regel of het voorbeeld aanpassen.

## Aannames over de API (de brief legt ze niet exact vast)
- `checkRecipeSize(text, photos[])` geeft de string `'ok' | 'photosTooLarge' | 'textTooLarge'`.
- `draftFromRecord(record, sizes?: Map<path, bytes>)`.
- De PostgREST-fout heeft `error.details === 'photos' | 'text'`.
- Formulier: `data-testid="recipe-size"` toont "…" tijdens het laden van de groottes. De melding heeft `role="alert"` en staat naast de bestaande "Opslaan mislukt." (`form.error`).
- De lijst van opgeslagen foto's wordt opgehaald via `storage/v1/object/list/…` (de e2e-test breekt dat verzoek af).

## Herstel: catalogus opruimen
`tests/db/recipe-size.test.ts` liet tags en gereedschap achter in de gedeelde catalogus (`Proeftag`, `Proefkenmerk`, `Pan`, `d00..`/`t00..`/`g00..`, `Crème<s>`, `T<ts>`, `G<ts>`). Dat brak `recipe-trait-tags.test.ts` en de Tab-check in `a11y.spec.ts`.
- `afterAll` verwijdert nu die namen uit `tags` en `equipment`, na het verwijderen van de gebruikers.
- Namen die al vóór de run in de catalogus stonden (vastgelegd in `beforeAll`) blijven staan.
- Het geteste gedrag is niet veranderd. `tsc --noEmit` is schoon; de dbtests heb ik hier niet kunnen draaien (geen toestemming voor vitest).

## Herstel review (bevinding 1)
E2E "adding a photo raises it" gebruikt nu 1280x1280 ruis-JPEG (noisyJpeg) en `toBeGreaterThan(textOnly)`; criterium 4 echt gedekt. Niet uitgevoerd in deze run. Bevindingen 2-4 horen bij de ontwikkelaar.
