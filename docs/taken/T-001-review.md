# T-001 — review (ronde 3, na blokkade)

Bekeken: de werkkopie tegen `5ecdb3a`, met alle nieuwe bestanden en de wijzigingen in `.gitignore`, `PROGRESS.md`, `docs/beslissingen.md` en `docs/loop-log.md`. `CLAUDE.md` is niet gewijzigd en er wordt geen kernbeslissing geschonden. `VRAGEN.md` heeft geen blok voor T-001.

## Opvolging van de vorige review
| # | Bevinding | Status |
|---|---|---|
| 1 | `overflow-x: hidden` op `html, body` | Hersteld: `src/styles/base.css:8-11` |
| 2 | Lay-outtest kan altijd slagen | Hersteld: `tests/e2e/layout.spec.ts` vergelijkt met vaste 360 px, controleert `right` per element en heeft een negatieve controle van 500 px (r. 63-75) |
| 3 | Verlaten formulier blijft als retry geregistreerd | Hersteld: `src/pages/NewRecipePage.tsx:24-30`. Gedekt door `tests/e2e/connection.spec.ts:43-69`, die faalt zonder `resolve(KEY)` bij unmount. De race uit de loop-log is opgelost met een klik met korte timeout. |
| 4 | Dubbel tikken geeft dubbele invoer | Hersteld (`savingRef` en `disabled={saving}`) |
| 5 | Laat antwoord na unmount | Hersteld (`active`-vlag in `RecipeListPage`, `mounted` in `NewRecipePage`) |
| 6 | `fromServiceWorker` en wachten op de eerste lading | Hersteld: `tests/e2e/shared-recipes.spec.ts:24-27, 41` |
| 7 | Build-tests worden stil overgeslagen | Hersteld: ze falen nu expliciet zonder `dist/` |
| 8 | Nederlandse foutmelding in `src/lib/supabase.ts` | Hersteld |
| 9 | `*.tsbuildinfo` staat niet in `.gitignore` | Hersteld |

## Bevindingen

### 1. `supabase/migrations/20261101000000_init_recipes.sql:6`: `on delete cascade` beslist vooraf over een geparkeerde vraag
- **Ernst:** laag
- **Rol:** ontwikkelaar
- **Probleem:** "Account verwijderen en wat er dan met recepten en reviews gebeurt" staat in `REQUIREMENTS.md` als geparkeerd, en daarover beslist de eigenaar. Met `cascade` verdwijnen alle recepten van een gebruiker zodra iemand die gebruiker in Supabase verwijdert, ook als dat via het dashboard gebeurt. In een gedeelde databank is dat stil dataverlies. Er is nog geen functie om een account te verwijderen, dus dit is vandaag geen fout.
- **Voorstel:** Gebruik `on delete restrict` (de standaard). Dat is de veilige keuze tot de eigenaar beslist. `deleteTestUser` verwijdert de rijen al vooraf, dus de tests blijven werken. Een andere mogelijkheid: laat `cascade` staan, maar noteer het als voorlopig in `docs/beslissingen.md`.

### 2. `tests/helpers/supabase-admin.ts:6, 44`: foutmeldingen in testcode zijn Nederlands
- **Ernst:** laag
- **Rol:** tester
- **Probleem:** Volgens `CLAUDE.md` is code Engels. Het taakplan schrijft de Nederlandse melding "Lokale Supabase niet bereikbaar; draai `supabase start`" letterlijk voor, maar de melding "Test weigert te starten…" komt niet uit het plan. In `src/` is dezelfde soort melding in de vorige ronde al naar het Engels omgezet.
- **Voorstel:** Laat beide meldingen voor ontwikkelaars voortaan Engels zijn. De melding uit het plan mag blijven staan als de eigenaar dat zo wil. Dit heeft geen gevolg voor de werking.

## Criteria
| Crit. | Status |
|---|---|
| 1 build + test | gedekt door de loop (loop-log 16:43: build geslaagd) |
| 2 manifest | gedekt (`tests/build/manifest.test.ts`: echte PNG-afmetingen; `manifest.spec.ts`: link in `index.html`) |
| 3 gedeeld recept | gedekt op databankniveau (`tests/db/shared-recipes.test.ts`) en in de interface, inclusief `fromServiceWorker === false` en Cache Storage |
| 4 360 px | gedekt; negatieve controle bewijst dat de test kan falen |
| 5 tikdoelen | gedekt op elke route, ook voor de knop "Opnieuw proberen" in de fouttoestand |
| 6 verbindingsfout | gedekt: overzicht herstelt zonder herladen, formulierwaarde blijft staan, verlaten formulier wordt niet opgeslagen, `isConnectionError` met unit-tests, teksten in `nl.json` |
| 7 geen geheime sleutels | gedekt: service-sleutel, `sb_secret_` en JWT-rol op `dist/`, plus een statische controle van `src/` |

Scope: geen werk buiten de taak. Het voorlopige formulier, de minimale tabel en het script voor de iconen staan in het plan en zijn in `docs/beslissingen.md` als voorlopig genoteerd.
