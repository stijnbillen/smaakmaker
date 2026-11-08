# T-028 — review

`CLAUDE.md` en `REQUIREMENTS.md` zijn niet gewijzigd. Geen kernbeslissing geschonden: alleen anon-sleutel, nieuwe migratie in `supabase/migrations/`, het slot blijft de trigger op `auth.users`, sleutels in `nl.json`/`fr.json` blijven gelijk.

## Bevindingen

### 1. Een `500` voor een bestaand lid wordt "Geen account met dit e-mailadres"
- **Bestand:** `src/lib/auth.ts:61-63`
- **Ernst:** middel
- **Rol:** ontwikkelaar
- **Probleem:** Elke `500` van GoTrue wordt nu `auth.unknownAddress`, ook als `sign_in_status` `'member'` gaf. Vroeger gold de `500`-regel alleen voor een aanvraag met uitnodigingscode (`inviteCode && e.status === 500`). GoTrue geeft ook `500` als de mail niet vertrekt (SMTP-fout: "Error sending magic link email"). `docs/online-zetten.md` stap 4 voorziet eigen SMTP via Gmail, dus die fout kan echt optreden. Een bestaand lid krijgt dan de melding dat hij geen account heeft en een beheerder om een uitnodiging moet vragen. Dat is fout en stuurt hem de verkeerde kant op. Het risico in `T-028.md` ("Wedloop") rekent met de oude situatie, toen de regel alleen voor uitnodigingen gold.
- **Voorstel:** De `500` alleen als `auth.unknownAddress` lezen als `invited === true`, want alleen dan kan de trigger weigeren. Bij `'member'` geeft een `500` gewoon `auth.error`. `otp_disabled` en "signups not allowed" blijven voor beide gevallen `auth.unknownAddress`.

### 2. Geen test voor een `500` bij een lid
- **Bestand:** `tests/unit/auth.test.ts:83-93`
- **Ernst:** laag
- **Rol:** tester
- **Probleem:** De `it.each` voor `500`/`otp_disabled` test alleen met de status `'invited'`. Niets legt vast hoe een `500` bij `'member'` wordt gelezen, waardoor bevinding 1 onopgemerkt bleef.
- **Voorstel:** Een geval toevoegen: status `'member'`, GoTrue geeft `{ status: 500 }`, verwacht `message: 'auth.error'`. Het bestaande geval met `'invited'` blijft `auth.unknownAddress`.
