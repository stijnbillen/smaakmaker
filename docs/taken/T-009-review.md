# T-009 — Review ronde 2 (R-008: Kookgerief)

Gelezen: `CLAUDE.md`, R-008 in `REQUIREMENTS.md`, `docs/taken/T-009.md`, `docs/taken/T-009-tests.md` en de volledige werkkopie tegen `67316ea`, met de gewijzigde en de nieuwe bestanden. `VRAGEN.md` heeft geen blok voor T-009. `CLAUDE.md` is niet gewijzigd.

Er wordt geen kernbeslissing geschonden:
- Rechten en validatie zitten in de databank: de trigger `recipe_equipment_resolve`, het kolomrecht `update (equipment)` en de RLS op de catalogus, zonder schrijfrechten voor de client.
- De migratie staat in `supabase/migrations/`.
- De teksten staan in `nl.json`.
- Een variant kopieert de array mee.

`recipes_normalize()` is nu `security definer`. Ik heb de functie vergeleken met de versie in `20261102150000_recipe_source_note.sql`. Titel, bron, opmerking, ingrediënten en stappen blijven ongewijzigd. De functie past alleen `NEW` aan en de RLS filtert de rij vóór de trigger, dus de functie geeft niemand extra rechten. De keuze staat in `docs/beslissingen.md`.

## Stand van de bevindingen uit ronde 1

- **1 (middel): meer dan 20 items opslaan zonder melding.** Opgelost.
  - `RecipeForm.tsx:259` geeft `tooMany` door aan de picker.
  - `EquipmentPicker.tsx:75-83` houdt een 21ste keuze tegen en toont dan `form.equipmentTooMany`.
  - Het tekstveld krijgt `aria-invalid` en `aria-describedby`, zodat de focus-effect van het formulier het veld vindt.
- **2 (laag): geen e2e-test voor het maximum.** Staat nog open, zie hieronder.
- **3 (laag): scope `README.md` en `.env.example`.** Staat nog open, zie hieronder.

## Bevindingen

### 1. Geen e2e-test voor de grens van 20 items
- **Bestand:** `tests/e2e/recipe-equipment.spec.ts` (crit. 1, na regel 125)
- **Ernst:** laag
- **Rol:** tester
- **Probleem:** de nieuwe blokkade in `EquipmentPicker.toggle`/`add` (21ste item → melding, geen wijziging) heeft geen test. De grens is wel getest in de unit tests (`validateRecipe`) en in de databank. Zonder e2e-test merkt niemand het als de interface later stil faalt.
- **Voorstel:** maak met `insertRecipe` een recept met 20 items en een 21ste item in een ander recept. Open het eerste recept om te bewerken. Tik dan de 21ste keuzeknop aan en voeg ook een naam toe via "Toevoegen". Controleer in beide gevallen dat `form.equipmentTooMany` bij het veld staat (`aria-invalid="true"`) en dat het aantal ingedrukte knoppen 20 blijft.

### 2. Scope: `README.md` en `.env.example` zijn nieuw
- **Bestand:** `README.md`, `.env.example` (untracked)
- **Ernst:** laag
- **Rol:** ontwikkelaar
- **Probleem:** deze bestanden horen niet bij R-008 en staan niet in het plan. De inhoud is onschuldig: alleen de lokale URL en een placeholder, geen sleutel.
- **Voorstel:** haal ze uit deze taakcommit of noteer ze apart in `docs/loop-log.md`.
