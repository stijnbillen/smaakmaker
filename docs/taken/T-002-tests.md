# T-002 — tests

Nieuwe taak (geen bestaand gedrag): tests mogen falen tot de ontwikkelaar klaar is.

## Bestanden
- `tests/helpers/color.ts`: kleur parsen, WCAG-contrast, `readTokens()` (leest `:root` van `tokens.css`, volgt `var(--x)`-aliassen).
- `tests/helpers/style-scan.ts`: scanner voor vaste kleur, `font-family` en afstanden.
- `tests/unit/tokens.test.ts`: criteria 2 (tokens aanwezig) en 3 (contrast, bekende waarden 21 / 4,48 / 4,54, alfa geweigerd, focus ≥ 3:1).
- `tests/unit/no-hardcoded-styles.test.ts`: criterium 2, met negatieve controles op de scanner; één test per bronbestand in `src/`.
- `tests/unit/theme-color.test.ts`: criterium 2 (`theme-color`, manifestkleuren = tokens) en `woff2` in `globPatterns`.
- `tests/unit/i18n.test.ts`: uitgebreid met nav-sleutels, `favorites.empty`, en `*.loading`/`*.empty` niet leeg.
- `tests/e2e/routes.ts`: `/favorieten` en `/profiel` toegevoegd.
- `tests/e2e/navigation.spec.ts`: criterium 1.
- `tests/e2e/a11y.spec.ts`: criteria 4 en 5, met negatieve controles (outline none, label alleen via aria-label) en tegenproef voor beweging.
- `tests/e2e/list-states.spec.ts`: criterium 6.

## Dekking
- Crit. 1: gedekt (één nav, vier links in volgorde, onderaan ±1 px, na scrollen op lange lijst, niet over inhoud, `aria-current`, tikken opent scherm). "Na het aanmelden" alleen als sessie + start-URL; T-003 moet de echte flow toevoegen (TODO in de test).
- Crit. 2: gedekt (tokens, scan op kleur / font-family / afstanden, negatieve controle, PWA-kleuren = tokens). `top/right/bottom/left` vallen niet onder de afstandsscan (brief noemt alleen margin, padding, gap, inset).
- Crit. 3: gedekt.
- Crit. 4: gedekt (zichtbaar label via `el.labels`, Tab-rondgang met focusstijl, dekking van alle interactieve elementen, knop "Opnieuw proberen" in verbindingsmelding). Op `/` en `/favorieten` zijn er mogelijk geen invoervelden; de labeltest is dan triviaal waar, de negatieve controle bewijst dat hij kan falen.
- Crit. 5: gedekt, strenger dan de brief: animatie én overgang moeten allebei ≤ 0,01 ms zijn. Tegenproef zonder emulatie per route.
- Crit. 6: gedekt voor overzicht (laden, leeg) en favorieten (leeg). Laadtoestand favorieten volgt in T-017. Extra: bij mislukt verzoek geen eeuwige laadindicator.
- Afspraak "elke lijst gebruikt `ListState`": niet automatisch getest, voor de reviewer.

## Gedraaid
- `npx tsc --noEmit` slaagt.
- Vitest en Playwright niet gedraaid (opdrachten niet toegestaan in deze sessie; e2e vraagt bovendien lokale Supabase). Scanner (regexen) is dus niet tegen de echte `src/` geprobeerd; mogelijk moet de ontwikkelaar of de volgende ronde ze bijstellen als er valse positieven opduiken.

## Testnaden
Geen nodig. Aannames over de interface: `nl.json`-sleutels uit het plan (`nav.label`, `nav.*`, `overview.loading`, `favorites.*`, `profile.title`); h1 op Nieuw is "Nieuw recept" (`form.title`); loader heeft `role="status"` met de tekst van `overview.loading`.
