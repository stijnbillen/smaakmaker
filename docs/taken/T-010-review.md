# T-010 — review (ronde 2)

`CLAUDE.md` is niet gewijzigd en geen enkele kernbeslissing wordt geschonden:
- De rechten staan in de databank. De catalogus `tags` is voor de client alleen leesbaar. Nieuwe tags ontstaan alleen via de trigger met `security definer`. De update-policy op `recipes` blijft ongewijzigd, met een extra kolomrecht `update (dish_tags)`.
- De zichtbare teksten staan in `nl.json`.
- Identifiers en commentaar zijn in het Engels.

Criterium 5 (beheerder `[?]`) is niet gebouwd. Dat volgt het parkeerpunt in `REQUIREMENTS.md`.

## Stand van de bevindingen uit ronde 1
- **1 (middel), quoting van het `overlaps`-filter:** opgelost. `src/lib/tagFilter.ts:45-54` geeft nu een volledig gequote array-literal mee als string. Postgrest-js zet een string ongewijzigd door (`ov.${value}`).
  - De unit test `tests/unit/tagFilter.test.ts:86` parset de literal terug en faalt bij de oude aanroep met `string[]`.
  - De e2e-test `tests/e2e/recipe-tags.spec.ts:248-267` dekt twee gevallen: een komma in een tagnaam, en speciale tekens in `?soort=`.
- **4 (laag), verouderde keuze in `TagFilter`:** opgelost. `RecipeListPage` berekent de keuze nu uit `paramsRef.current`.
- **2, 3 en 5 (laag):** staan nog open, zie hieronder. Ze blokkeren niet.

## Bevindingen

### 1. `tests/db/recipe-tags.test.ts:170-178` — laag — tester
**Probleem:** de test gebruikt de vaste namen "Brunch" en "brunch". Vanaf de tweede run bestaat de catalogusrij al, dus de race (twee nieuwe inserts tegelijk) wordt niet meer getest en de test slaagt altijd.
**Voorstel:** gebruik een unieke suffix per run, dezelfde voor beide namen.

### 2. `tests/db/recipe-tags.test.ts`, `tests/e2e/recipe-tags.spec.ts` — laag — tester
**Probleem:** elke run voegt blijvend tags toe aan de lokale catalogus, en niemand kan ze verwijderen. Daardoor groeit het aantal knoppen in het formulier en in het filter, en worden de e2e-tests trager.
**Voorstel:** ruim de testtags op in `afterAll` via `sql`, met de suffixen van de run.

### 3. `src/components/TagChoices.tsx:16,22` — laag — ontwikkelaar
**Probleem:** een naam uit de URL met andere hoofdletters, zoals `?soort=Soep`, krijgt geen eigen knop, omdat de sleutel gelijk is aan die van "soep". De knop "soep" staat dan ook niet ingedrukt, want `pressed` vergelijkt de exacte naam. De gebruiker kan het filter dus niet uitzetten via de knoppen. Tikt hij op "soep", dan wordt de keuze `["Soep", "soep"]`. Er volgt geen fout en het geval komt alleen voor bij een handgetypte URL.
**Voorstel:** bepaal `pressed` op `tagKey`. Of normaliseer de URL-waarden naar de spelling uit de catalogus zodra die geladen is.

### 4. `README.md`, `.env.example` (untracked) — laag — ontwikkelaar
**Probleem:** de twee bestanden staan nog steeds in de werkkopie. Ze horen niet bij T-010, maar gaan mee in de commit van de taak als iemand alles commit.
**Voorstel:** sluit ze uit van de commit van T-010. De eigenaar beslist of ze in een aparte commit komen.
