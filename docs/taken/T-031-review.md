# T-031 — Review (R-031: Temperatuur in °C of °F)

Bekeken: `src/lib/temperature.ts`, `src/lib/temperatureUnit.ts`, `src/components/TemperatureSwitch.tsx`, wijzigingen in `ProfilePage.tsx`, `RecipeDetailPage.tsx`, `nl.json`/`fr.json`, `docs/beslissingen.md`, en de tests `tests/unit/temperature.test.ts`, `tests/unit/temperatureUnit.test.ts`, `tests/e2e/temperature.spec.ts`.

`CLAUDE.md` is niet gewijzigd. Er wordt geen kernbeslissing geraakt: de keuze staat alleen op het toestel, er komt geen schemawijziging bij, de nieuwe teksten staan met dezelfde sleutels in beide taalbestanden en de omzetting gebeurt alleen in de weergave. Stappen en opmerking worden alleen op `RecipeDetailPage` getoond, en dat is de enige plek waar omgezet wordt. Formulier, variant en groottelimiet gebruiken de originele tekst.

Dekking per criterium:
1. Keuze in Profiel, standaard °C, bewaard op het toestel en ook na herladen: e2e (nl/fr, nieuwe context) en unit (opslag, ongeldige waarde, opslag die een fout gooit).
2. Herkende vormen: unit-tests voor komma, punt, negatief, U+2212, met en zonder spatie, en bereik met – en -. E2e voor stap en opmerking.
3. Formules, afronding en geen "−0": alle voorbeelden uit de requirement zitten in de tests, ook de randgevallen 32,9 °F en 31,1 °F.
4. Een temperatuur in de gekozen eenheid blijft letterlijk staan: getest in unit en e2e.
5. Tekst zonder °C of °F blijft ongewijzigd: getest.
6. Alleen de weergave verandert: e2e controleert het bewerkformulier, de databank na opslaan en de variant.
7. Veel temperaturen en de tekens "<" en "&": unit (50 temperaturen, 100k tekens) en e2e (geen HTML-interpretatie, 50 × °F).
8. i18n: de sleutels `temperature.*` staan in beide bestanden.

## Bevindingen

### 1. `src/lib/temperature.ts:17`: een temperatuur direct na een komma of punt wordt niet herkend
- **Ernst:** laag
- **Rol:** ontwikkelaar
- **Probleem:** De lookbehind `(?<![\p{L}\d.,])` blokkeert ook een begin direct na `,` of `.`. Daardoor wordt in "200°C,180°C" of "afkoelen.180 °C" de tweede temperatuur niet omgezet, terwijl criterium 2 "elke temperatuur" vraagt. Dit komt alleen voor bij tekst zonder spatie na het leesteken. De lookbehind beschermt wel tegen een match midden in een decimaal getal ("1,180 °C").
- **Voorstel:** Blokkeer `.`/`,` alleen als er een cijfer vóór staat, bv. `(?<![\p{L}\d])(?<!\d[.,])`. Voeg een unit-test toe voor "200°C,180°C" → "392 °F,356 °F".

### 2. `tests/unit/temperature.test.ts:113-119`: de tijdgrens van 50 ms kan flaky zijn
- **Ernst:** laag
- **Rol:** tester
- **Probleem:** Een vaste grens van 50 ms in de wandklok kan op een trage of drukke CI-machine (Windows, eerste JIT-run) af en toe falen, ook zonder regressie. Een echte catastrofale backtracking zou wel ordes van grootte trager zijn.
- **Voorstel:** Verhoog de grens (bv. 250 ms) of voer eerst een opwarmrun uit. Het onderscheid met exponentieel gedrag blijft dan ruim zichtbaar.
