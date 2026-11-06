# Smaakmaker

Web-app (PWA) om recepten bij te houden, vooral gebruikt op een gsm. Meerdere gebruikers delen één databank met recepten, foto's en reviews. Toegang via uitnodigingscode.

Zie `REQUIREMENTS.md` voor wat de app moet doen en `PROGRESS.md` voor de takenlijst.

## Kernbeslissingen (wijzig alleen na overleg met de eigenaar)
- Taal: interface Nederlands en Engels (taalkeuze door de gebruiker, besloten 2026-11-06), code/identifiers/commentaar Engels.
- Techniek: React + TypeScript (PWA), Supabase (Postgres, aanmelden met inloglink, bestandsopslag, rij-niveau-regels). Tests: Vitest (logica) en Playwright (interface, mobiele viewport).
- Tests van de Supabase-kant (rechten, limiet, aanmelden, opslag) draaien tegen een lokale Supabase (Docker Desktop, `supabase start`), nooit tegen een cloud-project. Migraties staan in `supabase/migrations/`.
- Platform: mobiel eerst (360 px breed), moderne mobiele browsers. Alleen online.
- Een recept is hoogstens 2 MB (tekst + foto's), met maximaal 3 foto's. De limiet wordt in de databank afgedwongen.
- Een recept wijzigt alleen de auteur; een beheerder kan alles verwijderen. Rechten staan in rij-niveau-regels, niet alleen in de interface.
- Varianten zijn volledig eigen recepten met een link naar het bronrecept.
- Alle zichtbare teksten staan in `nl.json` en `en.json`, met dezelfde sleutels in beide.
- Geen geheime sleutels in de client.
- Voor UI-werk: gebruik de `frontend-design`-skill (plugin `claude-plugins-official`) voor een eigen, niet-generieke stijl; kleuren, lettertypen en afstanden als tokens.
