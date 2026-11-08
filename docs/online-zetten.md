# Online zetten

Volgorde: Supabase-project, databank, e-mail via Gmail (stap 4, vóór de sjablonen in stap 3), hosting, eerste beheerder. Gebruik nooit de `service_role`- of secret-sleutel in de app of in Cloudflare. De app krijgt alleen de project-URL en de publishable (anon) sleutel.

## 1. Supabase-cloudproject
1. Maak een account op https://supabase.com en kies "New project". Kies een regio in de EU (bv. Frankfurt) en bewaar het databankwachtwoord.
2. Noteer uit Project Settings > API: de **Project URL** en de **publishable (anon) key**.
3. Noteer de **project ref** (het deel in de URL: `https://<ref>.supabase.co`).

## 2. Databank en opslag
```
npx supabase login
npx supabase link --project-ref <ref>
npx supabase db push
```
`db push` past alle migraties uit `supabase/migrations/` toe, inclusief de fotobucket en de rij-niveau-regels. Controleer daarna in het dashboard onder Storage dat de bucket bestaat.

## 3. Aanmelden instellen (Authentication)
- URL Configuration: **Site URL** = het adres van de app (stap 5), bv. `https://smaakmaker.pages.dev`. Zet hetzelfde adres in de Redirect URLs.
- Providers > Email: "Confirm email" aan, OTP-lengte **6**.
- Email Templates: plak de inhoud van `supabase/templates/confirmation.html` (onderwerp "Je code om aan te melden bij Smaakmaker") en `supabase/templates/magic_link.html` (zelfde onderwerp). De sjablonen kiezen de taal uit `user_metadata.lang`; maak ze opnieuw met `node scripts/make-email-templates.mjs` na een tekstwijziging.
- Zet "Allow new users to sign up" (`enable_signup`) aan: de uitnodiging maakt het account via de publieke aanmeldaanroep, en de databank weigert wie niet is uitgenodigd.
- Eigen SMTP is nodig (stap 4): de standaardmail van Supabase haalt 20 uitnodigingen per dag niet.

## 4. E-mail via Gmail
Doe deze stap vóór het sjabloon-deel van stap 3: Supabase Cloud laat je de mailsjablonen pas aanpassen na het instellen van eigen SMTP. Gmail verstuurt zelf en ondertekent de mails, dus ze komen aan (Brevo met een Gmail-adres als afzender wordt geweigerd door Google, Yahoo en Microsoft).
1. Zet tweestapsverificatie aan op het Google-account.
2. Maak een app-wachtwoord op https://myaccount.google.com/apppasswords, noem het "Smaakmaker" en bewaar de code van 16 tekens. Dit is een geheim: zet het alleen in Supabase, nooit in de repo of in Cloudflare.
3. Supabase > Project Settings > Authentication > SMTP Settings, zet "Custom SMTP" aan:
   - Host `smtp.gmail.com`, poort `465`
   - Gebruiker = het Gmail-adres, wachtwoord = het app-wachtwoord (niet het gewone wachtwoord)
   - Afzender = hetzelfde Gmail-adres, naam "Smaakmaker"
4. Verhoog onder Authentication > Rate Limits het aantal mails per uur naar wat je nodig hebt. Gmail laat ongeveer 500 mails per dag toe.
5. Test: vraag in de app een code aan met een tweede adres en controleer dat de mail aankomt.
6. Groeit de app, dan is een eigen domein met Resend of Brevo de nettere oplossing.

## 5. Hosting op Cloudflare (Workers & Pages)
Cloudflare maakt nieuwe projecten als Worker met statische bestanden. `wrangler.jsonc` in de repo zegt dat `dist` de site is en dat onbekende paden `index.html` krijgen (nodig voor routes zoals `/recepten`).
1. Workers & Pages > Create > koppel de repo `stijnbillen/smaakmaker`, projectnaam `smaakmaker` (zelfde naam als in `wrangler.jsonc`).
2. Productietak `master`. Build command `npm run build`. Deploy command `npx wrangler deploy`.
3. Zet de twee variabelen als **build-variabelen**, niet als runtime-variabelen: Settings > Build > Variables and secrets. Vite stopt ze tijdens het bouwen in de app; runtime-variabelen (Settings > Variables and secrets) bereiken de app niet.
   - `VITE_SUPABASE_URL` = Project URL uit stap 1
   - `VITE_SUPABASE_ANON_KEY` = publishable key uit stap 1
4. Start een nieuwe build (na het toevoegen van variabelen is een nieuwe build nodig).
5. Zet het adres van de site (`https://smaakmaker.<account>.workers.dev`, zie Domains) in de Supabase URL Configuration (stap 3).

## 6. Eerste beheerder
Zie `docs/beheer.md`. Draai de SQL in de SQL-editor van het Supabase-dashboard:
1. `insert into public.invitations (email) values ('jouw@adres.be');` (kleine letters)
2. Vraag in de app een code aan met dat e-mailadres en meld je aan.
3. `select public.grant_admin('jouw@adres.be');`

## 7. Controle op je gsm
Open het adres, meld je aan, voeg een recept met foto toe, kies "Toevoegen aan startscherm". Nodig daarna als beheerder een tweede persoon uit met een e-mailadres.
