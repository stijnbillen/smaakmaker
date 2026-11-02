# T-009 — Review ronde 3 (R-008: Kookgerief, na "eindcontrole faalt")

Gelezen: `CLAUDE.md`, R-008 in `REQUIREMENTS.md`, `docs/taken/T-009.md`, `docs/taken/T-009-tests.md`, `docs/beslissingen.md` (T-009) en de volledige werkkopie tegen `f78cd8d`, met de gewijzigde en de nieuwe bestanden. `VRAGEN.md` heeft geen blok voor T-009. `CLAUDE.md` is niet gewijzigd.

De vorige stop ("eindcontrole faalt") viel samen met een crash van een Vitest-worker. Die vangt `scripts/loop.ps1` nu op (`f78cd8d`). De build van deze ronde is geslaagd (`docs/loop-log.md`). Aan de code van T-009 is sinds ronde 2 inhoudelijk niets veranderd.

## Acceptatiecriteria

1. **Nul of meer items, 1–30 tekens.** Gehaald. De trigger `recipe_equipment_resolve` dwingt de grens af in de databank (`23514`), net als het maximum van 20. De client toont de melding bij het veld. Gedekt door unit-, databank- en e2e-tests. Die tests controleren beide richtingen, dus geen enkele slaagt altijd.
2. **Kiezen of toevoegen; een bestaande naam wordt hergebruikt.** Gehaald. `fold_key`, de unieke `name_key` en `on conflict do nothing` zorgen voor het hergebruik. Er is ook een test voor gelijktijdig opslaan. De e2e-test "OVEN" → "Oven" dekt de interface.
3. **Zichtbaar op de detailpagina en in het overzicht.** Gehaald. Een recept zonder gerief toont geen leeg element. De test op 360 px slaagt zonder horizontaal scrollen.
4. **Filter "minstens één van de gekozen items".** Gehaald met `overlaps` (GIN-index). De keuze staat in de URL, de combinatie met het tijdfilter geeft de doorsnede en zonder treffers verschijnt "Niets gevonden.".

Er wordt geen kernbeslissing geschonden:
- De rechten zitten in de databank: RLS op de catalogus, zonder schrijfrechten voor de client, plus het kolomrecht `update (equipment)`. De resolve-functie is niet uitvoerbaar voor de client.
- De migratie staat in `supabase/migrations/`.
- De teksten staan in `nl.json`.
- De stijl gebruikt alleen tokens.
- Een variant kopieert de array mee.

`recipes_normalize()` heeft de volledige inhoud van de vorige versie behouden en is nu `security definer`. Voor een update filtert de RLS de rij vóór de trigger. Bij een insert die de RLS weigert, rolt ook de catalogusrij terug.

## Bevindingen

### 1. Geen e2e-test voor de grens van 20 items in de interface
- **Bestand:** `tests/e2e/recipe-equipment.spec.ts:125` (na de Enter-test)
- **Ernst:** laag
- **Rol:** tester
- **Probleem:** `EquipmentPicker.tsx:56-58` en `:77-79` blokkeren een 21ste item en tonen dan `form.equipmentTooMany`. Geen enkele test dekt dat. De grens is alleen getest in de unit tests (`validateRecipe`) en in de databank.
- **Voorstel:** maak met `insertRecipe` een recept met 20 items en zet een 21ste item in een ander recept. Open het eerste recept om te bewerken. Tik dan de 21ste knop aan en voeg ook een nieuwe naam toe via "Toevoegen". Controleer in beide gevallen dat de melding bij het veld staat (`aria-invalid="true"`) en dat er 20 knoppen ingedrukt blijven.

### 2. Een filter uit de URL kun je niet wissen als er geen gerief in gebruik is
- **Bestand:** `src/components/EquipmentFilter.tsx:157`
- **Ernst:** laag
- **Rol:** ontwikkelaar
- **Probleem:** `if (names.length === 0) return null` verbergt ook de knoppen voor de namen die al in de URL staan (`value`). Zonder gerief in gebruik toont `?gerief=Oven` (bv. een oude bladwijzer of een link van de favorieten) "Niets gevonden.", maar er is geen knop om de keuze weg te halen.
- **Voorstel:** render alleen niets als zowel `names` als `value` leeg zijn. De samenvoeging op regel 162 toont de namen uit de URL dan al als ingedrukte knoppen.

### 3. Scope: `README.md` en `.env.example` zijn nieuw
- **Bestand:** `README.md`, `.env.example` (untracked)
- **Ernst:** laag
- **Rol:** ontwikkelaar
- **Probleem:** deze bestanden horen niet bij R-008 en staan niet in het plan. De inhoud is onschuldig: een lokale URL en een placeholder, geen sleutel.
- **Voorstel:** haal ze uit deze taakcommit of noteer ze apart in `docs/loop-log.md`.
