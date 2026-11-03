# T-012 — review (ronde 3)

Bekeken: de werkkopie tegen `503aeb6`, met staged, unstaged en nieuwe bestanden. `CLAUDE.md` en `REQUIREMENTS.md` zijn niet gewijzigd. `VRAGEN.md` heeft geen blok voor T-012. De build is volgens `docs/loop-log.md` geslaagd (16:04).

## Herstel uit ronde 2

| # | Bevinding | Toestand |
|---|---|---|
| A | HEIC zonder werkende test | **Hersteld.** `tests/fixtures/photos/photo.heic` is een echt HEIC-bestand (kop `ftypheic`, merken `mif1 heic miaf MiHB`, 181 KB). De test `HEIC is accepted and decoded` (`tests/e2e/recipe-photos.spec.ts:142-147`) is niet meer `skip`. `heicFixture()` gooit een fout als het bestand ontbreekt. Een decodeerfout zou `notAPhoto` geven en 0 voorbeelden, dus `expectCount(page, 1)` bewijst dat het decoderen lukt. |
| B | Een ontbrekend bestand blokkeert elke bewerking | **Hersteld in de code** (`supabase/migrations/20261102190000_recipe_photos.sql:122-134`): paden uit `old.photos` worden niet opnieuw gecontroleerd. Andermans bestanden blijven uitgesloten, want het pad moet in de map van het eigen recept-id staan (`recipe_photos_valid`). Er is geen test. Zie bevinding 1. |
| C | Toegankelijke naam ≠ zichtbare tekst | Open (laag). De brief legt de naam "Foto n als hoofdfoto" zelf vast. Zie bevinding 2. |

## Bevindingen

### 1. De nieuwe tak van de trigger is niet getest
- **Bestand:** `tests/db/recipe-photos.test.ts` (ontbrekend geval), `supabase/migrations/20261102190000_recipe_photos.sql:123-125`
- **Ernst:** laag
- **Rol:** tester
- **Probleem:** Het gedrag "een opgeslagen pad waarvan het bestand verdwenen is, blokkeert een update niet" is nieuw, maar geen test dekt het. Ook niet gedekt: een nieuw pad naast een bestaand pad wordt nog steeds gecontroleerd.
- **Voorstel:** Voeg een databanktest toe. Maak een recept met een foto en verwijder het bestand met de service-client. Een `update` van de titel (met dezelfde `photos`) slaagt dan. Een `update` die er een niet-bestaand pad bij zet, geeft `23514`.

### 2. De toegankelijke naam bevat de zichtbare tekst niet (blijft open)
- **Bestand:** `src/components/PhotoPicker.tsx:152-160`, `src/i18n/nl.json` (`photos.asMain`)
- **Ernst:** laag
- **Rol:** ontwikkelaar en tester
- **Probleem:** De knop toont "Maak hoofdfoto" maar heet "Foto 2 als hoofdfoto". Dat botst met WCAG 2.5.3 (label in name). De brief schrijft deze naam zelf voor, dus dit is geen afwijking van de taak.
- **Voorstel:** Neem dit later mee, bv. als "Maak foto 2 hoofdfoto". Dan passen `nl.json` en `photoMain` in `tests/helpers/photos.ts` tegelijk aan.

### 3. Verouderde bouwnotitie over de HEIC-fixture
- **Bestand:** `docs/beslissingen.md:255`
- **Ernst:** laag
- **Rol:** ontwikkelaar
- **Probleem:** De notitie zegt nog dat `photo.heic` ontbreekt en dat de test zichzelf overslaat. Beide kloppen niet meer. Ook de herkomst en de licentie van het bestand staan nergens.
- **Voorstel:** Vervang de regel door de herkomst van `photo.heic` (bron, licentie of "eigen foto van de eigenaar").

### 4. Staged `base.css` is kapot, alleen de werkkopie is juist
- **Bestand:** `src/styles/base.css:784-801`
- **Ernst:** laag
- **Rol:** ontwikkelaar
- **Probleem:** In de staged versie staat `.photo-add {` midden in het blok `.review-actions {`, een overblijfsel van de samenvoeging met T-016. De unstaged wijziging herstelt dat. Wordt alleen de index gecommit, dan breekt de opmaak van de reviews en van de foto's.
- **Voorstel:** Zorg dat de werkkopie van `base.css` mee in de commit gaat (`git add`). Daarna is er niets meer te doen.
