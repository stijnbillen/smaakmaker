# T-005 — testverslag

`npx tsc --noEmit` faalt alleen op ontbrekende productiecode: `canEdit` in `src/lib/permissions.ts` en `src/lib/recipe.ts`. Dat zijn de testnaden voor de ontwikkelaar. De tests zelf compileren. Ze zijn niet gedraaid: de code bestaat nog niet.

## Bestanden
- Nieuw: `tests/unit/recipe.test.ts`, `tests/db/recipes.test.ts`, `tests/e2e/recipe-form.spec.ts`, `tests/e2e/recipe-detail.spec.ts`, `tests/e2e/discard.spec.ts`, `tests/helpers/recipe-form.ts`.
- Uitgebreid: `tests/unit/permissions.test.ts` (`canEdit`), `tests/helpers/supabase-admin.ts` (`validRecipe`, `insertRecipe`), `tests/e2e/routes.ts` (`/recept/:id`, `/recept/:id/bewerken` met `prepareRoutes`).
- Aangepast aan de nieuwe checks (geldig minimumrecept): `admin`, `shared-recipes`, `auth-invites` (db); `a11y`, `auth`, `connection`, `layout`, `navigation`, `shared-recipes` (e2e). `a11y`, `layout` en `navigation` roepen `prepareRoutes` aan.
- `connection.spec.ts` vult nu het volledige formulier in. De test "verlaten formulier" bevestigt eerst "Weggooien", omdat het formulier dan gewijzigd is.

## Aannames over de code (de brief legt de vorm niet vast)
- Een `RecipeDraft` is `{ title, ingredients: [{ name, quantity: string, unit }], steps: string[] }`. De hoeveelheid is de ruwe invoertekst.
- `validateRecipe`, `parseQuantity` en `toRow` worden vormonafhankelijk gelezen:
  - een fout is een waarheidswaarde onder `result.errors ?? result`;
  - `parseQuantity` mag een getal, `null` of een object met `value`/`error` teruggeven, of een fout gooien;
  - `toRow` geeft `{ title, ingredients: [{ name, quantity?: number, unit? }], steps }`.
- `formatQuantity(number)` geeft een string met komma: `0.25` → `"0,25"`.
- De labels van invoervelden beginnen met "Ingrediënt", "Hoeveelheid", "Eenheid" en "Stap". "Titel" is exact.
- De dialoog heeft `role="alertdialog"`.

## Herstel na ontwikkelaarsmelding (alleen testfouten, gedrag ongewijzigd)
- `layout.spec.ts`: `LONG_TITLE` was 150 tekens, nu 100 (de titelgrens). Nog steeds breder dan 360 px zonder `overflow-wrap`.
- `recipe-detail.spec.ts`: de tests met `route.fulfill` (0 rijen) en `abort` (verbindingsfout) wachten eerst tot de titel zichtbaar is. Anders brak de abort het laden van het recept zelf af.
- `discard.spec.ts`: de terugknoptest navigeert in de app (nav "Nieuw") in plaats van `page.goto('/nieuw')`. `goto` is een volledige lading, daardoor zag de router-blocker de terugknop niet.
- `npx tsc --noEmit` slaagt. De e2e-tests zijn niet gedraaid.

## Gedekt
| Criterium | Test |
|---|---|
| 1 Verplicht | unit `validateRecipe` (grenzen, code points), db (23514, normalisatie), e2e lege opslag (meldingen, aria, geen POST, blijft op `/nieuw`) |
| 2 Grenzen | unit `parseQuantity` en grenzen, db (alle grenzen, hoeveelheid, update), e2e (knoppen uitgeschakeld bij 60 en 40, foute hoeveelheid) |
| 3 Herordenen | unit `moveItem`/`removeItem`, e2e (A,B,C-scenario, detailvolgorde, genummerde stappen, 44 px, namen) |
| 4 Opslaan en detail | e2e opslaan, overzicht bovenaan, onbekend en ongeldig id; db: `created_at` ongewijzigd |
| 5 Overzicht | e2e: titel en auteur per item |
| 6 Alleen auteur | unit `canEdit`; db (andere gebruiker en beheerder 0 rijen, `author_id`/`created_at` 42501, auteur mag); e2e (knoppen, redirect van `/bewerken`, 0 rijen = "Opslaan mislukt.") |
| 7 Verwijderen | e2e: auteur, annuleren, Escape, beheerder, gewone gebruiker, 0 rijen = mislukt, verbindingsfout; de bestaande `admin.test.ts` is behouden |
| 8 Weggooien | e2e (`discard.spec.ts`): navigatiebalk, terugknop, bewerken, geen wijziging, terugzetten, na opslaan, `beforeunload` |
| R-001/R-002/R-016 | `routes.ts` dekt `/recept/:id` en `/bewerken` in de 360 px-, tikdoel-, label- en navigatietests; `connection.spec.ts` aangepast; verbindingsfout bij verwijderen getest |

## Niet gedekt
- Crit. 7, favorieten en zoekresultaten: die bestaan nog niet (zie Risico's in de brief). R-014 en R-009 testen dat.
- De `beforeunload`-tekst en het gedrag van het tabblad sluiten: de browser bepaalt dat. Alleen `preventDefault` is getest.
- Een verbindingsfout tijdens laden van het detailscherm: alleen verwijderen en opslaan zijn getest.
- Afmelden met een open formulier zonder vraag: niet getest, de brief noemt het alleen als risico.
- Hoeveelheid ≥ 1.000.000 en afwijkende sleutels in een ingrediënt: de brief noemt dit in het plan, niet in een criterium.
