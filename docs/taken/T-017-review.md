# T-017 — Review (R-014 Favorieten), ronde 2

Bekeken: werkmap tegen `c0f0bdf`. Dat omvat de migratie `20261103130000_favorites.sql`, `favorites.ts`, `FavoriteButton.tsx`, `RecipeBrowser.tsx`, de pagina's, de css, `nl.json` en drie testbestanden.

- `CLAUDE.md` is niet gewijzigd.
- Er is geen kernbeslissing geschonden:
  - De rechten staan in RLS met `user_id = auth.uid()`. Insert mag alleen op `recipe_id`, en er is geen update.
  - `is_favorite` is een berekend veld. De 2 MB-limiet en de update-regels van `recipes` blijven dus ongemoeid.
  - De teksten staan in `nl.json`. Kleur en afstand komen uit tokens.
- `VRAGEN.md` heeft geen blok voor T-017.

`search_recipes` is opnieuw aangemaakt met dezelfde signatuur. De body is gelijk, op de extra kolom `is_favorite` na. De grants zijn opnieuw gezet. Alle embeds van `profiles` vanuit `recipes` gebruiken nu de hint `recipes_author_profile_fkey`. `reviewsApi.ts:28` embedt `profiles` vanuit `reviews`; dat pad verandert niet door `favorites`.

## Bevindingen uit ronde 1

| Bevinding | Status |
|---|---|
| 1. Race bij reload | Opgelost. `favorites.spec.ts:85`, `106`, `154`, `317` en `338` wachten nu op het POST- of DELETE-antwoord vóór `reload`, `goBack` of de databankcontrole. |
| 3. Tokencommentaar | Opgelost (`tokens.css:73-74`). |
| 4. `entries` over gebruikers heen | Opgelost. De sleutel is nu `userId:recipeId` (`FavoriteButton.tsx:52`) en dat staat in `docs/beslissingen.md`. |
| 2 en 5 | Nog open, beide laag (zie hieronder). |

Acceptatiecriteria 1 tot 6 zijn gedekt door een databanktest, een unit-test en een e2e-test. Per criterium controleren die tests zowel de positieve als de negatieve kant.

## Bevindingen

### 1. tests/e2e/favorites.spec.ts:135-142 — laag — tester
**Probleem:** De netwerkfouttest controleert alleen of de banner verschijnt. Twee dingen controleert hij niet:
- of het hartje terugspringt naar `aria-pressed="false"`;
- of "Opnieuw proberen" de wens opnieuw verstuurt (de retry-closure in `FavoriteButton.tsx:72-76`).

Een fout in die closure blijft zo onopgemerkt.

**Voorstel:**
1. Controleer `aria-pressed="false"` na de fout.
2. Haal de route weg met `page.unroute`.
3. Tik op "Opnieuw proberen".
4. Verwacht `aria-pressed="true"` en één rij in `favorites`.

### 2. README.md, .env.example — laag — ontwikkelaar
**Probleem:** Beide bestanden zijn nieuw en untracked, maar staan niet in het plan van T-017. Dat is scope buiten de taak. Ze bevatten geen geheime sleutels.

**Voorstel:** Neem ze niet op in de commit van T-017. Zet ze in een aparte commit, of laat de eigenaar ze aan een eigen taak koppelen.
