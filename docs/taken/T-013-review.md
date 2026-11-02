# T-013 — review ronde 2 (R-004 grootte)

`CLAUDE.md` is niet gewijzigd. Geen kernbeslissing geschonden:
- de grens zit in een `after`-trigger in de databank, zonder kolomlijst;
- de meetfuncties zijn `security definer` met een vast `search_path`;
- `recipe_photo_bytes` is niet meer uitvoerbaar voor `authenticated` (bevinding 4 van ronde 1 is verwerkt);
- de teksten staan in `nl.json` en de stijl gebruikt tokens;
- `setPhotoSize` loopt via `sql()` met `assertLocal`.

De migratie is nieuw en additief. In `VRAGEN.md` staat geen blok voor T-013. `README.md` en `.env.example` zijn untracked, maar horen niet bij deze taak.

De bevindingen uit ronde 1 zijn verwerkt:
1. De e2e-test gebruikt nu een ruis-JPEG en `toBeGreaterThan`. Die faalt als de foto niet meetelt.
2. De melding verdwijnt zodra de grootte onder de grens zakt.
3. Een opgeslagen pad zonder grootte telt na de opzoeking als `PHOTO_MAX_BYTES`.
4. `revoke ... from authenticated`.

## Bevindingen

### 1. src/components/RecipeForm.tsx:204 — laag — ontwikkelaar
**Probleem:** het commentaar zegt dat een weigering door de databank blijft staan "until the next save". De `useEffect` maakt `sizeProblem` echter ook leeg na een weigering door de server, zodra `usedBytes` verandert. Dat gebeurt bij elke toetsaanslag, want de client denkt dan al onder de grens te zitten. De melding verdwijnt dus terwijl de databank het recept nog altijd zou weigeren. Er gaan geen gegevens verloren: de volgende "Opslaan" toont de melding opnieuw.
**Voorstel:** onthoud de bron van het probleem (`client` of `server`) en maak in de effect alleen een probleem van de client leeg. Of pas het commentaar aan het gedrag aan.

### 2. tests/db/recipe-size.test.ts:301 — laag — tester
**Probleem:** de test controleert alleen dat `anon` `recipe_photo_bytes` niet mag uitvoeren. Na de wijziging van ronde 1 mag ook `authenticated` dat niet meer, zodat `/rpc` niet verklapt of een bestand bestaat. Dat gedrag is niet gedekt, dus een latere `grant` blijft onopgemerkt.
**Voorstel:** voeg `has_function_privilege('authenticated', 'public.recipe_photo_bytes(jsonb)', 'execute') = false` toe. Of roep de functie aan via `user.client.rpc(...)` en verwacht een fout.

## Geen bevinding
- Criteria 1 tot 6 zijn gedekt door unit-, databank- en e2e-tests die falen als de code ontbreekt of fout is.
- Het brief noemt 1.363.149 → "1,3", maar de test verwacht "1,4". Dat volgt de afrondregel van het brief zelf. R-004 noemt het getal alleen als voorbeeld, dus er is geen conflict met de requirement.
- `report`/`resolve` zijn stabiel (`useCallback`), dus de effect in `EditRecipePage` loopt niet in een lus.
