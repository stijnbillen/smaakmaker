# T-027 — testverslag (R-027)

## Gecontroleerd
- `npx tsc --noEmit`: alleen 5 fouten, allemaal `inviteUser` ontbreekt in `src/lib/invites.ts` (testnaad die de ontwikkelaar maakt). Verder compileert alles.
- NIET gedraaid: `vitest` en `playwright ... --list` vroegen om toestemming en die is er in deze sessie niet. De ontwikkelaar/bouwloop draait ze. Er is dus niet getoond dat de e2e-bestanden laden en de unit-tests slagen.

## Afspraken die de tests veronderstellen (ontwikkelaar: houd je hieraan of meld het)
- RPC-parameters: `invite_user(p_email, p_lang)`, `resend_invitation(p_email, p_lang)`, `revoke_invitation(p_email)`, `list_invitations()` (kolommen `email`, `sent_at`, `expires_at`). Pure functie `invitation_is_valid_at(email, at)`.
- Tabellen `invitations` (`email`, `invited_by`, `lang`, `sent_at`, `accepted_at`, `accepted_by`) en `invitation_sends` (`id`, `admin_id`, `email`, `sent_at`). Ook `service_role` moet erin kunnen schrijven.
- Eigen foutcodes (niet `42501`) voor: ongeldig adres, al lid, limiet. De tests eisen alleen dat ze bestaan en onderling verschillen.
- `src/lib/invites.ts` exporteert `inviteUser(email, lang)`; roept `supabase.rpc('invite_user', { p_email, p_lang })` en daarna `createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false, storageKey } }).auth.signInWithOtp(...)` aan. Geen RPC of mail bij een ongeldig adres.
- Scherm: veld met label `invites.emailLabel` (`type=email`, `inputmode=email`, `autocapitalize=none`), knop `invites.submit`, foutmelding in `#invite-email-error` (ook voor `alreadyMember`), bevestiging `role=status` met het adres, lijstitems (`listitem`) met adres en datum, knoppen `invites.resend` en `invites.revoke`, `ConfirmDialog` met bevestigknop `invites.revokeConfirm` en annuleerknop `invites.cancel` (of `form.cancel`). `invites.rateLimited` staat als zichtbare tekst. `invites.error` in een `alert` bij een 500.
- Sjabloon: `{{ if eq .Data.lang "fr" }}` FR `{{ else if eq .Data.lang "nl" }}` NL `{{ else }}` NL+FR `{{ end }}`; 4× `{{ .ConfirmationURL }}` en 4× `{{ .Token }}` per bestand; nieuwe nl.json-tekst `invites.empty` = "Geen openstaande uitnodigingen."
- `docs/beheer.md` bevat `insert into public.invitations` en geen `generate_invite_code()`.
- De vormcheck in de databank moet gelijk zijn aan `isValidEmail` (de parity-test in `tests/db/email-invitations.test.ts` vergelijkt 14 voorbeelden, o.a. `jan@mail..be`, `jan@.mail.be`; de huidige client-regex weigert die, de voorgestelde databankregex niet. Dat is een echte afwijking: pas een van beide aan).

## Gedekt (criterium → test)
1. `email-invitations.test.ts` (42501 voor anon/gewone gebruiker op 4 functies, tabellen dicht, geen gebruiker/mail zonder uitnodiging), `admin.test.ts`.
2. db (ongeldige adressen, parity), e2e NL+FR (`#invite-email-error`, `aria-invalid`, `aria-describedby`, geen requests).
3. e2e NL+FR (mail met link + 6 cijfers, enkel de eigen taal, beheerder blijft aangemeld), db (taal in `raw_user_meta_data`, Frans-only mail in `auth-invites.test.ts`), unit (sjabloon, `inviteUser`).
4. db: `invitation_is_valid_at` op 7 d en 7 d + 1 s; `verifyOtp` met `sent_at` op −7 d + 30 s (slaagt) en −7 d − 1 s (faalt, onbevestigd).
5. db (`list_invitations`: open, nieuwste eerst, aanvaard/verlopen weg, `expires_at`), e2e (adres, datum in NL en FR, weg na aanmelden + herladen, verlopen niet getoond).
6. e2e (alertdialog, annuleren, bevestigen, code werkt niet meer), db (rij en gebruiker weg, nieuwe aanvraag maakt niets en stuurt niets).
7. db (`sent_at` = nu, oud `sent_at` + 7 d + 1 s weer geldig, nieuwe code werkt, oude niet), e2e (tweede mail, andere code).
8. db (eigen foutcode, niets geschreven), e2e NL+FR (melding bij veld, geen mail).
9. db (één rij, nieuwer `sent_at`, twee verzendrecords), e2e (tweede mail, één lijstitem).
10. db (20 gemengd slagen, 21e geweigerd en niets geschreven, per beheerder, race bij 19), e2e NL+FR (`invites.rateLimited`, geen mail).
11. db (`'  Jan@Mail.be '`, bevestigde gebruiker in hoofdletters), unit (`inviteUser` normaliseert), e2e (adres in hoofdletters met spaties).
12. unit (`invites.ts` leest enkel de twee publieke instellingen, aparte sessieloze client); `no-secrets.test.ts` ongewijzigd.

## Niet gedekt
- Exacte grens van 24 uur bij de limiet: tussen seeden en aanroepen loopt tijd, dus de grens is niet betrouwbaar te raken. Getest zijn −24 u − 1 s (telt niet) en −24 u + 10 s (telt).
- Criterium 3: "link naar de app" in de mail (redirect-doel) en het onderwerp per taal (risico: GoTrue-onderwerp mogelijk tweetalig); alleen de inhoud is getest.
- Aanmelden van de uitgenodigde via het aanmeldscherm: volgende taak. De tweede browsercontext uit criterium 5 is vervangen door `verifyOtp` met een aparte client, omdat het aanmeldscherm nog niet past.

## Aangepast aan de nieuwe werking
- `tests/helpers/supabase-admin.ts` (`createTestUser` maakt eerst een rij in `invitations`, `TestUser.inviteCode` weg, nieuwe helpers), `pg.ts`, `session.ts` (`seedLanguage`).
- `auth-invites.test.ts`, `admin.test.ts`, `auth.spec.ts` (code-scenario's weg), `invites.spec.ts`, `email-templates.test.ts`, `admin-setup.test.ts`, `i18n.test.ts`.
