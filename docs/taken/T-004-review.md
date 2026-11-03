# T-004 — review, ronde 2 (R-017: Beheerder)

`CLAUDE.md` is niet gewijzigd. Er is geen kernbeslissing geschonden:
- de rol staat in `admins`, zonder toegang voor de client;
- `create_invite` en `list_invites` controleren `is_admin()` in de databank;
- verwijderen loopt via een RLS-policy, zonder `update` voor de beheerder;
- `grant_admin` is niet uitvoerbaar voor `anon`, `authenticated` of `public`;
- alle teksten staan in `nl.json`; de codes gebruiken het token `--font-mono`.

## Bevindingen uit ronde 1

1. Stille fout op `InvitesPage` (middel): **hersteld.** `report()` geeft `false` terug bij een fout die geen verbindingsfout is. De pagina toont dan `invites.error` met `role="alert"`, zowel bij het laden als bij "Nieuwe code". Twee Playwright-tests met een 500 dekken dit. Een 500 telt volgens `isConnectionError` niet als verbindingsfout, dus de tests raken echt het nieuwe pad.
2. Anonieme oproep van `list_invites` zonder controle op `42501` (laag): **hersteld** (`tests/db/admin.test.ts:83`).
3. Criterium 3 doorgeschoven zonder verwijzing (laag): **hersteld.** `PROGRESS.md:24` vermeldt bij T-005 de knop met bevestiging, `canDelete`, `is_admin()` en "0 rijen = mislukt".
4. `README.md` en `.env.example` buiten scope (laag): **vermeld** in `docs/beslissingen.md` (die bestanden worden apart gecommit). Ze zijn nog untracked; zorg dat ze niet mee in de commit van T-004 gaan.

## Nieuwe bevindingen

### 1. Gebruikte code van een gebruiker zonder weergavenaam toont "Onbekende gebruiker"
- **Bestand:** `supabase/migrations/20261102100000_admins.sql:146`, `src/pages/InvitesPage.tsx:88`
- **Ernst:** laag
- **Rol:** ontwikkelaar
- **Probleem:** `used_by_name` is `null`, zowel als de gebruiker niet meer bestaat als wanneer hij nog geen weergavenaam koos. In het tweede geval bestaat de gebruiker wel. De tekst "Onbekende gebruiker" zet de beheerder dan op het verkeerde been.
- **Voorstel:** aanvaardbaar zoals het is. Wil je het onderscheid maken, geef dan bij `list_invites` ook terug of `used_by` nog gevuld is, en toon in het tweede geval bv. "Nog geen naam". Die tekst moet dan in `nl.json`.

### 2. Weigering van `grant_admin` niet op de soort fout getest
- **Bestand:** `tests/db/admin.test.ts:244-247`
- **Ernst:** laag
- **Rol:** tester
- **Probleem:** de test controleert alleen dat `error` niet `null` is. Een tikfout in de naam van de functie of parameter (PGRST202) zou ook slagen. De controle met `is_admin()` erna vangt het belangrijkste wel op, namelijk dat er geen beheerder bijkomt.
- **Voorstel:** verwacht `42501` voor `authenticated` en voor `anon`, zoals bij `list_invites`.
