# T-018 — tests (R-023 Tweetalige interface)

`npx tsc --noEmit` faalt nu alleen op ontbrekende productienaden (verwacht, nieuwe taak): `src/i18n/en.json`, `src/i18n/language.ts`, `format` in `src/i18n/t.ts`, sleutel `app.title` (en overige nieuwe sleutels). Geen fouten in de tests zelf.

## Herstel na melding ontwikkelaar
- `language.spec.ts` en `auth-invites.test.ts`: JSON-imports met `with { type: 'json' }`.
- `language.spec.ts`: `byPrefix` knipt de plaatsaanduiding weg ("Step {n}" → "Step"); "Jan"-controle zonder `exact` (auteurregel bevat meer tekst).
- `auth-invites.test.ts`: tweetalige mail bevat dezelfde code twee keer; test eist nu één *unieke* code (`new Set(codes).size === 1`). Te toetsen gedrag ongewijzigd. `npx tsc --noEmit` slaagt.

## Testnaden die de ontwikkelaar moet maken
- `src/i18n/language.ts` exporteert: `Language`, `detectLanguage`, `loadLanguage`, `setLanguage`, `getLanguage`, `subscribe` (geeft een afmeldfunctie terug), `initLanguage`, `locale`.
- `src/i18n/t.ts` exporteert `format(key, vars)`; `TextKey = keyof typeof nl`; ergens in `src/i18n/*.ts(x)` komt letterlijk `Record<TextKey, string>` voor (typering van `en.json`).
- `setLanguage` en `loadLanguage` mogen in Node geen `document`/`localStorage`/`navigator` aannemen zonder te controleren, maar de tests stubben ze (`vi.stubGlobal`). Een `localStorage` die gooit mag niet crashen.
- Standaardtaal `nl` vóór `initLanguage()`.
- UI: taalkeuze = groep (`role=group`, naam `language.label`) met twee knoppen "Nederlands" en "English" met `aria-pressed`; op `/aanmelden` en `/profiel`. Detailpagina gebruikt `.ingredient-list` (bestaand).
- `scripts/make-email-templates.mjs` leest `src/i18n/nl.json`, `src/i18n/en.json` en `supabase/config.toml` uit de werkmap (cwd) en herschrijft alleen de twee `subject = `-regels (`"{nl} / {en}"`).
- `playwright.config.ts`: `use.locale = 'nl-BE'` heb ik zelf gezet (testconfiguratie, geen productiecode).

## Gedekt
| Crit. | Test |
|---|---|
| 1 | `tests/unit/i18n.test.ts`: sleutels in beide richtingen, geen lege waarden, plaatsaanduidingen, tegenproef (`compareTexts`), `TextKey`/`Record<TextKey,string>`-controle, nieuwe sleutels, `time.hours` = "{h} h" |
| 2 | `tests/unit/language.test.ts` (opslag `smaakmaker.lang`, ongeldige waarde, privémodus); `tests/e2e/language.spec.ts` (keuze op beide schermen in beide talen, reload, nieuwe pagina, terug naar nl) |
| 3 | `language.test.ts` (`detectLanguage` alle zes gevallen, `loadLanguage`); e2e met `locale` en-US / nl-BE, bewaarde keuze wint, ongeldige waarde |
| 4 | e2e: e-mailadres blijft, 0 navigaties, `html lang`, `document.title`; wisselen op `/profiel` en navigeren; melding wisselt van taal; unit: `subscribe`, `t()` direct |
| 5 | `i18n.test.ts`: bronscan met de TypeScript-parser (JSX-tekstknopen, `aria-label`/`placeholder`/`title`/`alt`, tegenproef), meerwoordige nl-waarden niet in broncode, uitnodigingsstatus; e2e: geen Nederlands per scherm uit `routes.ts` (met tegenproef), verwijderen recept, wijzigingen weggooien, review verwijderen, verbindingsmelding, veldfout, opslagfout; `AuthResult`-sleutels indirect via de melding-wisseltest |
| 6 | unit per taal: `formatDate`, `formatDateTime`, `formatDuration`, `formatQuantity`, `parseQuantity`, `< 0,01`/`< 0.01`, `formatRating`, `formatRecipeSize`; e2e Engels: "1,5" → "1.5", omrekenen 300, bewerkpagina "1.5" |
| 7 | `email-templates.test.ts` (beide talen in beide sjablonen, volgorde, onderwerp in `config.toml`, byte-vergelijking incl. `config.toml`, rest van `config.toml` onaangeroerd); `tests/db/auth-invites.test.ts` (onderwerp en volgorde in de Mailpit-mail, nieuwe én bestaande gebruiker) |
| 8 | `i18n.test.ts` met `tests/unit/fixtures/nl-before-T-018.json`; `locale: 'nl-BE'` in Playwright-config |
| 9 | `layout.spec.ts` draait nu in een lus over `nl` en `en` (incl. `/aanmelden`), plus nieuwe controle op afgesneden knop-/linktekst (`scrollWidth`, ellipsis) |
| 10 | e2e: titel, stap, bron, opmerking, review, weergavenaam "Jan", vrije ingrediënten "aardappel"/"el" blijven letterlijk in het Engels |

## Niet of beperkt gedekt
- Criterium 5, "foutresultaten bewaren een `TextKey`": geen aparte unit-test op `AuthResult`/`SaveResult`-types; gedrag (melding wisselt na het wisselen) wordt wel e2e getest. Reden: de vorm van die types ligt niet vast in de brief.
- Bronscan "meerwoordige waarden": commentaar telt niet mee (de scan leest alleen stringliteralen en JSX-tekst), om vals alarm op citaten in commentaar te vermijden.
- Opslagfout "volle opslag/privémodus": alleen unit (gooiende `localStorage`), niet e2e.
- Tag- en kookgeriefnamen uit de databank zijn Nederlands en kunnen toevallig overeenkomen met een Nederlandse waarde in de "geen Nederlands"-controle; die controle vergelijkt hele tekstknopen met nl-waarden die niet ook een Engelse waarde zijn.
- Bestaande tests met Nederlandse zoeklocators (`recipe-form` helpers) blijven ongewijzigd en draaien met `locale: 'nl-BE'`; de Engelse hoeveelheidstest gebruikt daarom eigen locators met `en.json`-namen.
- Niets uitgevoerd tegen draaiende Supabase/Playwright: alleen `tsc` gedraaid (mocht het bouwcommando falen op ontbrekende code, dan is dat de verwachte rode fase).
