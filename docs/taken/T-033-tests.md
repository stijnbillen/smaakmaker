# T-033 — Tests (R-030 Weekmenu)

Bestanden:
- `tests/db/weekMenu.test.ts` (lokale Supabase)
- `tests/unit/weekMenu.test.ts`
- `tests/e2e/weekMenu.spec.ts` (nl en fr waar het criterium taalafhankelijk is, 360 px)
- `tests/e2e/navigation.spec.ts` (aangepast van 4 naar 5 ingangen) en `tests/e2e/routes.ts` (twee nieuwe routes, voor de 360 px- en tikdoelcontroles)

## Gedekt
1. Persoonlijk: db (B en beheerder: select/update/delete 0 rijen, insert met user_id=A geweigerd, `clear_week_menu` raakt A niet, anon geweigerd) + e2e (redirect zonder aanmelding, andere gebruiker ziet het menu niet).
2. Bewaard na afmelden/aanmelden (e2e, met porties) + schemacontrole op kolomnamen (db).
3. Knop op receptpagina in nl en fr: `aria-pressed`, tekst, herlading, tweede tik verwijdert, ≥ 44 × 44; `in_week_menu` per gebruiker (db).
4. 23505 (db), dubbele tik geeft één rij (e2e), `addToWeekMenu` behandelt 23505 als geslaagd (unit).
5. Porties: standaard uit recept via trigger, 1/99 ja, 0/100/−1/2,5 nee, alleen `servings` wijzigbaar (db); stepper 4→5, herlading, grenzen, recept blijft 4 (e2e); validatie vooraf (unit).
6. Limiet 50: P0050, andere gebruiker kan nog, 2 parallelle inserts bij 49 (db); melding `weekMenu.full` en knop blijft op "toevoegen" (e2e); `{ full: true }` (unit).
7. Foto met alt of placeholder, titel opent recept, Verwijderen zonder bevestiging, nieuwste bovenaan (e2e); `created_at desc` (unit).
8. Leegmaken: annuleren/bevestigen, lege toestand op beide tabs zonder lijst en zonder knop (e2e); RPC wist alleen eigen rijen (db); client gebruikt de RPC (unit).
9. Cascade bij verwijderen door auteur en beheerder (db); verdwijnt uit het menu van een andere gebruiker (e2e).
10. Vijf ingangen in volgorde, ≥ 44 × 44, geen horizontaal scrollen, label niet afgekapt, nl en fr; tablist met twee tabs, selectie, route `/weekmenu/boodschappen`, `aria-current` op beide routes, tabhoogte ≥ 44 (e2e). Ook de bestaande navigatietests (`aria-current`, tikken) zijn bijgewerkt.
11. Geen verbinding: laden, toevoegen, porties, verwijderen, leegmaken, telkens banner en "Opnieuw proberen" (e2e, nl).
12. Sleutels: niet apart getest; de bestaande i18n-test dekt dit. De unit-test controleert dat de kernsleutels bestaan en de woorden van de requirement hebben.

## Niet of deels gedekt
- Crit. 8, boodschappenlijst-gegevens: bestaan nog niet (R-032); alleen de rijen van het menu worden getest.
- Crit. 11 alleen in het Nederlands (de tekst is dezelfde sleutel in beide talen).
- Recepten met `servings is null` (standaard 1): kan niet worden aangemaakt zonder de NOT NULL van `recipes.servings` te omzeilen; niet getest.
- Het hoofd-icoon van de vijfde ingang en de visuele stijl: niet testbaar zonder smaak; de stijlscanner dekt tokens.

## Aannames voor de ontwikkelaar (afgeleid uit de taakbrief)
- `src/lib/weekMenu.ts` exporteert `addToWeekMenu`, `removeFromWeekMenu`, `setWeekMenuServings`, `clearWeekMenu`, `fetchWeekMenu`. `addToWeekMenu` geeft bij P0050 een resultaat met `full: true`. `setWeekMenuServings` geeft een `error` bij ongeldige n, zonder databankaanroep. `fetchWeekMenu` doet `.select(...).order('created_at', { ascending: false })`.
- Sleutels in nl.json: `nav.weekMenu`, `weekMenu.title` (h1), `.add`, `.added`, `.full`, `.empty`, `.tabMenu`, `.tabShopping`, `.remove`, `.removeLabel` (optioneel, met `{title}`), `.clear`, `.clearConfirm`. Annuleren gebruikt `form.cancel`.
- Kaarten zijn `listitem`s met de titel als link, een `<output>` voor de porties (zoals `ServingsStepper`), en `data-testid="recipe-photo-placeholder"` voor de vervangafbeelding. De foto is een `img` met niet-lege `alt`.
- Dubbel tikken op "toevoegen" eindigt op "In weekmenu" (criterium 4): een tweede klik tijdens de lopende aanroep mag het item dus niet weer verwijderen.

## Status van het draaien
- `npx tsc --noEmit`: enige fout is de ontbrekende module `src/lib/weekMenu` (testnaad, door de ontwikkelaar te maken).
- `npx vitest run` en `npx playwright test --list` kon ik in deze sessie niet starten (commando vereiste toestemming). De nieuwe tests zijn dus nog niet uitgevoerd; ze falen tot de ontwikkelaar klaar is.
