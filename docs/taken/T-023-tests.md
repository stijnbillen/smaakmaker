# T-023 — tests

Bestanden: `tests/db/bilingual-data.test.ts`, `tests/unit/bilingual-data.test.ts`, `tests/e2e/bilingual-data.spec.ts`; aangepast: `tests/unit/tags.test.ts`, `tests/unit/equipment.test.ts` (catalogus wordt `NamedItem[]`), `tests/unit/equipmentFilter.test.ts` (gequote array-literal).

## Gedekt
- Crit. 1: E2E detail (fr/nl, terugval op Nederlandse naam, wisselen zonder herladen), formulier, suggestielijst "pom", zoeken op "pomme de terre"/"aardappel" in beide talen met "1 van 1"/"1 sur 1". Unit `displayName`/`ingredientLine` bestonden al (`catalog.test.ts`, `recipe-catalog.test.ts`), niet herhaald.
- Crit. 2: DB (alle 17 startlijst-tags met `name_fr`), E2E fr/nl in formulier, filter en detail.
- Crit. 3: DB (tien items met beide namen, `seeded`, `equipment_choices()` ook zonder recepten, niet voor anon, ongebruikt gebruikersgerief ontbreekt), migratietest (Oven/Four → één rij `oven`, recepten herschreven en ontdubbeld, overige velden gelijk; ook stale tag "Soupe"), E2E "four"/"oven" in filter en formulier.
- Crit. 4: DB (`name_fr = null`), E2E eigen tag en eigen gerief in beide talen gelijk.
- Crit. 5: E2E (soupe/four in fr, URL houdt `soep`/`oven`, `?soort=soupe` met de hand), unit (URL-parse).
- Crit. 6: DB (`Soupe` → `['soep']`, geen rij; `micro-ondes` → `microgolfoven`; `Végétarien`; kruisende sleutel geeft 23505), unit `addTag`/`addEquipment`, E2E tag en gerief.
- Crit. 7: unit (`sortByShownName`, accompagnement vóór dessert, bijgerecht vóór dessert; kookgerief met omdraaiende volgorde: kookplaat vóór oven in nl, four vóór plaque de cuisson in fr), E2E dezelfde omdraaiing voor kookgerief plus tags in beide talen, 360 px in fr.
- Review-herstel: migratietest zet nu ook de kookgerief-rij op "Oven" (hernoemtak); E2E crit. 5 controleert "four" op de kaart (`recipe-equipment`); nutteloze telling in DB-test geschrapt; overbodige zoekterm-lus verwijderd. `tsc --noEmit` schoon.

## Niet of beperkt gedekt
- "Lege databank" (crit. 3 E2E): de databank wordt tussen tests gedeeld, dus de test controleert dat de startlijst-items zichtbaar zijn, niet dat de databank leeg is.
- Vertaalde "Bedoelde u" bij zoeken: R-021, buiten deze taak.
- Crit. 1, zoeken op "pomme de terre": de E2E zoekt alleen op "aardappel" (opgeslagen tekst) en controleert "1 van 1" / "1 sur 1" in beide talen. Zoeken op de Franse naam vraagt vertaald zoeken (R-021, T-024) en is geen onderdeel van T-023; `search_recipes` zoekt nu alleen op de opgeslagen tekst. Test komt terug bij T-024.

## Aannames voor de ontwikkelaar (testnaden)
- `shownName(item, lang)` en `sortByShownName(items, lang)` worden geëxporteerd uit zowel `src/lib/tags.ts` als `src/lib/equipment.ts` (re-export uit `namedItems.ts` volstaat). `NamedItem = { name: string; nameFr: string | null }`.
- `addTag`/`addEquipment(selected, catalog: NamedItem[], input)`.
- `applyEquipmentFilter` geeft de string `{"a","b"}` (zoals `tagFilter.ts`) aan `overlaps`.
- `merge_seeded_names()` (alleen eigenaar) en `equipment_choices()` (kolommen `name`, `name_fr`). De migratietest gebruikt `set session_replication_role = replica` in één sessie om de oude toestand na te maken; dat vereist dat de lokale `postgres`-rol dat mag.
- `tsc --noEmit` faalt nu alleen op deze ontbrekende exports en de nieuwe typen.
