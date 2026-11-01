# Technische beslissingen

Keuzes die tijdens de bouw vallen en geen kernbeslissing zijn. Kernbeslissingen staan in `CLAUDE.md`.

## T-001 — Projectbasis (2026-11-01)

- **Bouwtool en PWA:** Vite met `vite-plugin-pwa` (Workbox). Het manifest wordt door de plugin gegenereerd naar `dist/manifest.webmanifest`.
- **Geen runtime-cache voor de databank:** de service worker cachet alleen de app-shell (de gebouwde bestanden). Verzoeken naar de Supabase-URL worden nooit gecachet, want de app werkt alleen online en nieuwe recepten moeten na herladen zichtbaar zijn.
- **`npm test`:** voert `vitest run && playwright test` uit, eenmalig en zonder watch-modus. Vitest dekt de logica, de controles op de build (`dist/`) en de databanktests tegen de lokale Supabase. Playwright dekt de interface op 360 × 640.
- **Alleen lokale Supabase in tests:** de tests weigeren te starten als `VITE_SUPABASE_URL` niet naar `localhost`/`127.0.0.1` wijst.
- **Service-sleutel alleen in testhulp:** de omgevingsvariabele heeft geen `VITE_`-voorvoegsel en wordt alleen in `tests/helpers/` gelezen. `src/` leest alleen `VITE_SUPABASE_URL` en `VITE_SUPABASE_ANON_KEY`.
- **Voorlopige `recipes`-tabel:** een minimale tabel (`id`, `title`, `author_id`, `created_at`) met rij-niveau-regels: aangemelde gebruikers lezen, invoegen alleen als eigen auteur, geen anonieme toegang. Dat volstaat om criterium 3 van R-001 te testen. R-003 breidt de tabel uit (validatie, bewerken, verwijderen). Dit is geen eindontwerp.
- **Voorlopig formulier op `/nieuw`:** alleen een titelveld, zodat het behoud van formulierinvoer bij een verbindingsfout te testen is. R-003 vervangt het.
- **Wanneer de verbindingsmelding verschijnt:** bij een netwerkfout zonder antwoord (`fetch` mislukt) of bij een gateway-fout 502/503/504. Andere 4xx/5xx-fouten (zoals een weigering door een rij-niveau-regel of een validatiefout) tonen de verbindingsmelding niet.
- **Hoe de verbindingsmelding verschijnt:** als een banner of overlay via een context-provider rond de routeboom, dus geen vervangend scherm. Zo blijft de status van formulieren bewaard. "Opnieuw proberen" voert de mislukte actie opnieuw uit, zonder de pagina te herladen.
- **"Alle schermen" testen:** voor de controles op 360 px en op de tikdoelen staat één routelijst in `tests/e2e/routes.ts`. Elke taak die een scherm toevoegt, zet het in die lijst.
- **Tikdoelen:** de test controleert zichtbare `button`, `a[href]`, `[role=button]`, aankruisvakjes en keuzerondjes, en elementen met `data-tap-target` (zoals tags) op ≥ 44 × 44 px.
- **Verbindingsfouten in de code:** een context-provider houdt per actie een "opnieuw"-functie bij; de banner (`role="alert"`) staat boven de routes, dus formulierstatus blijft. postgrest-js geeft de HTTP-status naast de fout; de provider voegt die samen voor `isConnectionError`.
- **Geen stille retries van de client:** `db.retry: false` en `cache: 'no-store'` in de Supabase-client. postgrest-js herhaalt anders GET's met backoff (seconden), waardoor de melding te laat komt; de gebruiker herhaalt zelf via "Opnieuw proberen".
- **Playwright bouwt zelf:** de `webServer` draait `npm run build` met de lokale publieke sleutels en daarna `vite preview`, zodat de e2e-bundel altijd naar de lokale Supabase wijst.
- **Supabase CLI als devDependency:** `supabase` staat in `package.json` zodat `supabase status` (testhulp) via npm-scripts werkt zonder losse installatie.
- **Voorlopige iconen:** effen vlakken, gemaakt met `scripts/make-icons.mjs`; de stijltaak vervangt ze.
- **Sessie in e2e-tests vóór R-002:** de test meldt zich via de API aan met een testgebruiker en zet de sessie in de browseropslag. De versie van `supabase-js` ligt vast in de lockfile.
