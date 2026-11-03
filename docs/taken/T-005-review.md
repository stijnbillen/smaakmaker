# T-005 — review

Bekeken: de diff tegen `9f63fef`, plus alle nieuwe bestanden (migratie, lib, componenten, pagina's, tests). `CLAUDE.md` is niet gewijzigd. De kernbeslissingen zijn gerespecteerd:
- de update-policy kent alleen de auteur (geen `is_admin()`);
- verwijderen gebruikt de bestaande policy;
- het kolomrecht op `update` sluit `author_id`, `id` en `created_at` uit;
- er is een migratie, met de checks `not valid`;
- alle teksten staan in `nl.json`;
- er zijn geen sleutels in de client.

`VRAGEN.md` heeft geen blok voor T-005.

Er zijn geen bevindingen met ernst hoog of middel.

## Bevindingen

1. **`tests/db/recipes.test.ts:147-152`** — laag — tester
   - Probleem: "another user 0 rows" controleert alleen `data ?? []` met lengte 0. Een fout (bijvoorbeeld een kolomrecht-weigering) laat de test ook slagen. Zo is de stille RLS-weigering die het plan beschrijft niet bewezen. `expectUntouched` dekt de inhoud wel.
   - Voorstel: voeg `expect(upd.error).toBeNull()` toe, hier en in de beheerdertest (r. 154-159).

2. **`supabase/migrations/20261102120000_recipe_content.sql:85-127`** — laag — tester
   - Probleem: de trigger trimt ook de ingrediëntnaam, de eenheid en elke stap, en laat een eenheid van alleen spaties weg. De databanktests controleren alleen het trimmen van de titel. Een naam `"   "` (moet na trimmen geweigerd worden) en een eenheid `"  "` (moet verdwijnen) zijn niet getest.
   - Voorstel: twee kleine db-tests voor deze gevallen.

3. **`src/components/RecipeForm.tsx:123`** — laag — ontwikkelaar
   - Probleem: de blocker vraagt ook bij navigatie die de app zelf start. Verloopt de sessie terwijl het formulier gewijzigd is, dan stuurt `RequireAuth` naar `/aanmelden`. De vraag "Wijzigingen weggooien?" verschijnt dan voor iemand die al afgemeld is. De brief zegt bij Risico's: "bij afmelden toont de app geen vraag". Niet getest.
   - Voorstel: laat de blocker door als `nextLocation.pathname` `/aanmelden` is (of als er geen sessie is), of noteer het als aanvaard in `docs/beslissingen.md`.

4. **`src/components/RecipeForm.tsx:214, 293`** — laag — ontwikkelaar
   - Probleem: de rijen hebben `key={i}`. Na "Ingrediënt 1 omlaag" blijft de focus op de knop van rij 1, die nu bij een ander ingrediënt hoort. Wie nog eens tikt, verplaatst B in plaats van A. Dat werkt functioneel, maar verwart bij toetsenbord- en schermlezergebruik.
   - Voorstel: geef elke rij een stabiel id in de staat, of verplaats de focus na het verplaatsen naar de knop van de nieuwe positie.

5. **`src/components/RecipeForm.tsx:265-268, 334-336`** — laag — ontwikkelaar
   - Probleem: bij `ingredientsTooMany`/`stepsTooMany` verschijnt een lege `FieldError`. Via de interface is dat niet bereikbaar (de knop is uitgeschakeld), dus het is dode, half afgewerkte code.
   - Voorstel: maak er een tekst voor in `nl.json`, of haal de twee foutcodes weg uit `RecipeErrors` en zorg dat `validateRecipe` in dat geval een fout geeft zonder aparte melding.

6. **`src/pages/EditRecipePage.tsx:47`** — laag — ontwikkelaar
   - Probleem: na opslaan navigeert de app zonder `replace`. De terugknop opent dan opnieuw het bewerkformulier. `NewRecipePage` gebruikt wel `replace`, met als reden in de comment dat de terugknop niet naar een opgeslagen formulier mag terugkeren.
   - Voorstel: gebruik `navigate(`/recept/${id}`, { replace: true })`, zoals bij nieuw.

7. **`README.md`, `.env.example`** (nieuw, niet in git) — laag — ontwikkelaar
   - Probleem: deze bestanden staan niet in het plan van T-005. Dat is scope erbij, al is de inhoud onschuldig en staat er geen sleutel in.
   - Voorstel: laat ze staan als de eigenaar ze wil. Neem ze anders apart op in een eigen commit of taak.

## Criteria
- Crit. 1–4, 6 en 8 zijn gehaald en echt gedekt door unit-, db- en e2e-tests. Een assertie die altijd slaagt heb ik niet gevonden. Ik heb de tests niet zelf gedraaid; het loop-log meldt dat de build geslaagd is.
- Crit. 5: titel en auteur staan in het overzicht. De tijden horen bij R-007.
- Crit. 7: verwijderen met bevestiging werkt, voor de auteur en voor de beheerder (R-017 crit. 3). 0 rijen telt als mislukt (`deleteRecipe` met een onderschepte respons), en ook een verbindingsfout is getest. Favorieten en zoeken komen terecht bij R-014/R-009 (zie Risico's in de brief).
