# T-018 — review (R-023 Tweetalige interface)

Bekeken: werkkopie tegen `54052af` (gewijzigde en nieuwe bestanden), `docs/taken/T-018.md`, `docs/taken/T-018-tests.md`, R-023 in `REQUIREMENTS.md`. `VRAGEN.md` heeft geen blok voor T-018.

`CLAUDE.md` is niet gewijzigd. De kernbeslissing over de taal staat er al als "Nederlands en Engels" (2026-11-06). Deze taak schendt geen kernbeslissing: geen migratie, geen geheime sleutel, de taal staat alleen in `localStorage`, de taalknoppen gebruiken tokens en zijn minstens 44 px.

Elk acceptatiecriterium heeft een test, en de belangrijke controles hebben een tegenproef: de sleutelvergelijking, de bronscan en "geen Nederlands in het Engels". Opgeslagen meldingen zijn sleutels (`SignInPage`, `WelcomePage`, `ReviewSection`, `PhotoPicker`, `RecipeForm`). Elk `.tsx`-bestand dat tekst toont, roept `useLanguage()` aan.

## Bevindingen

1. **tests/e2e/layout.spec.ts:84–97 — laag — tester**
   Probleem: `expectNoClippedText` (crit. 9, afgesneden knoptekst) heeft geen tegenproef. De horizontale-scrollcontrole heeft er wel een (regel 81). Als de selector of de meting stil faalt, slaagt de test altijd.
   Voorstel: voeg een test toe die een knop met `width: 40px; overflow: hidden; white-space: nowrap` en lange tekst in de pagina zet, en verwacht dat `expectNoClippedText` faalt.

2. **src/components/RecipeForm.tsx:406, src/components/StarRating.tsx:17, src/components/ReviewSection.tsx:134 — laag — ontwikkelaar**
   Probleem: hier staat nog `t(...).replace('{n}', …)` en geen `format(...)`. Plan stap 4 vraagt om die losse vervangingen weg te werken. `.replace` met een string vervangt alleen de eerste plaatsaanduiding. Een Engelse vertaling die `{n}` twee keer gebruikt, of een `{avg}`/`{count}` in een andere volgorde, zou dan half ingevuld blijven.
   Voorstel: vervang die drie plaatsen door `format('form.step', { n: i + 1 })`, `format('reviews.star' | 'reviews.stars', { n })` en `format('reviews.summary', { avg, count })`.

3. **scripts/make-email-templates.mjs:42–47 — laag — ontwikkelaar**
   Probleem: het samengestelde onderwerp gaat zonder escaping in een TOML-string tussen `"…"`. Bevat `email.subject` in een van de twee talen ooit `"` of `\`, dan wordt `config.toml` ongeldig en start de lokale Supabase niet meer.
   Voorstel: escape `\` en `"` voor TOML (`s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')`) voordat je de regel schrijft.

4. **tests/unit/language.test.ts — laag — tester**
   Probleem: crit. 5 vraagt dat foutresultaten (`AuthResult`, `SaveResult`, reviewresultaten) een `TextKey` bewaren. Daar bestaat geen unit-test voor; alleen het e2e-pad met het ongeldige e-mailadres test het. In `T-018-tests.md` staat dat al als beperking. De code klopt (`auth.ts:12` `message?: TextKey`).
   Voorstel: voeg een typecontrole toe (`expectTypeOf<AuthResult>()…`) of een unit-test op `failure(...)` die verwacht dat `message` een sleutel van `nl.json` is.
