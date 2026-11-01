# T-003 — Review ronde 3 (R-002)

Basis: werkkopie tegen `8b94af0`, met de nieuwe bestanden. Ik volg de beslissing van de eigenaar in `VRAGEN.md`: optie 2, link én code van 6 cijfers in dezelfde mail. `CLAUDE.md` en `REQUIREMENTS.md` zijn niet gewijzigd. Ik zie geen geschonden kernbeslissing. Build-log `logs/T-003-build-180540.log`: 139 Vitest-tests en 89 e2e-tests geslaagd.

## Stand van de bevindingen uit ronde 2

### A (middel, tester): hersteld
In `tests/db/auth-invites.test.ts:217-227` laat `expireWithoutEvent` de code nu verlopen zonder `UPDATE` op `invites`. De code wordt aangemaakt met `created_at = nu − 7 dagen + 7 s`, en daarna wacht de test echt tot de grens voorbij is.

- De test op regels 229-247 volgt het pad van `requestCode` in `src/lib/auth.ts:44-53`: eerst `check_invite`, dan `refresh_pending_invite`, dan `signInWithOtp`.
- De controletest op regels 251-260 laat zien dat de stroom zonder `refresh_pending_invite` geblokkeerd blijft. Als de aanroep of de functie wegvalt, faalt de test dus.

### B (laag, ontwikkelaar): hersteld
De nieuwe migratie `supabase/migrations/20261101140000_refresh_pending_invite_by_email.sql` beperkt de `delete` tot `lower(email) = lower(trim(p_email))`.

- `create or replace` behoudt de bestaande `grant execute`.
- De comment in `src/lib/auth.ts:47-48` beschrijft nu wat de functie echt doet.

## Bevindingen

### 5 (uit ronde 1). Synchronisatietest van de mails is te ruim — laag
- **Bestand:** `tests/unit/email-templates.test.ts:30-39`
- **Rol:** tester.
- **Probleem:** de test kijkt alleen of elke `email.*`-tekst ergens voorkomt in de templates of in `config.toml`. Een template met een verouderde extra tekst, of met teksten in de verkeerde volgorde of de verkeerde template, slaagt nog steeds.
- **Voorstel:** laat het script de HTML via een geëxporteerde functie bouwen. Laat de test die functie aanroepen en het resultaat exact vergelijken met `supabase/templates/confirmation.html` en `magic_link.html`.

### C. Opruiming per adres zonder eigen test — laag
- **Bestand:** `supabase/migrations/20261101140000_refresh_pending_invite_by_email.sql:18-21`; `tests/db/auth-invites.test.ts`.
- **Rol:** tester.
- **Probleem:** geen test controleert dat `refresh_pending_invite` een onbevestigde gebruiker met een verlopen code op een ander adres laat staan. Als de beperking tot één adres wegvalt, merkt geen test dat.
- **Voorstel:** maak in `expireWithoutEvent` een tweede onbevestigd adres met een verlopen code. Roep `refresh_pending_invite` aan voor het eerste adres en controleer daarna dat `userExists(tweede)` nog `true` is.

## Scope
Er is geen nieuwe scope buiten de taak bijgekomen.
