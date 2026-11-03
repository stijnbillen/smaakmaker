# Beheer

Deze stappen doe je buiten de app, in de SQL-editor van Supabase of met `psql`. Gebruik nooit de service-sleutel in de app.

## De eerste uitnodigingscode

Nog niemand kan een code aanmaken zolang er geen beheerder is. Maak de eerste code met SQL:

```sql
insert into public.invites (code) values (public.generate_invite_code()) returning code;
```

De code is 7 dagen geldig. Meld je ermee aan en kies een weergavenaam.

## De eerste beheerder

Daarna maak je die gebruiker beheerder, met het e-mailadres waarmee hij zich aanmeldde:

```sql
select public.grant_admin('naam@voorbeeld.be');
```

Een onbekend adres geeft een fout. Twee keer uitvoeren kan geen kwaad.

## Volgende beheerders

Op dezelfde manier: `select public.grant_admin('…');`. In de app is er geen scherm om iemand beheerder te maken.

## Nieuwe codes

Een beheerder maakt codes aan op Profiel > Uitnodigingen.
