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
- **Retry-registratie volgt de levensduur van het scherm:** pagina's roepen bij unmount `resolve(KEY)` aan en negeren late antwoorden (vlag `active`/`mounted`), zodat "Opnieuw proberen" nooit een verlaten actie uitvoert. Het formulier negeert dubbel tikken zolang `save` loopt.
- **Geen `overflow-x: hidden`:** overloop wordt niet verborgen maar door de lay-outtest gevangen; lange tekst wordt met `overflow-wrap: anywhere` opgevangen.

## T-002 — Navigatie en visuele stijl (2026-11-01, analyse)

- **Eén bron voor tokens:** `src/styles/tokens.css` (CSS custom properties in `:root`). Geen tweede bron in TypeScript.
- **Naamgeving van kleurtokens:** `--color-bg-*` (achtergrond), `--color-text-*` (tekst), `--color-<naam>` met `--color-on-<naam>` (tekst/icoon erop), `--color-focus`, `--color-theme`. De contrasttest leunt op deze namen: elke `text-*` tegenover elke `bg-*`, elke `on-x` tegenover `x`, en de focuskleur ≥ 3 : 1 tegenover elke `bg-*`. Wordt de accentkleur als tekst gebruikt (links, actieve navigatie), dan gaat dat via `--color-text-accent` (verwijst naar `--color-accent`), zodat de test die combinatie ook controleert.
- **Letterlijke kleur buiten tokens:** alleen `<meta name="theme-color">` in `index.html` en `theme_color`/`background_color` van het manifest, omdat die geen CSS-variabele kunnen zijn. Een test houdt ze gelijk aan `--color-theme` en `--color-bg`.
- **Lettertypen zelf gehost** (`woff2`, `font-display: swap`), mee in de precache van de app-shell; geen extern CDN.
- **Routes:** `/favorieten` en `/profiel`, Nederlands zoals `/nieuw`. Actieve ingang via `NavLink` (`aria-current="page"`).
- **Lijsttoestanden:** één gedeelde component `ListState` (laden met `role="status"`, leeg met tekst uit `nl.json`). Elke latere lijst gebruikt die.
- **Verminderde beweging:** duur-tokens op `0ms` plus een globale regel die `animation`/`transition` uitschakelt onder `prefers-reduced-motion: reduce`.
- **Iconen in de navigatie:** inline SVG met `currentColor`, `aria-hidden`; het label staat altijd zichtbaar naast of onder het icoon.

### T-002 — bouw
- **Stijlrichting "warme keuken":** crèmekleurig papier (`--color-bg`), espressobruine tekst, tomaatrode accentkleur en een zachte serif (Fraunces) voor koppen met Figtree voor lopende tekst. Focuskleur is blauw (`--color-focus`) zodat de ring ook op de rode accenten opvalt.
- **Lettertypen:** `@fontsource/fraunces` (600) en `@fontsource/figtree` (400, 600), alleen de Latijnse subset, geïmporteerd in `main.tsx`. Vite neemt ze mee in de build en `woff2` staat in de Workbox-`globPatterns`.
- **Ruimte voor de navigatie:** `padding-bottom` staat op `body` (niet op een pagina) met token `--space-nav-clearance` (= `--nav-height` + `--space-4`), zodat de scanner `--space-*` blijft afdwingen en geen element onder de balk eindigt.
- **Verminderde beweging:** duur-tokens op `0ms` plus een globale `animation: none`/`transition: none`-regel. De tegenproef blijft geldig omdat links, knoppen, invoervelden en de laadindicator wel overgangen/animaties hebben zonder de voorkeur.
- **Lay-out per route:** `AppLayout` (banner, `Outlet`, `BottomNav`) is een layout-route, zodat T-003 het aanmeldscherm erbuiten kan zetten.
- **Link "Nieuw recept" op het overzicht weggehaald:** "Nieuw" staat al in de navigatie. De terugknop op `/nieuw` is een rustige omlijnde variant.
- **Favorieten:** gebruikt `ListState` met een lege lijst; T-017 geeft `null` door tijdens het laden.
- **Iconen (PWA):** `scripts/make-icons.mjs` tekent tomaatrood met een crème ring; zelfde bestandsnamen en afmetingen.
- **Laadtoestand stopt bij elke fout:** `RecipeListPage` houdt `errored` bij; bij een verbindingsfout verschijnt de banner en verdwijnt de laadindicator, zodat er geen eeuwige "laden…" naast de melding staat.

## T-003 — Aanmelden met uitnodigingscode (2026-11-01, analyse)

- **Inloglink én code uit één mail** (keuze van de eigenaar, `VRAGEN.md`): Supabase Auth met `signInWithOtp` en `verifyOtp({ type: 'email' })`. De templates `confirmation` en `magic_link` bevatten allebei `{{ .ConfirmationURL }}` en `{{ .Token }}`. `otp_length = 6`.
- **Impliciete flow, geen PKCE:** de inloglink moet ook werken in een andere browser dan waarin hij werd aangevraagd (Safari tegenover de geïnstalleerde app op iPhone).
- **Uitnodiging afgedwongen met een trigger op `auth.users`:** bij `insert` moet `raw_user_meta_data.invite_code` geldig zijn, anders volgt een exception. De code wordt pas verbruikt als `email_confirmed_at` gezet wordt (atomische `update … where used_by is null`), zodat een tikfout in het e-mailadres de code niet verbrandt. Wie eerst bevestigt, wint. Een gebruiker die via de beheer-API meteen bevestigd wordt aangemaakt, verbruikt de code bij `insert`.
- **Geldigheid:** `now() <= created_at + interval '7 days'` (grens inbegrepen). De grenslogica zit in een pure functie `invite_is_valid_at(code, at)`, zodat ze testbaar is zonder te wachten.
- **Voorcontrole in de client:** `check_invite(code)` is een smalle `security definer`-functie die alleen een boolean teruggeeft, voor een nette melding vóór het versturen van de mail. Een algemene 500 van GoTrue ("Database error saving new user") wordt ook "Deze code is niet geldig.".
- **`invites` dicht voor de client:** RLS staat aan zonder policies. De beheerderstaak voegt het lezen en aanmaken voor beheerders toe.
- **Profielen:** `profiles` (1 op 1 met `auth.users`) wordt door de trigger aangemaakt met `display_name` null. De gebruiker kiest de naam pas na de eerste bevestiging, op `/welkom`. De naam wordt getrimd en telt 2 tot 40 tekens (`char_length`), afgedwongen met een check. Iedere aangemelde gebruiker leest alle profielen; alleen de eigen `display_name` mag gewijzigd worden (kolomrecht). Een naam hoeft niet uniek te zijn.
- **Aanmeldscherm:** één scherm `/aanmelden` (zonder navigatiebalk) met een e-mailadres en een optioneel veld "Uitnodigingscode" achter "Ik heb een uitnodigingscode". Zonder code geldt `shouldCreateUser: false`; een onbekend adres geeft "Geen account met dit e-mailadres. Heb je een uitnodigingscode?". Het codeveld gebruikt `inputmode="numeric"` en `autocomplete="one-time-code"`.
- **Routebewaking:** `RequireAuth` rond `AppLayout`. Zonder sessie gaat de gebruiker naar `/aanmelden`, zonder naam naar `/welkom`.
- **Datumnotatie:** `Intl.DateTimeFormat('nl-BE', { day: 'numeric', month: 'long', year: 'numeric' })`, bv. "1 november 2026". De component `AuthorLine` toont naam en datum, en reviews en de detailpagina gebruiken die later ook.
- **Mailteksten uit `nl.json`:** `scripts/make-email-templates.mjs` genereert `supabase/templates/*.html` uit de sleutels `email.*`. Een test bewaakt dat de templates gelijk lopen met `nl.json`. In het cloud-project moeten dezelfde templates bij uitrol gezet worden.
- **Testhulp:**
  - `createTestUser` maakt eerst een uitnodiging aan, geeft de code mee in `user_metadata` en zet een `display_name`.
  - Mails komen uit de lokale Mailpit.
  - Het terugzetten van een verzendtijdstip (verlopen code) gebeurt via een directe Postgres-verbinding op de lokale poort 54322, alleen in `tests/helpers/`.
- **Lokale configuratie:**
  - `additional_redirect_urls` bevat `http://127.0.0.1:4173` (preview) en `http://localhost:5173` (dev).
  - `auth.rate_limit.email_sent` wordt lokaal verhoogd zodat tests niet vastlopen.

### T-003 — bouw
- **`enable_confirmations = true` (lokaal):** een nieuwe gebruiker krijgt zo de bevestigingsmail (link + code) en `email_confirmed_at` wordt pas bij `verifyOtp` of de link gezet. Daarop hangt het verbruik van de uitnodiging. Dit is ook de standaard in een cloud-project.
- **"Gebruikt" = `used_at` gevuld, niet `used_by`:** verwijderen van een gebruiker zet `used_by` op null (`on delete set null`); de code mag daardoor niet opnieuw bruikbaar worden.
- **Migratie op bestaande gegevens:** `20261101120000_auth_invites_profiles.sql` vult eerst profielen voor bestaande gebruikers aan en legt daarna pas `recipes.author_id → profiles(id)` vast; geen tabel wordt gewist. Het overzicht haalt de naam op met `author:profiles(display_name)`.
- **Lokale mailinstellingen:** `max_frequency = "1ms"` (`"0s"` valt terug op de standaard van 60 s) en hoge limieten voor `email_sent`, `sign_in_sign_ups` en `token_verifications`, zodat tests hetzelfde adres snel na elkaar kunnen aanvragen. In de cloud blijven de strenge standaardwaarden staan.
- **Mailsjablonen:** beide sjablonen zijn gelijk en komen uit `scripts/make-email-templates.mjs`. De kleuren staan er letterlijk in omdat mailprogramma's geen CSS-variabelen kennen (waarden uit `tokens.css`).
- **Banner tijdens het laden van het profiel:** `RequireAuth` toont `ConnectionBanner` ook in de laadtoestand. Zonder dat zou een verbindingsfout bij het laden van het profiel geen "Opnieuw proberen" geven, want `AppLayout` bestaat dan nog niet.
- **Veldfouten:** vaste ids (`email-error`, `invite-error`, `code-error`, `name-error`) met `aria-describedby` en `aria-invalid`; geen `useId`, zodat de ids bruikbaar zijn als CSS-selector.
- **Datum in Brussel:** `formatDate` zet `timeZone: 'Europe/Brussels'` vast, zodat de dag niet van het toestel afhangt.
- **T-003, onbevestigde gebruiker herbegint met nieuwe code:** gecontroleerd op de vastgelegde GoTrue: een herhaalde `signInWithOtp` voor een bestaand adres werkt `raw_user_meta_data` niet bij (alleen `confirmation_sent_at`), dus de nieuwe code bereikt de databank nooit. Daarom verwijdert `drop_stale_pending_users()` onbevestigde gebruikers waarvan de opgeslagen code niet meer geldig is; de volgende aanvraag maakt dan een verse gebruiker met de nieuwe code. Dit loopt bij elke wijziging van `invites` (trigger, dekt de verliezer van de race) en via `refresh_pending_invite` (de client roept ze aan vóór `signInWithOtp`, dekt verloop zonder gebeurtenis). Gekozen boven de opgeslagen code vervangen, wat niet kan, en bevestigde gebruikers blijven onaangeroerd. **Deels vervangen:** sinds migraties 20261101140000 (opruiming per adres in `refresh_pending_invite`) en 20261101150000 (trigger alleen voor gewijzigde codes) roept niets `drop_stale_pending_users()` nog aan; de functie blijft ongebruikt staan en kan in een latere migratie weg.

- `refresh_pending_invite(p_email, p_code)` ruimt alleen de onbevestigde gebruiker van dat adres op (migratie 20261101140000), niet alle adressen; de functie vervangt geen opgeslagen code, ze verwijdert een verouderde rij zodat de nieuwe aanvraag een verse gebruiker maakt.

- **Opruiming bij wijziging van een uitnodiging beperkt tot de gewijzigde codes (T-003, review):** de statement-trigger op `invites` gebruikt een transition table en verwijdert alleen onbevestigde gebruikers met een geraakte code. Zo wist een bevestiging door iemand anders geen onbevestigd adres dat toevallig ook een verlopen code heeft.

## pg als testafhankelijkheid (goedgekeurd door de eigenaar, 2026-11-02)
`pg` en `@types/pg` staan als devDependency in package.json. Gebruik ze voor directe SQL in tests (tests/helpers/pg.ts) in plaats van de Supabase-CLI per query. Niet gebruiken in de app zelf (src/).
