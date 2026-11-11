# T-034 — Review (R-032 Boodschappenlijst)

Bekeken: de migratie `20261111110000_shopping_list.sql`, `src/lib/shoppingList.ts`, `src/lib/shoppingApi.ts`, `src/components/ShoppingList.tsx`, `src/pages/WeekMenuPage.tsx`, `base.css`, `nl.json`/`fr.json`, de nieuwe tests (unit, db, e2e, helper) en de aanvulling in `tests/db/weekMenu.test.ts`. `VRAGEN.md` heeft geen blok voor T-034. `CLAUDE.md` is niet gewijzigd en geen kernbeslissing wordt geschonden. De rechten staan in RLS en kolomrechten, zonder uitzondering voor beheerders. De limieten zitten in de databank, er is een migratie, de teksten staan in beide talen en de code gebruikt alleen tokens.

De acceptatiecriteria 1–15 zijn gedekt met tests die echt iets controleren. Het randgeval van crit. 4 (999,999 g → "1 kg") is gedekt. Ook het geval waarin de eenheid na afronding gekozen wordt, en de tekst van `belowMinimum`.

Ik heb de tests niet gedraaid: deze rol leest alleen. Volgens `T-034-tests.md` heeft de tester ze ook niet gedraaid. De eindcontrole moet dus echt groen zijn voordat de taak afgevinkt wordt.

## Bevindingen

### 1. `src/components/ShoppingList.tsx:180-189`: dubbel tikken op "Toevoegen" maakt twee items
- **Ernst:** laag
- **Voor:** ontwikkelaar
- **Probleem:** tijdens het wachten op `addCustomItem` blijven het veld en de knop actief. Twee snelle tikken voegen hetzelfde item twee keer toe, en elk telt mee in de limiet van 100.
- **Voorstel:** hou een `pending`-vlag bij en zet de knop zolang op `disabled`, of negeer een tweede submit zolang de eerste loopt.

### 2. `src/lib/shoppingApi.ts:39` tegen de brief (crit. 6): de "eerste regel in de volgorde van het menu" is de oudste, maar het scherm toont de nieuwste eerst
- **Ernst:** laag
- **Voor:** ontwikkelaar
- **Probleem:** `fetchShoppingSource` sorteert `created_at asc`. Het tabblad Menu toont de nieuwste toevoeging bovenaan (beslissing T-033). Bij vrije tekst die samengevoegd wordt ("Crème fraîche" / "creme fraiche") komt het getoonde woord dus van het onderste gerecht op het scherm.
- **Voorstel:** kies één volgorde en leg die vast in `docs/beslissingen.md`. Ofwel `desc`, zoals het menu, ofwel uitdrukkelijk "de oudste toevoeging".

### 3. `src/components/ShoppingList.tsx:66` en de migratie, `prune_shopping_marks`: bij meer dan 3000 regels faalt het opruimen stil
- **Ernst:** laag
- **Voor:** ontwikkelaar
- **Probleem:** heeft het menu meer dan 3000 verschillende regels (50 gerechten met elk meer dan 60 ingrediënten), dan weigert de functie met `22023`. De fout wordt genegeerd (`void`), dus oude marks vervallen nooit. Na een tijd kan de marks-limiet (`P0101`) nieuwe vinkjes blokkeren.
- **Voorstel:** leg de grens van 3000 vast als bewuste keuze in `beslissingen.md`. Of maak de grens van `prune` ruimer dan de marks-limiet: de sleutels in `p_keys` worden niet opgeslagen, dus de grens hoeft niet dezelfde te zijn.

### 4. `src/components/ShoppingList.tsx:89`: terugzetten na een fout gebruikt de optimistische toestand, niet de toestand van de databank
- **Ernst:** laag
- **Voor:** ontwikkelaar
- **Probleem:** `before` komt uit `marksRef` op het moment van de tik. Loopt er nog een vorige wijziging voor dezelfde sleutel die later faalt, dan zet een fout bij de tweede tik het vinkje terug op een waarde die de databank misschien nooit kreeg. Een herlading corrigeert het.
- **Voorstel:** bewaar per sleutel de laatst bevestigde toestand (gezet bij het laden en na elk geslaagd antwoord) en zet bij een fout daarop terug.

### 5. `supabase/migrations/20261111110000_shopping_list.sql:17`: `btrim` haalt alleen spaties weg, de client haalt alle witruimte weg
- **Ernst:** laag
- **Voor:** ontwikkelaar
- **Probleem:** via de API wordt een item als `"\t"` of `"melk\n"` aanvaard. De client weigert dat (`trim()`). Het is geen beveiligingsprobleem, maar de databank en de client verschillen.
- **Voorstel:** gebruik `text ~ '^\S(.*\S)?$'`, of controleer met `btrim(text, E' \t\n\r')`, zodat de databank dezelfde regel volgt als `parseCustomItem`.
