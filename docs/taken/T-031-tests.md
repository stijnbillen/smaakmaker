# T-031 — Tests

Bestanden: `tests/unit/temperature.test.ts`, `tests/unit/temperatureUnit.test.ts`, `tests/e2e/temperature.spec.ts`.

## Gedekt
- Crit. 1: unit (standaard C, F, ongeldig, storage gooit, set schrijft + verwittigt); e2e in nl en fr (groep, aria-pressed, herlading, ≥ 44 px, geen horizontale scroll, nieuwe context = °C).
- Crit. 2: unit (alle vormen uit de brief + streepje met spaties blijft tekst); e2e (stap + opmerking, regeleinden).
- Crit. 3: unit (formules, halven omhoog, 32,9 °F, 31,1 °F, geen -0, koppelteken-min).
- Crit. 4: unit (zelfde eenheid teken voor teken, `===`); e2e (180°C blijft).
- Crit. 5: unit.
- Crit. 6: e2e (bewerken, opslaan zonder wijziging, variant: origineel in formulier en databank); unit (puur).
- Crit. 7: unit (50 keer, 100.000 tekens < 50 ms, `<`/`&`); e2e (script/b literal, geen dialoog, 50 keer °F).
- Crit. 8: niet apart getest; bestaande i18n-test en bronscan dekken de nieuwe sleutels (`temperature.label/celsius/fahrenheit`, door de e2e-test gebruikt).

## Niet gedekt / opmerkingen
- Compilatie (`npx tsc --noEmit`): faalt alleen op de ontbrekende modules `src/lib/temperature.ts` en `src/lib/temperatureUnit.ts` (testnaad die de ontwikkelaar maakt, met exports `convertTemperatures`, `toFahrenheit`, `toCelsius`, `loadTemperatureUnit`, `getTemperatureUnit`, `setTemperatureUnit`, `subscribe`).
- `playwright --list` en de testruns zelf kon ik niet draaien (geen toestemming in deze sessie); nog te controleren.
- E2E-aannames: variantformulier is op `/recept/:id/variant` en vraagt een gewijzigde titel; stappen/opmerking in DB als `steps` (array) en `note`.
