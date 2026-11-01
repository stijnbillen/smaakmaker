# T-003 — Review ronde 5 (R-002), na mislukte eindcontrole

Basis: de werkkopie tegen `f262e5b`, met de nieuwe bestanden. Ik volg de beslissing van de eigenaar in `VRAGEN.md`: optie 2, link én code van 6 cijfers in dezelfde mail. `CLAUDE.md` en `REQUIREMENTS.md` zijn niet gewijzigd. Ik zie geen geschonden kernbeslissing. Laatste build: `logs/T-003-build-182822.log`, met 141 Vitest-tests en 89 e2e-tests geslaagd.

Sinds ronde 4 gewijzigd:
- `tests/unit/email-templates.test.ts`: een exacte vergelijking van de templates (bevinding 5).
- `tests/db/auth-invites.test.ts:251-267`: een test voor de opruiming per adres (bevinding C).
- Nieuwe migratie `20261101150000_invites_sweep_changed_codes_only.sql`. Die trigger ruimt alleen nog de codes op die het statement wijzigt.

## Stand van de bevindingen uit ronde 4

### 5 (laag, tester): hersteld
De test draait het script in een tijdelijke map en vergelijkt beide templates byte voor byte. Een verouderde tekst, een verkeerde volgorde of een verwisselde template laat de test nu falen.

### C (laag, tester): hersteld
De test slaagt pas sinds de nieuwe migratie. Hij heeft dus een echte fout gevonden: de trigger op `invites` wiste ook onbevestigde adressen die er niets mee te maken hadden. De migratie is correct:
- De transition table bevat de nieuwe rijen van het `UPDATE`-statement.
- De verliezer van een race heeft een code die nu gebruikt is, dus die wordt nog steeds opgeruimd (test op regel 187).
- Een bestaande migratie is niet aangepast.

### D (middel, tester): open, vraagt een beslissing van de eigenaar
- **Bestand:** `tests/helpers/pg.ts:9-32`.
- **Probleem:** `sql()` start voor elke query synchroon `supabase db query --local`. In `logs/T-003-build-180830.log` crashte de Vitest-worker in juist dit bestand (0xC0000409). De herhaling slaagde. De eindcontrole is dus niet deterministisch.
- **Waarom het vastzit:** de voorgestelde oplossing is een `pg`-client op poort 54322. Daarvoor moet `npm install -D pg @types/pg` draaien, en dat is in de loop twee keer geweigerd (`docs/loop-log.md` 18:15 en 18:18). Ontwikkelaar en tester kunnen niet verder. Een nieuwe dependency toevoegen hoort bij de eigenaar.
- **Vraag aan de eigenaar:**
  1. `pg` en `@types/pg` toestaan als devDependency. Daarna bouwt de tester `sql()` om.
  2. De CLI-testhulp aanvaarden, met het risico op een zeldzame crash van de worker. Mogelijke beperking zonder dependency: `execFile` async maken, of dit bestand in een aparte `forks`-pool draaien. Of dat de crash echt wegneemt, is niet bewezen.

## Nieuwe bevindingen

### E. `docs/beslissingen.md:79` beschrijft de oude opruiming — laag
- **Rol:** ontwikkelaar.
- **Probleem:** de regel zegt nog dat `drop_stale_pending_users()` bij elke wijziging van `invites` en via `refresh_pending_invite` loopt. Sinds de migraties `20261101140000` en `20261101150000` roept niets die functie nog aan. Lees je de regel los, dan klopt hij niet meer.
- **Voorstel:** schrijf erbij dat de regels van 140000 en 150000 hem vervangen. Verwijder de ongebruikte functie eventueel in een volgende migratie.

### F. `tests/build/no-secrets.test.ts:35-36` faalt als `npm test` twee keer na elkaar draait — laag
- **Rol:** tester.
- **Probleem:** volgens de ontwikkelaar bouwt Playwright `dist` opnieuw met de Supabase-omgevingsvariabelen. Daarin staat de tekst `sb_secret_` uit supabase-js zelf: een controle op het voorvoegsel, geen sleutel. De eindcontrole (`npm run build && npm test`) raakt dit niet, maar wie lokaal twee keer test, krijgt een vals alarm.
- **Voorstel:** laat de test zoeken naar een echte sleutel (`sb_secret_` gevolgd door tekens van een sleutel, bv. `/sb_secret_[A-Za-z0-9_-]{20,}/`) in plaats van alleen het voorvoegsel. Of laat de test vooraf een eigen build maken.

## Scope
Er is geen scope buiten de taak bijgekomen.
