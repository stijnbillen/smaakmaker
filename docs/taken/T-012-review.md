# T-012 — review (ronde 2)

Bekeken: de werkkopie tegen `8868e5c`, met de gewijzigde en de nieuwe bestanden. `CLAUDE.md` is niet gewijzigd. `VRAGEN.md` heeft geen blok voor T-012.

## Herstel uit ronde 1

| # | Bevinding | Toestand |
|---|---|---|
| 1 | Opruimen na verbindingsverlies | **Hersteld.** `discardAfterFailure` (`src/lib/recipes.ts:146-150`) ruimt alleen op na een echt antwoord van de server. Een `23505` op het eigen id loopt door als update (`recipes.ts:130-133`). De e2e-test "the insert is stored but its answer is lost" dekt dit echt: `route.fetch()` en daarna `abort`, met `postgrest` status 0. |
| 2 | HEIC niet van begin tot eind getest | **Deels.** De buildtest `tests/build/precache.test.ts` bewijst dat de chunk apart staat en buiten de precache valt. De fixture `tests/fixtures/photos/photo.heic` ontbreekt nog, dus de test van de interface blijft `skip`. Zie bevinding A. |
| 3 | Een ontbrekend bestand blokkeert elke bewerking | Open (laag). Zie bevinding B. |
| 4 | Fotovak leeg als het tekenen mislukt | **Hersteld** (`RecipeListPage.tsx:157`, `!src`). |
| 5 | De hint spreekt de losse hoofdfoto tegen | **Hersteld** (`nl.json:153`). |
| 6 | Wees-bestand na een gedeeltelijke upload | **Hersteld** (`removeUnused`, `recipes.ts:153-157`). Het wordt na een geslaagde insert en update aangeroepen. |
| 7 | Toegankelijke naam is niet gelijk aan de zichtbare tekst | Open (laag). Zie bevinding C. |
| 8 | Scope: `README.md`, `.env.example` | Vermeld in `docs/beslissingen.md`. Aanvaardbaar. |

## Bevindingen

### A. Criterium 2 (HEIC) heeft geen werkende test; daarvoor moet de eigenaar iets doen
- **Bestand:** `tests/e2e/recipe-photos.spec.ts:141-148`, ontbrekend `tests/fixtures/photos/photo.heic`
- **Ernst:** middel
- **Rol:** eigenaar, daarna tester
- **Probleem:** De requirement eist dat HEIC aanvaard wordt. Alleen de herkenning van de magische bytes is getest. Het decoderen via `heic-to` (lazy `import()`, `type: 'bitmap'`) is nooit uitgevoerd. De enige test die dat zou doen, slaat zichzelf over, en een overgeslagen test telt niet als dekking. De tester heeft gemeld dat er geen encoder en geen netwerk is om een echte HEIC te maken. Deze bevinding raakt dus niet op te lossen binnen de rollen van ontwikkelaar en tester.
- **Voorstel:** de eigenaar voegt een klein, vrij bruikbaar HEIC-bestand toe (bv. een voorbeeld van libheif of een eigen iPhone-foto van enkele tientallen KB) als `tests/fixtures/photos/photo.heic`. Daarna maakt de tester de test verplicht: weg met `test.skip`, en een ontbrekend bestand laat de test falen. Het alternatief is dat de eigenaar uitdrukkelijk aanvaardt dat HEIC voorlopig zonder test van begin tot eind blijft.

### B. Een ontbrekend bestand blokkeert elke bewerking van het recept (blijft open)
- **Bestand:** `supabase/migrations/20261102190000_recipe_photos.sql:117-128`, `src/lib/recipes.ts:173`
- **Ernst:** laag
- **Rol:** ontwikkelaar
- **Probleem:** De trigger controleert bij elke update alle paden, en de client stuurt `photos` altijd mee. Verdwijnt een bestand buiten de app om, dan kan de auteur zelfs de titel niet meer wijzigen. Hij krijgt dan alleen een algemene foutmelding.
- **Voorstel:** controleer alleen de paden die niet in `old.photos` stonden. Dat kan met een nieuwe migratie, of in deze migratie zolang ze nog niet in de cloud is uitgevoerd.

### C. De toegankelijke naam bevat de zichtbare tekst niet (blijft open)
- **Bestand:** `src/components/PhotoPicker.tsx:155-163`, `src/i18n/nl.json:158`
- **Ernst:** laag
- **Rol:** ontwikkelaar en tester (de naam in de test)
- **Probleem:** De knop toont "Maak hoofdfoto" maar heet "Foto 2 als hoofdfoto". Dat schendt WCAG 2.5.3 (label in name).
- **Voorstel:** noem de knop bv. "Maak foto 2 hoofdfoto" en pas de test aan.
