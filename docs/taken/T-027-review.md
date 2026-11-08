# T-027 — review (R-027), ronde 3 (na "eindcontrole faalt")

Bekeken: de werkkopie tegen `4cf8e41`:
- de migratie `20261108100000_email_invitations.sql`;
- `src/lib/invites.ts`, `src/pages/InvitesPage.tsx`, `nl.json`/`fr.json`, `base.css`;
- `scripts/make-email-templates.mjs` en de twee sjablonen;
- de testhelpers (`supabase-admin.ts`, `pg.ts`, `session.ts`);
- `tests/db/email-invitations.test.ts`, `auth-invites.test.ts`, `admin.test.ts`;
- `tests/unit/invites.test.ts`, `email-templates.test.ts`, `i18n.test.ts`, `admin-setup.test.ts`;
- `tests/e2e/invites.spec.ts` en `auth.spec.ts`.

`CLAUDE.md` en `REQUIREMENTS.md` zijn niet gewijzigd. Er wordt geen kernbeslissing geschonden:
- de mail gaat met de anon-sleutel via een aparte client zonder sessie (`persistSession: false`, eigen `storageKey`);
- rechten en limiet zitten in `security definer`-functies met `is_admin()` (`42501`). De tabellen zijn dicht via RLS zonder policies en `revoke all`;
- de geldigheid wordt afgedwongen in `handle_user_created` en in `handle_user_confirmed` (atomische update in `accept_invitation`);
- de limiet is tegen races beschermd met `pg_advisory_xact_lock` per beheerder;
- alle nieuwe teksten staan met dezelfde sleutels in `nl.json` en `fr.json`;
- er is één nieuwe migratie en er wordt geen tabel met gegevens gewist (`invites` blijft als archief).

Alle 12 criteria hebben een test die faalt als het gedrag ontbreekt. Ik vond geen fouten van ernst hoog of middel. De tussenstand van `src/lib/auth.ts:45-58` (`check_invite`/`refresh_pending_invite` bestaan niet meer) staat in het plan en hoort bij T-028.

Er is geen scope bij gekomen die niet in de taak hoort.

## Bevindingen

### 1. `tests/db/email-invitations.test.ts:415`: de verliezer van de race hoeft niet de limietcode te geven (open uit ronde 2)
- **Ernst:** laag
- **Rol:** tester
- **Probleem:** de test eist alleen `!== '42501'`. Een deadlock of een fout op een unieke sleutel zou ook slagen. Het risico is klein, want de test eist ook precies 1 succes en `countInvitationSends === 20`.
- **Voorstel:** vergelijk met de code van een gewone 21e aanroep (`IV003`), zoals regel 437 doet voor "al lid".

### 2. `tests/e2e/invites.spec.ts:217`: "link naar de app" niet gecontroleerd (open uit ronde 2)
- **Ernst:** laag
- **Rol:** tester
- **Probleem:** de test eist alleen `mail.link !== null`. Hij controleert niet dat de redirect naar de app wijst (`emailRedirectTo` in `src/lib/invites.ts:67`).
- **Voorstel:** eis dat `mail.link` `redirect_to=` bevat met de origin van de app.

### 3. `src/pages/InvitesPage.tsx:22,80`: `invites.rateLimited` maakt het veld `aria-invalid`
- **Ernst:** laag
- **Rol:** ontwikkelaar
- **Probleem:** de limiet zegt niets over het adres. Toch krijgt het veld `aria-invalid="true"` en hangt de melding eraan. Een schermlezer meldt het adres dan als ongeldig. Het criterium vraagt alleen "een duidelijke melding".
- **Voorstel:** toon `invites.rateLimited` in het `role="alert"`-blok onder het formulier. Laat `FIELD_MESSAGES` dan beperkt tot `invalidEmail` en `alreadyMember`. De e2e-test (regel 362) zoekt met `getByText`, dus die blijft geldig.

### 4. `docs/beheer.md:40` en `docs/online-zetten.md:21`: onderwerp verschilt van `supabase/config.toml:249,253` (open uit ronde 1)
- **Ernst:** laag
- **Rol:** ontwikkelaar
- **Probleem:**
  - `beheer.md` noemt "… / Your code to sign in to Smaakmaker" (Engels);
  - `online-zetten.md` noemt alleen het Nederlandse deel;
  - `config.toml` gebruikt "… / Votre code pour vous connecter à Smaakmaker".

  Wie de docs volgt, zet in de cloud een ander onderwerp dan lokaal.
- **Voorstel:** neem op beide plaatsen letterlijk het onderwerp uit `config.toml` over.

### 5. `docs/beslissingen.md:428`: onderwerp per taal niet geprobeerd (open uit ronde 1)
- **Ernst:** laag
- **Rol:** ontwikkelaar
- **Probleem:** R-027 crit. 3 vraagt een mail "in de taal van de beheerder", maar het onderwerp blijft tweetalig. Het plan vroeg de uitkomst vast te leggen. Er staat alleen "niet geprobeerd".
- **Voorstel:** probeer `{{ if eq .Data.lang "fr" }}` in `subject` lokaal uit. Lukt het niet, noteer dan waarom.
