# T-027 — review (R-027), ronde 2

Bekeken: de werkkopie tegen `22411ce`: migratie `20261108100000_email_invitations.sql`, `src/lib/invites.ts`, `src/pages/InvitesPage.tsx`, i18n, sjablonen, `base.css`, testhelpers, `tests/db/email-invitations.test.ts`, `tests/unit/invites.test.ts`, `tests/e2e/invites.spec.ts` en de docs.

`CLAUDE.md` is niet gewijzigd. `REQUIREMENTS.md` is ook niet gewijzigd. Er wordt geen kernbeslissing geschonden:
- de mail gaat met de anon-sleutel via een aparte, sessieloze client;
- de rechten en de limiet zitten in `security definer`-functies met `is_admin()`, en de tabellen zijn dicht;
- de geldigheid wordt afgedwongen in de triggers op `auth.users`;
- alle teksten staan in `nl.json`/`fr.json`;
- er is één nieuwe migratie en er worden geen gegevens gewist (`invites` blijft als archief).

Bevinding 1 uit ronde 1 (racetest) is opgelost: de test eist nu precies 1 succes, precies 1 mislukking en `countInvitationSends === 20`.

## Bevindingen

### 1. `tests/db/email-invitations.test.ts:415`: de mislukte racer hoeft niet de limietcode te geven
- **Ernst:** laag
- **Rol:** tester
- **Probleem:** de test eist alleen `!== '42501'`. Een andere fout zou ook slagen, bijvoorbeeld een deadlock of een unieke sleutel. Samen met "precies 1 succes" en "20 verzendingen" is het risico klein.
- **Voorstel:** vergelijk met de code van een gewone 21e aanroep, zoals de test op regel 437 dat al doet voor "al lid".

### 2. `docs/beslissingen.md` (T-027, "Taal in de mail"): onderwerp per taal niet geprobeerd (open uit ronde 1)
- **Ernst:** laag
- **Rol:** ontwikkelaar
- **Probleem:** R-027 crit. 3 vraagt een mail "in de taal van de beheerder". Het onderwerp blijft tweetalig. Het plan vroeg om de uitkomst te noteren als GoTrue dat toelaat, maar er staat alleen "niet geprobeerd".
- **Voorstel:** probeer lokaal `{{ if eq .Data.lang "fr" }}` in `subject` in `config.toml`, of noteer waarom het niet kan.

### 3. `docs/online-zetten.md:21` en de sectie "Tweetalige inlogmail": onderwerp verschilt van `supabase/config.toml:249,253` (open uit ronde 1)
- **Ernst:** laag
- **Rol:** ontwikkelaar
- **Probleem:** de docs noemen "Je code om aan te melden bij Smaakmaker" en "… / Your code to sign in to Smaakmaker". `config.toml` gebruikt "… / Votre code pour vous connecter à Smaakmaker". Wie de docs volgt, zet in de cloud een ander onderwerp dan lokaal, deels in het Engels.
- **Voorstel:** neem op beide plaatsen letterlijk het onderwerp uit `config.toml` over.

### 4. `docs/beheer.md:13` en `docs/online-zetten.md:49-50`: de stappen voor de eerste aanmelding werken pas na T-028 (open uit ronde 1)
- **Ernst:** laag
- **Rol:** ontwikkelaar
- **Probleem:** "Vraag in de app een code aan met dat adres" gaat nu via `src/lib/auth.ts:45-58`:
  - zonder code: `shouldCreateUser: false`, dus voor een nieuw adres komt er geen account;
  - met code: `check_invite`/`refresh_pending_invite`, en die functies dropt deze migratie.

  De tussenstand staat in `beslissingen.md`, maar niet bij de stappen zelf.
- **Voorstel:** zet bij stap 6 "pas bruikbaar na T-028", of laat T-028 deze stappen expliciet nakijken.

### 5. `tests/e2e/invites.spec.ts:217`: "link naar de app" niet gecontroleerd
- **Ernst:** laag
- **Rol:** tester
- **Probleem:** crit. 3 vraagt een inloglink. De test eist alleen `mail.link !== null` en niet dat de redirect naar de app wijst (`emailRedirectTo`). `T-027-tests.md` meldt dat al als niet gedekt.
- **Voorstel:** controleer dat de link `redirect_to=` met de origin van de app bevat.
