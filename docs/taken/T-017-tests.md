# T-017 — tests (R-014 Favorieten)

Bestanden: `tests/db/favorites.test.ts`, `tests/unit/favorites.test.ts`, `tests/e2e/favorites.spec.ts`.

`npx tsc --noEmit`: enige fout is `Cannot find module '../../src/lib/favorites'` (testnaad, ontwikkelaar maakt `src/lib/favorites.ts` met `addFavorite`, `removeFavorite`, `applyFavoritesOnly`). Tests falen tot de ontwikkelaar klaar is (niet-bestaande-fase-taak).

## Gedekt
1. Hartje: aria-pressed, naam, ≥ 44 px, optimistisch (favorites-call vastgehouden met `page.route`), herladen, 500 → terugspringen + `favorites.error`, netwerkfout → banner + "Opnieuw proberen", zelfde bron detail → overzicht, hartje ook bij eigen recept.
2. DB: B leest 0 rijen van A, insert met user_id = A geweigerd, delete raakt 0 rijen, geen update, `is_favorite` true/false per gebruiker, anon geen toegang. E2E: A en B zien elk het hunne op `/favorieten`.
3. "Nog geen favorieten." voor verse gebruiker; "Niets gevonden." bij filter zonder resultaat; sleutels in `nl.json` (unit). De bestaande test in `list-states.spec.ts` is ongewijzigd gelaten.
4. E2E per filter: tijd, gerief, soort, kenmerk, ingrediënten met / zonder / k van n; telkens niet-favoriet-dat-wel-past en favoriet-dat-niet-past ontbreken. Sorteren op beoordeling. DB: `?is_favorite=eq.true` en `search_recipes` geeft `is_favorite` per rij (ook gefilterd op de RPC).
5. DB: cascade na verwijderen recept (via `pg.ts`). E2E: weg uit `/favorieten`.
6. DB: tweede insert → `23505`. Unit: `23505` bij toevoegen = succes, delete van 0 rijen = succes. E2E: dubbeltik zonder fout, eindigt niet-favoriet, geen rij.

Extra: gebruiker verwijderd → favorieten weg; ontmarkeren op `/favorieten` laat de kaart staan tot herladen (beslissing in brief).

## Niet gedekt
- `tests/e2e/routes.ts` niet aangepast: `/favorieten` heeft voor lay-out- en tikdoeltests geen gegevens nodig tot de ontwikkelaar ziet dat die falen; dan bijwerken.
- Contrast van het hartkleurtoken: dekt de bestaande `tokens.test.ts` zodra het token bestaat; geen aparte test.
- Dubbeltik op `dblclick` is een benadering van "twee snelle tikken"; exacte wachtrijvolgorde zit niet in een unit-test omdat `FavoriteButton` geen testnaad heeft.
- Foutmelding "al favoriet" voor 23505 in de UI: alleen via unit-test van `addFavorite`.
- Geen testnaad gevraagd bij de ontwikkelaar behalve de modulenamen uit het plan. Selectors verwachten: hartknop met naam `favorites.add`/`favorites.remove` binnen `.recipe-list > li`, `.recipe-title`, en `aria-pressed`.

## Review-herstel (bevinding 1)
In favorites.spec.ts wachten drie tests nu op het POST/DELETE-antwoord vóór `page.reload()` (overzicht, detail, ontmarkeren op /favorieten). Bevinding 2 (laag) niet opgepakt.
