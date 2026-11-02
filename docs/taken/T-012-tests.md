# T-012 — tests

Nieuw: `tests/unit/photoType.test.ts`, `tests/unit/photoResize.test.ts`, `tests/unit/photos.test.ts`, `tests/db/recipe-photos.test.ts`, `tests/e2e/recipe-photos.spec.ts`, `tests/helpers/photos.ts`.
Uitgebreid: `tests/helpers/supabase-admin.ts` (`PHOTO_BUCKET`, `fakeJpegBytes`, `uploadTestPhoto`, `listRecipeFiles`, `removeRecipeFiles`; `deleteTestUser` wist eerst de fotomappen via de Storage-API). `overrides.photos` (en `id`) gaat al door `insertRecipe`.

## Gedekt
- Crit. 1: unit (`addPhotos`, `validateRecipe` → `photosTooMany`), db (0/3 ok, 4 → `23514` bij insert en update, default `[]`), interface (3+1, 4 tegelijk, verwijderen en weer toevoegen).
- Crit. 2: unit `detectImageType` (JPEG, PNG, WebP, alle HEIC-merken, `mif1`/`msf1` met en zonder HEIC-merk, AVIF/GIF/PDF/tekst/leeg → `null`); interface JPEG/PNG/WebP, `fake.jpg`, GIF en kapotte PNG; bucket weigert `image/png`.
- Crit. 3: unit `fitWithin`, `nextAttempt`, constanten; interface met echte omzetting (4000×3000 → 1280×960, portret, 800×600 niet vergroot, ruis 1280² ≤ 512.000 bytes, EXIF-oriëntatie 6); bucket 512.000 ok / 512.001 geweigerd.
- Crit. 4: twee knoppen ≥ 44 px, `capture="environment"`, `accept` en `multiple`, `setInputFiles` op beide.
- Crit. 5: unit (eerste = hoofd, `setMain`, verwijderen schuift door, herordenen laat hoofd staan); db (twee `main` → `23514`, geen `main` → eerste); interface (label, `aria-pressed`, overzicht toont gekozen hoofdfoto, placeholder `aria-hidden`, detail-`alt`).
- Crit. 6: unit `moveItem`/`removeItem`/dirty; interface omhoog, verwijderen (bestand weg), weggooien (bestand blijft), "gewijzigd" bij toevoegen/verwijderen/herordenen, recept verwijderen door auteur en door beheerder (map leeg); db/opslag: vreemde gebruiker kan niet verwijderen, auteur en beheerder wel, geen `upsert`, niemand kan in andermans bestaande receptmap uploaden.
- Crit. 7: bucket privé (via SQL), anoniem `download`/`createSignedUrl` fout, publieke URL ≠ 200, andere gebruiker kan wel lezen, anonieme `select` op `recipes.photos` leeg; interface: na afmelden geen storage-URL in het DOM.
- Extra's: pad- en vormcontrole van `photos` (extra sleutels, vreemde map, dubbel pad, onbestaand bestand, bestand van een ander), 360 px zonder horizontaal scrollen (formulier, overzicht, detail), verbindingsfout houdt formulier en foto's.

## Niet gedekt
- **HEIC in de interface:** `photo.heic` kan ik niet maken (geen encoder, en ik kon geen scripts draaien). De test slaat zichzelf over (`test.skip`) tot iemand een kleine echte `tests/fixtures/photos/photo.heic` toevoegt. De HEIC-herkenning zelf is wel unit-getest.
- **Fixturebestanden:** de brief noemt `tests/fixtures/photos/` en `scripts/make-photo-fixtures.mjs`. Ik maak de beelden tijdens de test (canvas in Chromium, ruis en EXIF in `tests/helpers/photos.ts`), zodat er niets groots wordt vastgelegd. Alleen `photo.heic` blijft een los bestand.
- **"Foto verwerken…" (`role="status"`), "Opslaan uitgeschakeld tijdens verwerken":** niet betrouwbaar te timen met kleine beelden.
- **"Deze foto kon niet verwerkt worden." (ladder faalt):** niet af te dwingen in een echte browser met een beeld dat wél decodeert; de ladder zelf is unit-getest (eindigt altijd).
- **Opruimen na mislukte rij en "Opnieuw proberen" zonder dubbele upload:** deels gedekt na review (zie "Na review"). Opruimen na een echte serverweigering blijft ongetest.

## Na review (bevindingen 1 en 2)
- Bevinding 1: e2e-test in `recipe-photos.spec.ts` ("the insert is stored but its answer is lost"): `route.fetch()` + `route.abort()` op de `insert`, daarna "Opnieuw proberen" moet slagen, 2 foto's en 2 bestanden blijven. Faalt tot de ontwikkelaar de opruiming/`23505`-afhandeling herstelt.
- Bevinding 2, buildtest: `tests/build/precache.test.ts` (HEIC-chunk bestaat apart en staat niet in `dist/sw.js`).
- Bevinding 2, fixture: nog steeds niet gedekt. Ik kan geen echte HEIC maken of downloaden (geen encoder, geen netwerk, geen voorbeeldbestand in de repo of `node_modules`). `photo.heic` moet met de hand worden toegevoegd; de test blijft tot dan `skip`. Eigenaar: voeg een klein echt HEIC-bestand toe aan `tests/fixtures/photos/photo.heic`.
- **Foto-URL niet meer in het DOM na afmelden:** getest op `img[src*=storage]`; de levensduur van een getekende URL (risico in de brief) niet.
- **Aparte tests voor i18n en `no-hardcoded-styles`:** de bestaande generieke tests dekken nieuwe sleutels en stijlen.
- `tests/build/no-secrets.test.ts` is niet aangepast; die slaagt of faalt vanzelf met de HEIC-bundel.

## Aannames over vormen (de brief legt ze niet vast; ontwikkelaar mag afwijken, dan pas ik de test aan)
- `fitWithin(w, h, max)` → `{ width, height }` (of `[w, h]`).
- `nextAttempt(quality, scale)` → `{ quality, scale }`, of `null` als de ladder op is. Start is `(0.85, 1)`; daarna 0,75 → 0,65 → 0,55, daarna `scale × 0,85`.
- `addPhotos(list, incoming)` met `incoming: PhotoDraft[]` → `{ photos, rejected }`; `setMain(list, i)` en `removePhoto(list, i)` → nieuwe lijst. Alle in `src/lib/recipe.ts`, samen met `MAX_PHOTOS` en `PhotoDraft`.
- `RecipeDraft.photos` optioneel; `errors.photos`.
- De UI-markup: een foto heeft een `<img>` in de `role="group"` "Foto's"; knoppen heten "Foto n omhoog/omlaag/verwijderen/als hoofdfoto"; de meldingen staan in een `role="alert"` binnen die groep; de camera-`input` is `input[type=file][capture]`, de galerij-`input` is de andere. De hoofdfoto-knop heeft `aria-pressed`; het label "Hoofdfoto" staat één keer in de groep (op de hoofdfoto zelf, de knop heeft de naam "Foto n als hoofdfoto").
- Overzichtsitem is een `listitem` met de titel (zoals in `recipe-equipment.spec.ts`).

## Opmerkingen
- `npx tsc --noEmit` faalt nu alleen op ontbrekende testnaden: `src/lib/photoType.ts`, `src/lib/photoResize.ts` en de nieuwe exports in `src/lib/recipe.ts` (`addPhotos`, `setMain`, `removePhoto`, `MAX_PHOTOS`, `PhotoDraft`, `photos` op `RecipeDraft`/`RecipeErrors`). Geen fouten in de e2e-, db- of helperbestanden.
- Ik kon geen tests uitvoeren (alleen de typecheck); de db- en e2e-tests zijn dus niet tegen een draaiende Supabase geprobeerd.
- Tests mogen falen tot de ontwikkelaar klaar is (geen bestaand-gedragstaak).
