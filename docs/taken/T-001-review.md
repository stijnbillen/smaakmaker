# T-001 — review

Bekeken: werkkopie tegen `18caaed` (alle nieuwe bestanden + `PROGRESS.md`). `CLAUDE.md` is niet gewijzigd. Er wordt geen kernbeslissing geschonden. `VRAGEN.md` heeft geen blok voor T-001.

## Bevindingen

### 1. `src/styles/base.css:12`: `overflow-x: hidden` op `html, body` verbergt overloop in plaats van hem te voorkomen
- **Ernst:** middel
- **Rol:** ontwikkelaar
- **Probleem:** Criterium 4 vraagt dat schermen "bruikbaar" zijn op 360 px zonder horizontaal scrollen. Met `overflow-x: hidden` op de root wordt te brede inhoud (een breed formulier of tabel uit een latere taak) gewoon afgeknipt, zodat de gebruiker die inhoud niet meer kan bereiken. Daarnaast kan deze regel de lay-outtest maskeren (zie bevinding 2). Lange titels worden al opgevangen door `overflow-wrap: anywhere`, dus de regel is niet nodig.
- **Voorstel:** Verwijder `overflow-x: hidden` (en `max-width: 100%`) uit het blok `html, body`. Laat overloop zichtbaar worden, zodat de test hem vangt.

### 2. `tests/e2e/layout.spec.ts:22-28`: de controle op horizontaal scrollen kan altijd slagen
- **Ernst:** middel
- **Rol:** tester
- **Probleem:** Het project draait met `isMobile: true`. Chromium in mobiele emulatie zoomt bij te brede inhoud uit (shrink-to-fit). Dan wordt `window.innerWidth` even groot als `scrollWidth`, en slaagt `scrollWidth <= innerWidth` ook als de pagina te breed is. Met bevinding 1 erbij wordt de overloop bovendien afgeknipt. De test bewijst dus niet dat er op 360 px niets uitsteekt.
- **Voorstel:** Vergelijk met de vaste breedte (`360`, of `page.viewportSize().width`) en met `document.documentElement.clientWidth`, niet met `innerWidth`. Controleer daarnaast dat geen enkel zichtbaar element een `getBoundingClientRect().right` groter dan 360 heeft. Voeg een negatieve controle toe: een tijdelijk geïnjecteerd element van 500 px breed moet de check laten falen. Zo is aangetoond dat de test kan falen.

### 3. `src/pages/NewRecipePage.tsx:10-27`: een verlaten formulier blijft als retry-actie geregistreerd
- **Ernst:** middel
- **Rol:** ontwikkelaar
- **Probleem:** `RecipeListPage` roept bij unmount `resolve(KEY)` aan, maar `NewRecipePage` doet dat niet. Het scenario: opslaan mislukt door een verbindingsfout, de gebruiker tikt op "Terug naar overzicht", en de banner blijft staan met de oude `save` geregistreerd. Tikt de gebruiker daarna op "Opnieuw proberen", dan wordt het verlaten recept alsnog ingevoegd, terwijl hij het formulier had verlaten. Daarna volgt een `navigate('/')` vanuit een niet-gemounte component. Het gevolg is een ongewenste rij in de gedeelde databank.
- **Voorstel:** Voeg `useEffect(() => () => resolve(KEY), [resolve])` toe aan `NewRecipePage`. Laat de tester een e2e-geval toevoegen: opslaan mislukt, de gebruiker gaat terug naar het overzicht, het netwerk komt terug, hij tikt op "Opnieuw proberen", en er wordt geen recept met die titel ingevoegd.

### 4. `src/pages/NewRecipePage.tsx:44`: dubbel invoegen bij dubbel tikken
- **Ernst:** laag
- **Rol:** ontwikkelaar
- **Probleem:** De knop "Opslaan" blijft actief zolang het verzoek loopt. Twee keer tikken geeft twee recepten. Het formulier is voorlopig, maar R-003 bouwt hierop verder.
- **Voorstel:** Schakel de knop uit (of negeer submits) zolang `save` loopt.

### 5. `src/pages/RecipeListPage.tsx:27`: een laat antwoord na unmount registreert de actie opnieuw
- **Ernst:** laag
- **Rol:** ontwikkelaar
- **Probleem:** Faalt een `load` die nog liep toen de pagina al verlaten was, dan roept die `report` aan na de cleanup. De banner verschijnt dan op een ander scherm, en "Opnieuw proberen" voert `load` uit op een niet-gemounte component.
- **Voorstel:** Houd in de effect een vlag `active` bij en roep na unmount geen `report`, `resolve` of `setState` meer aan.

### 6. `tests/e2e/shared-recipes.spec.ts:32-36`: "gaat echt naar het netwerk" is maar half gecontroleerd
- **Ernst:** laag
- **Rol:** tester
- **Probleem:** Status 200 bewijst niet dat het antwoord niet uit de service worker kwam. De Cache Storage-test dekt dat grotendeels af, maar de brief vraagt het expliciet voor dit verzoek. Verder slaagt `toHaveCount(0)` vóór het invoegen al voordat de lijst geladen is, dus ook als de eerste lading faalt.
- **Voorstel:** Voeg `expect(res?.fromServiceWorker()).toBe(false)` toe. Wacht vóór het invoegen tot de lijst geladen is, bijvoorbeeld op de kop "Recepten" en een afgerond `/rest/v1/recipes`-antwoord.

### 7. `tests/build/manifest.test.ts:6` en `tests/build/no-secrets.test.ts:6`: criteria 2 en 7 worden stil overgeslagen zonder `dist/`
- **Ernst:** laag
- **Rol:** tester
- **Probleem:** De brief staat overslaan toe omdat de loop eerst bouwt. Toch kan `npm test` zonder build groen zijn zonder dat criterium 2 of 7 gecontroleerd is. Alleen een `console.warn` meldt dat.
- **Voorstel:** Laat de test falen als `dist/` ontbreekt (`npm test` volgt in de loop altijd op `npm run build`), of laat `test:unit` zelf eerst bouwen.

### 8. `src/lib/supabase.ts:8`: Nederlandse foutmelding in code
- **Ernst:** laag
- **Rol:** ontwikkelaar
- **Probleem:** De opstartfout is een ontwikkelaarsmelding in het Nederlands. Volgens `CLAUDE.md` is code Engels en staat zichtbare tekst in `nl.json`. Deze tekst is geen van beide.
- **Voorstel:** Schrijf de melding in het Engels; ze is alleen voor ontwikkelaars bedoeld.

### 9. `tsconfig.tsbuildinfo` (projectroot): bouwartefact niet in `.gitignore`
- **Ernst:** laag
- **Rol:** ontwikkelaar
- **Probleem:** `tsc -b` schrijft `tsconfig.tsbuildinfo` in de root. Dat bestand staat als untracked en komt mee in het savepoint.
- **Voorstel:** Voeg `*.tsbuildinfo` toe aan `.gitignore` en zet het bestand niet in de commit.

## Criteria (samenvatting)
| Crit. | Status |
|---|---|
| 1 build + test | gedekt door de loop |
| 2 manifest | gedekt (laag: overslaan zonder `dist/`) |
| 3 gedeeld recept | gedekt op databank- en interfaceniveau |
| 4 360 px | test kan vals slagen (bevinding 1, 2) |
| 5 tikdoelen | gedekt |
| 6 verbindingsfout | gedekt; retry-lek bij verlaten formulier (bevinding 3) |
| 7 geen geheime sleutels | gedekt |

Scope: het voorlopige formulier, de minimale `recipes`-tabel en het script voor de iconen staan in het plan van de taak. Er is geen scope buiten de taak bijgekomen.
