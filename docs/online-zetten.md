# Online zetten

Volgorde: Supabase-project, databank, e-mail, hosting, eerste beheerder. Gebruik nooit de `service_role`- of secret-sleutel in de app of in Cloudflare. De app krijgt alleen de project-URL en de publishable (anon) sleutel.

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
- Email Templates: plak de inhoud van `supabase/templates/confirmation.html` (onderwerp "Je code om aan te melden bij Smaakmaker") en `supabase/templates/magic_link.html` (zelfde onderwerp).

## 4. E-mail via Resend
1. Account op https://resend.com. Voor mails naar iedereen: verifieer een eigen domein (DNS-records). Zonder domein verstuurt Resend alleen naar je eigen adres.
2. Maak een API-sleutel.
3. Supabase > Project Settings > Authentication > SMTP Settings, zet "Custom SMTP" aan:
   - Host `smtp.resend.com`, poort `465`
   - Gebruiker `resend`, wachtwoord = de API-sleutel
   - Afzender: een adres op je geverifieerde domein, naam "Smaakmaker"
4. Verhoog onder Authentication > Rate Limits het aantal mails per uur naar wat je nodig hebt.

## 5. Hosting op Cloudflare Pages
1. https://dash.cloudflare.com > Workers & Pages > Create > Pages > Connect to Git > repo `stijnbillen/smaakmaker`.
2. Productietak: `master`. Build command `npm run build`, output directory `dist`.
3. Environment variables (productie):
   - `VITE_SUPABASE_URL` = Project URL uit stap 1
   - `VITE_SUPABASE_ANON_KEY` = publishable key uit stap 1
4. Deploy. Cloudflare Pages geeft bij onbekende paden `index.html` terug, dus routes zoals `/recepten` werken zonder extra bestand.
5. Zet het adres dat Cloudflare geeft in de Supabase URL Configuration (stap 3).

## 6. Eerste beheerder
Zie `docs/beheer.md`. Draai de SQL in de SQL-editor van het Supabase-dashboard:
1. `insert into public.invites (code) values (public.generate_invite_code()) returning code;`
2. Meld je in de app aan met die code en je e-mailadres.
3. `select public.grant_admin('jouw@adres.be');`

## 7. Controle op je gsm
Open het adres, meld je aan, voeg een recept met foto toe, kies "Toevoegen aan startscherm". Maak daarna als beheerder een code aan voor een tweede persoon.
