# Beheer

Deze stappen doe je buiten de app, in de SQL-editor van Supabase of met `psql`. Gebruik nooit de service-sleutel in de app.

## De eerste uitnodiging

Nog niemand kan uitnodigen zolang er geen beheerder is. Leg de eerste uitnodiging vast met SQL, voor je eigen e-mailadres (kleine letters):

```sql
insert into public.invitations (email) values ('naam@voorbeeld.be');
```

De uitnodiging is 7 x 24 uur geldig. Vraag daarna in de app een code aan met dat adres, meld je aan en kies een weergavenaam.

## De eerste beheerder

Daarna maak je die gebruiker beheerder, met het e-mailadres waarmee hij zich aanmeldde:

```sql
select public.grant_admin('naam@voorbeeld.be');
```

Een onbekend adres geeft een fout. Twee keer uitvoeren kan geen kwaad.

## Volgende beheerders

Op dezelfde manier: `select public.grant_admin('…');`. In de app is er geen scherm om iemand beheerder te maken.

## Gebruikers uitnodigen

Een beheerder typt op Profiel > Uitnodigingen een e-mailadres. De app legt de uitnodiging vast en stuurt meteen een mail met inloglink en code van 6 cijfers, in de taal die de beheerder op dat moment gebruikt.

- Een uitnodiging is 7 x 24 uur geldig. De lijst toont alleen openstaande uitnodigingen; wie zich aanmeldt of te laat is, verdwijnt eruit.
- **Opnieuw mailen** stuurt een nieuwe code en de 7 dagen beginnen opnieuw. Hetzelfde adres nog eens invoeren doet hetzelfde.
- **Intrekken** (met bevestiging) wist de uitnodiging en het nog onbevestigde account. Een eerdere code werkt dan niet meer.
- Een adres dat al een account heeft, wordt niet uitgenodigd.
- Een beheerder kan hoogstens 20 uitnodigingen per 24 uur versturen (opnieuw mailen telt mee).

## Tweetalige inlogmail (bij uitrol)
`supabase/config.toml` geldt alleen lokaal. De sjablonen kiezen de taal uit `user_metadata.lang` (de uitnodiging zet die); zonder taal blijft de mail tweetalig. Zet in het cloud-project (Authentication → Email Templates) voor **Confirm signup** en **Magic Link** het onderwerp uit `config.toml` (`Je code om aan te melden bij Smaakmaker / Your code to sign in to Smaakmaker`) en de inhoud van `supabase/templates/confirmation.html` en `magic_link.html`. Genereer ze na een tekstwijziging met `node scripts/make-email-templates.mjs`.
