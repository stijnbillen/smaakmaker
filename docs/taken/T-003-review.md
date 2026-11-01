# T-003 — Review ronde 6 (R-002)

Basis: de werkkopie tegen `d720d07`, met de nieuwe bestanden. Ik volg de beslissing van de eigenaar in `VRAGEN.md`: optie 2, link én code van 6 cijfers in dezelfde mail. `CLAUDE.md` en `REQUIREMENTS.md` zijn niet gewijzigd. Ik zie geen geschonden kernbeslissing. Laatste build: `logs/T-003-build-000914.log`. Daarin slagen 141 Vitest-tests in 12 bestanden en 89 e2e-tests.

Sinds ronde 5 gewijzigd:
- `package.json`: `pg` en `@types/pg` staan erbij als devDependency. De toestemming van de eigenaar staat in `docs/beslissingen.md` (2026-11-02).
- `tests/helpers/pg.ts`: `sql()` gebruikt nu een async `pg.Client` op de lokale poort 54322, met een controle op localhost.
- `tests/build/no-secrets.test.ts:36`: de test zoekt nu een echte sleutel.
- `docs/beslissingen.md:79`: er staat nu bij dat de vroegere opruiming deels vervangen is.

## Stand van de bevindingen uit ronde 5

### D (middel, tester): hersteld
- Er start geen CLI-proces per query meer. Elke aanroep opent een eigen `pg.Client` en sluit die in `finally`.
- Alle hulpfuncties zijn async. Elke aanroep in `tests/db/auth-invites.test.ts` en `tests/e2e/auth.spec.ts` gebruikt `await`. Een zoekactie op aanroepen zonder `await` vond niets.
- `assertLocal` houdt de regel "nooit tegen een cloud-project" in stand, ook als `SUPABASE_DB_URL` gezet is.
- `pg` komt nergens in `src/` voor.
- De build is geslaagd zonder de worker-crash. Eén geslaagde run bewijst niet dat de crash nooit meer kan optreden. Wel is de oorzaak weg: per query een synchroon CLI-proces starten.

### E (laag, ontwikkelaar): hersteld
De regel verwijst nu naar de migraties 20261101140000 en 20261101150000. Er staat ook dat `drop_stale_pending_users()` ongebruikt is.

### F (laag, tester): hersteld
`/sb_secret_[A-Za-z0-9_-]{20,}/` vangt nog altijd een echte sleutel, maar niet langer het voorvoegsel dat in supabase-js zelf staat.

## Nieuwe bevindingen
Geen.

## Scope
Er is geen scope buiten de taak bijgekomen. De extra devDependency `pg` heeft de eigenaar toegestaan, en ze wordt alleen in `tests/helpers/` gebruikt.
