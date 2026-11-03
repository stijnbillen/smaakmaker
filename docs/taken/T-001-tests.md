# T-001 — tests

Hersteld na review (bevindingen voor de tester):

- Bevinding 2 (middel): `layout.spec.ts` vergelijkt nu met vaste 360 px (`scrollWidth`, `clientWidth`) en controleert dat geen element een `right` > 360 heeft. Negatieve controle: een geïnjecteerd element van 500 px moet de check laten falen.
- Bevinding 3 (middel, testdeel): `connection.spec.ts` heeft een geval "retry na verlaten formulier": opslaan faalt, terug naar overzicht, netwerk terug, eventueel op "Opnieuw proberen" tikken, daarna mag geen recept met die titel bestaan. Faalt tot de ontwikkelaar `resolve(KEY)` bij unmount in `NewRecipePage` toevoegt.
- Bevinding 6 (laag): `fromServiceWorker()` is `false`; wacht op eerste lading en kop "Recepten" vóór de nul-controle.
- Bevinding 7 (laag): build-tests falen nu zonder `dist/` (expliciete test) in plaats van stil over te slaan.

Bevindingen 1, 4, 5, 8, 9 zijn voor de ontwikkelaar.

Criteria: 2, 3, 4, 5, 6, 7 gedekt; 1 door de loop. `npx tsc --noEmit` slaagt. E2E niet gedraaid (vraagt lokale Supabase).
Bevinding 1 (`overflow-x: hidden`) maskeert overloop in de app. Het is geen testfout, maar de 500 px-controle meet via `getBoundingClientRect`, dus die vangt het ook met die regel.
