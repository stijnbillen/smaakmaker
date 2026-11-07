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
- **Voorlopige iconen:** effen vlakken, gemaakt met `scripts/make-icons.mjs`; de stijltaak vervangt ze. Vervangen door T-026.
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
- **Iconen (PWA):** `scripts/make-icons.mjs` tekent tomaatrood met een crème ring; zelfde bestandsnamen en afmetingen. Vervangen door T-026.
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

## T-004 — Beheerder (2026-11-02, analyse)

- **Beheerdersrol in een eigen tabel `admins`:** `user_id` verwijst naar `profiles`. RLS staat aan, zonder policies en zonder grants voor de client. Er komt geen kolom op `profiles`, zodat de rol nooit via het kolomrecht op `profiles` of een policy-fout te wijzigen is. `is_admin()` (`security definer`) is de enige toegang voor de client en elke latere regel (reviews, foto's) gebruikt die functie.
- **Beheerder worden alleen met SQL:** `grant_admin(p_email)` is niet uitvoerbaar voor `anon` en `authenticated`. Je gebruikt het in de SQL-editor of met `psql`. Dat geldt voor de eerste en voor elke volgende beheerder; er komt geen scherm voor. De stappen staan in `docs/beheer.md`.
- **Uitnodigingen alleen via functies:** `create_invite()` en `list_invites()` (`security definer`) geven `42501` voor wie geen beheerder is. `invites` krijgt geen grants of policies, zodat een beheerder ook geen eigen (zwakke) code kan invoegen.
- **Codeformaat:** 10 tekens uit `ABCDEFGHJKMNPQRSTUVWXYZ23456789`, zonder 0/O en 1/I/L. Gemaakt met `extensions.gen_random_bytes` in `generate_invite_code()`. Bij een botsing op `unique` probeert `create_invite` opnieuw. De client zet een ingetypte code om naar hoofdletters.
- **Status in de databank:** de pure functie `invite_status(created_at, used_at, at)` geeft `open`, `gebruikt` of `verlopen`. "Gebruikt" gaat voor "verlopen". De grens is dezelfde als in `invite_is_valid_at`. Een code die aan een onbevestigde gebruiker hangt, is "open" tot de bevestiging. Een gebruikte code waarvan de gebruiker niet meer bestaat, toont "Onbekende gebruiker".
- **Vervaldatum met uur:** `formatDateTime` geeft "9 november 2026 om 14:05" (Europe/Brussels), want de grens ligt op de seconde.
- **Scherm en navigatie:** route `/uitnodigingen`, met een link op Profiel die alleen beheerders zien. De navigatie houdt vier ingangen; "Profiel" blijft actief op `/uitnodigingen`. `RequireAdmin` stuurt een gewone gebruiker naar `/profiel`. `isAdmin` wordt in `AuthProvider` samen met het profiel geladen.
- **Geen intrekken van codes:** een beheerder kan een open code niet verwijderen. Geen criterium vraagt erom.
- **Verwijderen van recepten:** policy `recipes delete by author or admin` (`author_id = auth.uid() or is_admin()`), plus `grant delete` aan `authenticated`. Een beheerder krijgt geen `update`. RLS geeft bij een geweigerde `delete` 0 rijen en geen fout; de interface behandelt 0 rijen als mislukking. De knop met bevestiging komt op de detailpagina (R-003). `canDelete(item, viewer)` in `src/lib/permissions.ts` bepaalt of de knop zichtbaar is.
- **Testsessie `'admin'`** in `tests/e2e/routes.ts`. `routesWithNav` neemt ook `'admin'` op.

### T-004 — bouw
- **Eigen actief-controle in `BottomNav`:** `NavLink` zet `aria-current` zelf en laat zich niet overschrijven, dus de balk gebruikt `Link` met een eigen controle. Zo blijft "Profiel" actief op `/uitnodigingen`.
- **`is_admin` in dezelfde laadstap als het profiel:** `AuthProvider` wacht op beide, zodat `RequireAdmin` nooit tijdelijk doorverwijst, en een verbindingsfout loopt via dezelfde sleutel en dezelfde "Opnieuw proberen".
- **Rejection sampling in `generate_invite_code()`:** bytes ≥ 248 worden overgeslagen, zodat elk van de 31 tekens even waarschijnlijk is (geen modulo-bias).
- **Token `--font-mono`** voor de codes, zodat geen lettertype letterlijk in componenten staat.
- **Eigen foutmelding op `InvitesPage`:** `report()` geeft `false` bij een fout die geen verbindingsfout is; dan toont de pagina `invites.error` (`role="alert"`) in plaats van stil niets. `README.md` en `.env.example` horen niet bij T-004 (opstarthulp); ze worden apart gecommit.

## T-005 — Recept toevoegen en bewerken (2026-11-02, analyse)

- **Ingrediënten en stappen als `jsonb` in de receptrij:** `ingredients` (array van `{ name, quantity?, unit? }`) en `steps` (array van tekst), geen aparte tabellen.
  - Opslaan is zo één `insert`/`update`, dus atomisch zonder RPC.
  - "Minstens 1" is een gewone check.
  - De groottelimiet (R-004) kan later één rij meten, en een variant (R-006) kopieert één rij.
  - Zoeken op ingrediënten (R-009) kan met `jsonb_array_elements`.
- **Validatie in de databank:** immutable functies `recipe_ingredients_valid(jsonb)` en `recipe_steps_valid(jsonb)` in checks, met de grenzen uit R-003. Een hoeveelheid is een JSON-getal > 0, met hoogstens 2 decimalen en < 1.000.000 (de bovengrens is een eigen keuze tegen onzinwaarden). Lengtes worden geteld met `char_length`, in de client in code points.
- **Normaliseren in een trigger:** `before insert or update` trimt witruimte van de titel, de ingrediëntnaam, de eenheid en elke stap, en laat een lege eenheid weg. De checks lopen op het resultaat. Zo telt "na weghalen van spaties" ook bij een directe API-aanroep.
- **Checks `not valid`:** bestaande proefrijen met alleen een titel breken de migratie niet. Nieuwe en gewijzigde rijen worden wel gecontroleerd. Er wordt niets gewist.
- **Bewerken alleen door de auteur:**
  - kolomrecht `update (title, ingredients, steps)`, dus `author_id`, `id` en `created_at` zijn niet te wijzigen;
  - policy `recipes update by author` (`using` en `with check` op `author_id = auth.uid()`), zonder `is_admin()`;
  - `canEdit` in `permissions.ts` spiegelt dat.
- **0 rijen = mislukt:** `update` en `delete` doen `select('id')`. Een lege lijst geeft "Opslaan mislukt." of "Verwijderen mislukt.".
- **Router:** `createBrowserRouter` + `RouterProvider` in plaats van `BrowserRouter`, omdat `useBlocker` (voor "Wijzigingen weggooien?") een data-router vraagt. Daarnaast komt er `beforeunload` voor herladen en sluiten; die tekst is van de browser.
- **Routes:** `/recept/:id` (detail) en `/recept/:id/bewerken`.
  - Een niet-auteur op `/bewerken` gaat naar de detailpagina.
  - Een onbekend id of een ongeldige uuid toont "Recept niet gevonden.".
  - Na opslaan gaat de app met `replace` naar de detailpagina.
- **Formulier:**
  - Herordenen gaat met knoppen omhoog en omlaag (≥ 44 px, toegankelijke naam met volgnummer), niet met slepen.
  - Een nieuw formulier start met één lege ingrediëntregel en één lege stap. Volledig lege regels worden bij opslaan weggelaten.
  - De hoeveelheid aanvaardt een komma en een punt (`inputmode="decimal"`) en wordt met een komma getoond.
  - "Gewijzigd" is een vergelijking met de beginwaarde, dus terugzetten telt niet.
- **Bevestigingen:** één component `ConfirmDialog` (`<dialog>`, `role="alertdialog"`).
  - De focus staat eerst op de veilige knop; Escape telt als annuleren.
  - Teksten: "Dit recept verwijderen?" (Verwijderen/Annuleren) en "Wijzigingen weggooien?" (Weggooien/Blijven).
- **Overzicht:** blijft op `created_at desc`; bewerken verandert de volgorde niet. Elk item is een link naar de detailpagina.
- **Testhulp `insertRecipe(client, overrides?)`:** voegt een geldig minimumrecept in. De bestaande tests die alleen een titel invoegen, gebruiken voortaan deze hulp.

### T-005 — bouw
- **Kolomrecht eerst intrekken:** Supabase geeft `authenticated` standaard `update` op alle kolommen. De migratie doet daarom eerst `revoke update` en dan `grant update (title, ingredients, steps)`; anders beperkt het kolomrecht niets.
- **Routes blijven JSX:** `createBrowserRouter(createRoutesFromElements(...))`, zodat `App.tsx` `path="…"` houdt (de test op de beheerroutes leest dat).
- **0 rijen = mislukt met een eigen fout:** `updateRecipe` en `deleteRecipe` geven bij een lege lijst een fout met status 200. `report` ziet die niet als verbindingsfout (een ontbrekende status zou dat wel zijn).
- **Lege regels:** het formulier laat volledig lege regels weg vóór het valideren (`pruneDraft`) en zet de meldingen terug op de getoonde regels. Na de eerste mislukte poging wordt live opnieuw gevalideerd.
- **Navigatie na opslaan:** `savedRef` gaat aan vóór `navigate`; `useBlocker` leest `dirty && !saved` op het moment van navigeren.
- **Omhoog/omlaag** zijn uitgeschakeld op de eerste/laatste regel in plaats van een knop die niets doet.

## T-006 — Preptijd en totale doorlooptijd (2026-11-02, analyse)

- **Twee kolommen `integer` op `recipes`:** `prep_minutes` en `total_minutes`.
  - Het type weigert tekst en halve minuten.
  - Checks: verplicht (`is not null`), bereik 0–4320 en `total_minutes >= prep_minutes` (`recipes_total_ge_prep`).
  - Alle checks staan `not valid`, net als bij de receptinhoud: oude proefrijen blijven bestaan zonder tijden, en nieuwe en gewijzigde rijen worden gecontroleerd. Daarom zijn de kolommen nullable in plaats van `not null`.
- **Kolomrecht:** `grant update (prep_minutes, total_minutes)` aan `authenticated`. De update-policy voor de auteur blijft dezelfde.
- **Invoer in minuten:** één tekstveld per tijd met `inputmode="numeric"`, en alleen cijfers na trimmen (`"045"` geldt als 45). Er zijn geen aparte velden voor uren en minuten. Het label vermeldt "(minuten)".
- **Weergave:** `formatDuration` in `format.ts`: onder 60 "x min", daarboven "x u" of "x u y min", zonder dagen (4320 → "72 u"). De eenheden komen uit `nl.json`.
- **Filter:**
  - twee keuzelijsten ("Maximale preptijd", "Maximale totale tijd") met "Alle", 15, 30, 60 en 120;
  - de keuze staat in de URL (`?prep=…&totaal=…`), andere waarden worden genegeerd;
  - het filteren gebeurt in de databank (`lte`), zodat het later met "en" bij de andere filters past;
  - `applyTimeFilter` en `TimeFilter` zijn herbruikbaar voor de favorietenlijst;
  - een volgnummer per verzoek voorkomt dat een laat antwoord van een vorig filter de lijst overschrijft.
- **Leeg resultaat met een actief filter:** "Niets gevonden.", hetzelfde als bij zoeken. Zonder filter blijft het "Nog geen recepten.".
- **Detailpagina:** toont "Preptijd" en "Totale tijd" in een `<dl>`. Een rij zonder tijden toont niets.
- **Testhulp:** `insertRecipe` krijgt als standaard 10/20 minuten.

### T-006 — bouw

- **Filterwijziging gebruikt `replace`:** de URL volgt de keuze, maar de terugknop loopt niet door elke tussenstap.
- **De lijst blijft zichtbaar tijdens het herladen** na een filterwijziging, in plaats van terug te vallen op de laadtoestand.
- **`draftFromRecord` leest beide vormen** (`prep_minutes` uit een rij, `prepMinutes` uit een record), zodat de bewerkpagina en de unit-test dezelfde functie gebruiken.

## T-007 — Porties en omrekenen (2026-11-02, analyse)

- **Kolom `servings integer` op `recipes`:** checks `recipes_servings_required` (`is not null`) en `recipes_servings_range` (1–99), beide `not valid` zoals bij de tijden. Kolomrecht `grant update (servings)` aan `authenticated`; de update-policy voor de auteur blijft dezelfde. Geen index (er wordt niet op gefilterd).
- **Invoer in het formulier:** één tekstveld "Porties" met `inputmode="numeric"`, alleen cijfers na trimmen (`"04"` geldt als 4). Meldingen: "Vul het aantal porties in." en "Een geheel getal van 1 tot 99.".
- **Omrekenen alleen in het scherm:** de gekozen waarde is status van de detailpagina, gekoppeld aan het recept-id. Niet in de URL, niet in `localStorage`, niet in de databank. Bij elk openen (ook terugknop en herladen) staat ze op de opgeslagen waarde.
- **Regelaar:** knoppen "−" en "+" (≥ 44 px, `aria-label` "Minder porties"/"Meer porties"), uitgeschakeld aan de grenzen 1 en 99, met het getal in een `<output aria-live="polite">`. Geen typveld. Staat boven de ingrediëntenlijst. Wijkt de waarde af, dan staat er "Recept is voor {n} porties.".
- **Rekenen in honderdsten:** `scaleQuantity` rondt de opgeslagen hoeveelheid eerst af op een geheel aantal honderdsten (de databank laat hoogstens 2 decimalen toe), vermenigvuldigt met het gewenste en deelt door het originele aantal, en rondt dan met `Math.round` af. Een echte helft gaat naar boven (0,125 → 0,13). Weergave via de bestaande `formatQuantity` (komma, geen overbodige nullen).
- **Resultaat dat afgerond 0 wordt:** getoond als "< 0,01", niet als "0".
- **Ingrediënt zonder hoeveelheid:** ongewijzigd. Stuksgetallen ("1 ei" → "0,25 ei") worden niet anders behandeld.
- **Oude rij zonder porties:** geen regelaar, opgeslagen hoeveelheden.
- **Testhulp:** `insertRecipe` krijgt standaard `servings: 4`; de formulierhulp vult "Porties" in.

### T-007 — bouw

- **Gekozen waarde hangt aan het recept-id:** `RecipeDetailPage` bewaart `{ id, value }`; hoort het id niet bij het getoonde recept, dan geldt de opgeslagen waarde. Zo schendt navigatie tussen recepten in dezelfde route-component crit. 5 niet.
- **`ingredientLine` haalt "< {q}" uit `nl.json`:** `recipe.ts` importeert daarvoor `t`, zodat de tekst niet in de logica staat.
- **Oude rij zonder porties:** de pagina rekent met 1/1, dus de opgeslagen hoeveelheden blijven staan.

## T-008 — Bron en opmerking (bouw)
- Migratie `20261102150000_recipe_source_note.sql`: kolommen `source`/`note` nullable, checks `not valid` (zelfde patroon als de rest); `recipes_normalize()` herschreven met `create or replace` en trimt beide, leeg wordt `null`.
- `sourceLink` is hoofdletterongevoelig voor het schema en laat alleen http(s) door, zodat `javascript:` nooit een `href` wordt; de opmerking wordt als gewone tekst met `white-space: pre-line` getoond.
- Formulier zonder `maxlength`, zodat een te lange plak de melding toont in plaats van stil af te kappen.
- `.visually-hidden` gebruikt `margin: 0` en `clip-path`, omdat de stijlscanner negatieve marges weigert.

## T-009 — Kookgerief (bouw)
- Migratie `20261102160000_recipe_equipment.sql`: namen staan als `text[]` in de receptrij (atomair opslaan, `&&` met GIN-index, een variant kopieert de rij) plus een catalogus `equipment` voor de canonieke spelling. Geen koppeltabel, geen hernoemen of verwijderen.
- `fold_key()` (immutable wrapper om `unaccent` met expliciete woordenlijst) is de hoofdletter- en accentongevoelige sleutel; herbruikbaar voor tags en zoeken.
- Trimmen, lengte, maximum 20 en hergebruik gebeuren in `recipe_equipment_resolve()` (security definer, uitvoerrecht ingetrokken voor de client). `recipes_normalize()` is daarom ook security definer gemaakt: een trigger roept de functie anders aan met de rechten van de client, die geweigerd worden.
- Keuzelijst en filter tonen alleen items die in een recept staan (`equipment_in_use()`, security invoker).
- `fetchEquipmentInUse` staat in `recipes.ts` en niet in `equipment.ts`: `supabase.ts` gooit zonder omgevingsvariabelen, en de unit tests laden `equipment.ts` zonder.
- `RecipeDraft.equipment` is optioneel, zodat bestaande tests die drafts zonder het veld bouwen blijven compileren en slagen; `emptyDraft` en `draftFromRecord` vullen het altijd.
- `.recipe-list li` werd `.recipe-list > li`, anders kregen de geneste gerieflabels de kaartstijl.

- Overview filters (time, equipment) build URL params from a ref that handlers update immediately: two quick changes otherwise both used the same stale render and the second erased the first.

### T-010 — bouw
- Migratie `20261102170000_recipe_dish_tags.sql`: tags staan als `text[]` (`dish_tags`) in de receptrij, plus een catalogus `tags` (alleen `select` voor de client) voor de canonieke spelling en de startlijst. Atomair opslaan, één `&&` per groep in het filter, een variant kopieert de rij.
- `resolve_tags()` (security definer, niet uitvoerbaar voor de client) valideert, voegt nieuwe namen toe via `on conflict do nothing` op `(kind, name_key)` en ontdubbelt; een eigen trigger `recipes_resolve_dish_tags` laat `recipes_normalize()` ongemoeid. `fold_key()` is een immutable wrapper om `unaccent`.
- De tagknoppen zijn losse `button`s in een `div`, geen lijst: bestaande e2e-tests nemen het eerste `listitem` van het overzicht als het eerste recept.
- `tagFilter.ts` is per groep opgezet (tabel `GROUPS`); het overzicht bouwt de URL uit een ref die meteen bijgewerkt wordt, zodat twee snelle tikken elkaar niet wissen.
- Niemand kan een tag verwijderen of hernoemen; verwijderen door een beheerder is geparkeerd en niet gebouwd.
- Tagfilter: `applyTagFilter` geeft `overlaps` een volledig gequote array-literal (`toArrayLiteral`), want postgrest-js quote de elementen niet en komma's, aanhalingstekens, accolades of backslashes in een naam braken het filter. Het overzicht berekent de nieuwe keuze uit de laatste URL (`paramsRef`); `TagFilter` geeft alleen de getikte naam door.
- `README.md` en `.env.example` horen niet bij T-010 en zijn niet door deze taak gewijzigd; de eigenaar beslist of ze in een aparte commit komen.
- De knop in `TagPicker` heet "Tag toevoegen" (`form.tagAdd`), niet "Toevoegen": de kookgerief-kiezer heeft al een knop "Toevoegen", en de ongescopete kookgerief-testhulp botste daarop (strict mode).
- `TagChoices` bepaalt `aria-pressed` en het (de)selecteren op `tagKey`, zodat een naam uit de URL met andere hoofdletters (`?soort=Soep`) de knop "soep" gewoon indrukt en uitzet.

### T-011 — bouw
- Migratie `20261102180000_recipe_trait_tags.sql`: tweede groep `trait` in dezelfde catalogus `tags` (check op `kind` uitgebreid), kolom `trait_tags` met GIN-index en een eigen trigger `recipes_resolve_trait_tags`. `resolve_tags`, `fold_key` en de dish-trigger zijn ongewijzigd; `unique (kind, name_key)` laat dezelfde naam in beide groepen toe.
- Het maximum van 20 geldt per groep (volgt `resolve_tags`), dus samen kunnen er 40 zijn.
- Identifiers: `trait`, `trait_tags`, URL-parameter `kenmerk`. Overzicht gebruikt `toggleTagIn(kind, name)` uit de ref met laatste URL-params; filters van beide groepen combineren met "en" via twee `overlaps`.
- Vegetarisch-filter kijkt alleen naar de tag, niet naar ingrediënten.

## T-012 — Foto's (2026-11-02, analyse)

- **Opslag:** private bucket `recipe-photos`, aangemaakt in een migratie (`storage.buckets`, `public = false`, `file_size_limit = 512000`, `allowed_mime_types = {image/jpeg}`). Lokaal en in de cloud gelijk.
- **Paden:** `<recipe_id>/<photo_uuid>.jpg`. Elk bestand hoort zo bij één recept en een variant moet echt kopiëren naar haar eigen map.
- **Foto's als `jsonb` in de receptrij:** `photos` is een array van `{ path, main }`, in de volgorde van de gebruiker. Hoogstens 3, precies één `main` bij een niet-lege lijst (check `recipe_photos_valid`). Geen aparte tabel, zelfde reden als ingrediënten: één rij om op te slaan, te meten (groottetaak) en te kopiëren (varianten).
- **Hoofdfoto als vlag, los van de volgorde:** "hoofdfoto wijzigen" verplaatst de foto niet. Zonder enige `main` maakt de trigger de eerste tot hoofdfoto; verwijdert de gebruiker de hoofdfoto, dan wordt de nieuwe eerste het.
- **Verwijzingen gecontroleerd:** de trigger `recipes_check_photos` (`security definer`) eist dat elk pad bestaat in `storage.objects` van de bucket, met `owner_id` = de auteur van het recept.
- **Storage-policies:**
  - lezen: `authenticated`;
  - uploaden: alleen geldige namen in de map van een eigen of nog niet bestaand recept;
  - verwijderen: de eigenaar van het bestand of `is_admin()`;
  - geen update-policy, dus geen overschrijven.
- **Upload vóór de rij:** bij een nieuw recept maakt de client het id (`crypto.randomUUID()`). Eerst de bestanden, dan de rij (de trigger vindt ze dan). Mislukt de rij, dan ruimt de client de nieuwe bestanden op. Na een geslaagde update worden de weggehaalde bestanden verwijderd.
- **Recept verwijderen:** de rij gaat eerst (0 rijen = mislukt), daarna `storage.remove` van de paden. Een trigger kan geen opslagbestanden wissen: Supabase verbiedt een directe `delete` op `storage.objects`.
- **Typecontrole op inhoud:** `detectImageType` leest de magische bytes (JPEG, PNG, WebP, HEIC via `ftyp`-merken). Naam en `file.type` tellen niet.
- **Omzetten op het toestel:** `createImageBitmap(…, { imageOrientation: 'from-image' })` → canvas → `toBlob('image/jpeg')`, met een ladder: eerst de kwaliteit omlaag, dan de maat ×0,85, met een maximum aantal pogingen. Langste zijde ≤ 1280, nooit vergroten. Transparantie krijgt de achtergrondkleur uit het token. EXIF verdwijnt (privacy).
- **HEIC:** de bibliotheek `heic-to` (libheif/WebAssembly), alleen via een dynamische `import()` voor HEIC-bestanden, zodat de hoofdbundel klein blijft.
- **Tonen:** getekende URL's (`createSignedUrls`, één aanroep per scherm, 1 uur geldig) met `loading="lazy"`. Er komen geen miniaturen, want die zouden meetellen in de 2 MB.
- **Camera en galerij:** twee knoppen met elk een verborgen `input type="file"`. De camera gebruikt `capture="environment"`, de galerij `multiple` zonder `capture`.
- **Meer dan 3 gekozen:** de eerste foto's tot 3 worden toegevoegd, de rest wordt geweigerd met "Maximaal 3 foto's.". Foto's worden één voor één verwerkt.
- **Standaardafbeelding:** inline SVG met tokens/`currentColor`, geen bitmap.
- **Testfixtures** in `tests/fixtures/photos/`. Waar het kan, worden ze met een script gemaakt; de HEIC-fixture wordt als bestand vastgelegd.

### T-012 — bouw
- Migratie `20261102190000_recipe_photos.sql`: bucket, storage-policies, kolom `photos`, check `recipe_photos_valid` en trigger `recipes_check_photos`. De trigger slaat een lijst met een verkeerde vorm over; de check weigert die dan met `23514`.
- `heic-to` is 3,2 MB (niet 1 MB): de chunk staat via `globIgnores` buiten de precache van de service worker en laadt bij het eerste HEIC-bestand, online.
- `PhotoPicker` is de enige schrijver van de fotolijst en houdt `photosRef` synchroon bij, met een teller `reserved` voor foto's die nog omgezet worden. Zo kunnen twee snel na elkaar gekozen bestanden het maximum van 3 niet overschrijden.
- `SaveSession` (recept-id plus al geüploade bestanden) leeft per formulier. Mislukt de rij, dan worden de nieuwe bestanden verwijderd en begint "Opnieuw proberen" met een schone sessie; mislukt een upload halverwege, dan blijven de al geüploade bestanden bewaard.
- `deleteRecipe` haalt de paden uit het resultaat van de `delete` zelf (`select('id,photos')`), zonder aparte leesaanroep.
- `RowButtons` is uit `RecipeForm` naar een eigen bestand gehaald, zodat `PhotoPicker` dezelfde omhoog/omlaag/verwijder-knoppen gebruikt.
- `[hidden] { display: none !important }` in `base.css`: de verborgen file-inputs achter de fotoknoppen moesten niet door componentstijlen zichtbaar worden.
- `tests/fixtures/photos/photo.heic` ontbreekt (de tester kon het niet maken); de HEIC-interfacetest slaat zichzelf over.

## T-012 — review-herstel
- Opruimen van pas geüploade foto's gebeurt alleen als de server de schrijfactie weigerde; bij verbindingsverlies blijven bestanden en sessie staan, zodat "Opnieuw proberen" kan slagen. Een `23505` op het eigen recept-id bij `createRecipe` betekent "al bewaard" en loopt door als update.
- Na een geslaagde schrijfactie worden ook eerder geüploade bestanden verwijderd die niet meer in de draft staan (geen wezen).
- `README.md` en `.env.example` horen niet bij T-012-plan maar zijn kleine opstarthulp; ze blijven staan en zijn hier vermeld.
- Ronde 2: trigger `recipes_check_photos` controleert bij een update alleen paden die niet al in `old.photos` stonden, zodat een buiten de app verdwenen bestand andere wijzigingen niet blokkeert (migratie is nog niet in de cloud, dus in dezelfde migratie aangepast).
- Open: `aria-label` "Foto n als hoofdfoto" (laag) blijft zoals de brief en de tests; hernoemen vraagt eerst een testwijziging.

## T-015 — Zoeken op ingrediënten
- `search_recipes(p_terms, p_without, p_min)` is een `security invoker`-RPC met tabelresultaat: RLS op `recipes` en `profiles` blijft gelden, en `match_count`/`term_count` komen uit één query. Anonieme gebruikers hebben geen execute-recht.
- Vergelijken met `strpos` op `fold_key()` in plaats van `LIKE`: `%` en `_` zijn gewone tekens, en hoofdletters en accenten tellen niet.
- Validatie (max 10 per lijst, lege termen weg, ontdubbelen, k in 1..n → `22023`) zit in de functie; de client parset alleen voor weergave.
- Invoer als kommavelden (`Met ingrediënten`, `Zonder`) met 300 ms debounce (`SEARCH_DEBOUNCE_MS`) of de knop; `createDebouncer` is een pure functie zodat die zonder DOM-bibliotheek te testen is.
- URL-parameters `met`, `zonder`, `min`. Een ontbrekende `min` betekent "alle" en schuift mee met n; de keuze van de laatste optie wist `min`.
- Alleen "zonder" (geen zoektermen) geeft alle recepten min de uitgesloten, zonder "k van n".
- De client sorteert het RPC-resultaat zelf (`match_count`, dan `created_at`), omdat de volgorde na PostgREST-filters niet gegarandeerd is.
- Migratie `20261103120000_recipe_search.sql` (na de varianten) geeft ook `photos`, `family_id`, `rating_avg` en `rating_count` terug, zodat zoekresultaten foto, label "Variant" en beoordeling tonen als het gewone overzicht.
- Volgorde met de sorteerkeuze: `match_count` is altijd de eerste sleutel, daarna (bij "Beoordeling") gemiddelde en aantal reviews, daarna `created_at`. Zo gelden R-009 en R-012 allebei letterlijk.
- `parseSearch` ontdubbelt URL-termen met dezelfde sleutel als `parseTerms`; bij "alle" (k >= n) stuurt de pagina `p_min = null`, zodat de databank zelf k = n kiest.
- `IngredientSearch` houdt de getypte tekst lokaal en synchroniseert alleen met de URL als die niet door de component zelf is gezet (link, terug); typen springt dus niet.
- Bij een andere zoekopdracht wordt de lijst eerst leeg (laden), zodat oude rijen zonder "k van n" of in andere volgorde niet blijven staan; andere filters houden de oude lijst zoals voorheen.
- Migratie eindigt met `notify pgrst, 'reload schema'` zodat PostgREST de functie direct kent.

## T-016 — Reviews (bouw)
- Eigen tabel `reviews` met kolomrechten (insert `recipe_id,rating,body`; update `rating,body`) na een eerste `revoke all`; een beheerder mag alleen verwijderen. De recept-rij wordt nooit bijgewerkt bij een review.
- `rating_avg(recipes)` en `rating_count(recipes)` zijn `security invoker` functies (berekende velden voor PostgREST), geen kolommen: reviews tellen zo niet mee in de groottelimiet van 2 MB. De echte grootteproef hoort bij de groottetaak.
- Afronding `round(numeric, 1)` (4,25 → 4,3). Sorteren op beoordeling: gemiddelde, dan aantal, dan nieuwste; zonder review onderaan (`nullsFirst: false`).
- Lijst en datum volgen `created_at`; een bewerkte review verschuift niet. `updated_at` wordt wel bijgehouden.
- URL-parameter `sorteer=beoordeling`; de standaard laat de URL schoon.
- Sterren zijn echte keuzerondjes (transparant over de ster, geen `opacity: 0`) zodat de focusring op het rondje zelf staat. Sterkleur is `--color-text-star` zodat de contrasttest hem meeneemt.
- De samenvatting staat alleen in de reviewsectie (geen tweede samenvatting bovenaan de detailpagina, geen extra velden in `fetchRecipe`); het criterium vraagt alleen dat ze op de detailpagina staat.
- `ReviewSection` laadt lijst en samenvatting na elke geslaagde actie opnieuw; `23505` bij aanmaken wordt een eigen resultaat `duplicate` (melding + herladen).
- Een gebruiker verwijderen verwijdert zijn reviews (`on delete cascade`), zoals bij recepten.
- Voor de zoektaak: `search_recipes` moet ook `rating_avg`/`rating_count` teruggeven en er moet beslist worden hoe "Sorteren op beoordeling" zich verhoudt tot sorteren op het aantal overeenkomsten.
- Varianten beginnen zonder reviews; reviews worden niet gekopieerd.

## T-013 — Grootte (2026-11-02, analyse)

- **Wat telt:** de UTF-8-bytes (`octet_length`, in de client `TextEncoder`) van de tekstwaarden: titel, naam en eenheid van elk ingrediënt, elke stap, bron, opmerking, en elke naam in `dish_tags`, `trait_tags` en `equipment`. Daarbij komt de som van `metadata->>'size'` van de bestanden in `photos`. Getallen (tijden, porties, hoeveelheden) en de JSON-structuur tellen niet. Hun tekstvorm verschilt tussen JavaScript en Postgres, en het gaat om hoogstens enkele honderden bytes.
- **Waar het afgedwongen wordt:** een `after insert or update`-trigger `recipes_check_size` op `recipes` (`security definer`, `set search_path = ''`, niet uitvoerbaar voor de client). Hij ziet de rij na alle normaliserende `before`-triggers (trim, canonieke tags en gerief). Bij een te grote rij geeft hij `raise exception 'recipe_too_large' using errcode = '23514', detail = 'photos' | 'text'`, en het hele statement rolt terug.
- **Welk onderdeel genoemd wordt:** is de tekst alleen al groter dan de grens, dan `text` ("De tekst van het recept is te groot."), anders `photos` ("Foto's zijn samen te groot."). De pure functie `recipe_size_problem(text_bytes, photo_bytes)` houdt die regel testbaar.
- **Bestand zonder grootte:** een ontbrekende `metadata.size`, of een pad zonder bestand, telt als 512.000 bytes (het maximum van de bucket). Dat is streng maar kan geen geldig recept weigeren.
- **Grenstests via pg:** met geldige invoer haalt een recept de grens niet (tekst ≈ 196 KB max + foto's 1.536.000 = ≈ 1,73 MB). De tests blazen daarom `storage.objects.metadata.size` op via `tests/helpers/pg.ts`, alleen lokaal. De 2 MB is in de praktijk een vangnet.
- **Teller in het formulier:** `formatRecipeSize` deelt door 1.048.576 en rondt naar boven af op 1 decimaal ("0,0 van 2 MB" bij 0 bytes, "2,1 van 2 MB" bij 1 byte erover). De teller is geen live-regio. Boven de grens krijgt hij dezelfde kleur als `.field-error` (`--color-text-accent`).
- **Grootte van opgeslagen foto's in de client:** via `storage.list(recipeId)` (metadata `size`) met de sessie van de gebruiker. Alleen de paden in `photos` tellen, net als in de databank.
- **Controle in de client vóór upload:** een recept boven de grens wordt niet geüpload; de databank blijft de echte grens. Een weigering door de server (`23514` + `recipe_too_large`) wordt `SaveResult.sizeProblem` en toont dezelfde melding. De nieuwe bestanden worden opgeruimd via de bestaande `discardAfterFailure`.
- **Geen opruiming aan de serverkant:** wezen na een verbroken verbinding of een verlaten formulier blijven mogelijk. Een opruiming zou een geplande Edge Function met de service-sleutel vragen. Ze tellen niet mee in de grootte van een recept.

## T-013 — bouw

- Migratie `20261103100000_recipe_size_limit.sql`: `recipe_size_limit()`, `recipe_text_bytes(recipes)`, `recipe_photo_bytes(jsonb)` (`security definer`, niet uitvoerbaar voor clients (ook niet via `/rpc`); de trigger draait als eigenaar), `recipe_size_problem` en de `after`-trigger `recipes_check_size` zonder kolomlijst. De trigger geeft `null` terug omdat het een `after`-trigger is.
- `RecipeForm` krijgt de opgeslagen fotogroottes als aparte prop `photoSizes` (en niet via `initial`): de formulierstate wordt maar één keer uit `initial` gevuld, dus een later geladen map zou anders genegeerd worden. `draftFromRecord(record, sizes?)` ondersteunt de map wel.
- Een opgeslagen foto zonder bekende grootte (nog laden of mislukt) laat de teller "…" tonen en telt niet mee in de clientcontrole; de databank beslist dan.
- `EditRecipePage` zoekt de groottes één keer per geladen recept op en meldt een verbindingsfout via `report` met een eigen sleutel, zodat de retry-knop alleen die opzoeking herhaalt.

## T-014 — Varianten (2026-11-02, analyse)

- **Twee kolommen op `recipes`:** `variant_of uuid references recipes(id) on delete set null` (de directe bron) en `family_id uuid not null` (de familie). Bestaande rijen krijgen `family_id = id`.
- **Familie via een vaste `family_id`, niet via een recursieve zoektocht:** een `before insert`-trigger `recipes_set_family` zet `family_id` op die van de bron, of op het eigen id zonder bron. De waarde van de client telt nooit. Een familie splitst zo nooit, ook niet als een tussenschakel verwijderd wordt (R-006: "de familielijst blijft de overige leden tonen"). Eén query `family_id = …` geeft de hele familie. De directe varianten zijn daarvan het deel met `variant_of = id`.
- **Geen kringen:** de bron moet bestaan bij de `insert` (foreign key) en is daarna niet meer te wijzigen. Er is geen kolomrecht `update` op `variant_of` of `family_id`, en de trigger `recipes_guard_variant` weigert elke wijziging behalve `variant_of` → `null`. Die overgang is nodig, want `on delete set null` is zelf een `update`. Check `recipes_not_own_source` (`variant_of <> id`).
- **"Variant" = `family_id <> id`:** een recept blijft een variant als zijn bron verdwijnt. "Variant van een verwijderd recept" = variant met `variant_of is null`.
- **Foto's echt kopiëren, pas bij "Opslaan":** `PhotoDraft.copyFrom` (bronpad) en `copyPhoto` via de Storage-API `copy` naar `<nieuw-id>/<uuid>.jpg`, met de sessie van de gebruiker. Een kopie telt als vers bestand (`fresh`, `session.uploaded`), zodat de bestaande opruiming na een weigering ook kopieën wegneemt. De eigenaar van de kopie moet de kopiërende gebruiker zijn (`recipes_check_photos`). Een databanktest bewijst dat; anders valt de client terug op downloaden en opnieuw uploaden.
- **Route `/recept/:id/variant`** met een eigen pagina `NewVariantPage`. Die bouwt de draft één keer, nadat bron en fotogroottes geladen zijn. Na opslaan gaat de app met `replace` naar de nieuwe detailpagina.
- **Bron verdwenen tijdens het opslaan:** `23503` op `recipes_variant_of_fkey` → `SaveResult.sourceGone`, met de melding "Het bronrecept is intussen verwijderd. Je variant is niet bewaard.".
- **Detailpagina:** de bronregel staat boven de titel. "Varianten" toont de directe varianten (oudste eerst). "Alle varianten (n)" is een `<details>`, alleen bij n ≥ 2. n telt het getoonde recept mee, dat in de lijst als "(dit recept)" staat.
- **Zoekfunctie (R-009):** komt `search_recipes` er, dan moet ze ook `family_id` teruggeven voor het label "Variant".

## T-014 — bouw

- Migratie `20261103110000_recipe_variants.sql`: `variant_of` (`on delete set null`), `family_id` (bestaande rijen = eigen id, daarna `not null`), check `recipes_not_own_source`, `before insert`-trigger `recipes_set_family` en `before update`-trigger `recipes_guard_variant`. Geen kolomrecht `update` op beide kolommen.
- De titel van de bron komt uit een tweede query in `fetchRecipe`: een embed van `recipes` in `recipes` is voor PostgREST dubbelzinnig (één foreign key, twee richtingen).
- `variantDraft` geeft elke foto de bronpad als `key` en als `copyFrom`: stabiel, dus twee drafts van hetzelfde recept zijn gelijk (`isDirty` is `false`). Een foto zonder bekende grootte telt als het bucketmaximum (512000), zoals in de databank.
- `NewVariantPage` toont het formulier pas als bron én fotogroottes bekend zijn, zodat `initial` één keer klopt. Het kopiëren gebeurt in `uploadNew` via `copyPhoto` (Storage `copy` met de sessie van de gebruiker); de kopie komt in `session.uploaded`, dus "Opnieuw proberen" kopieert niet dubbel.
- `SaveResult.sourceGone` komt uit een `23503` op `recipes_variant_of_fkey`; `RecipeForm` toont dan `variant.sourceGone` en laat alles ingevuld.
- De knop "Maak een variant" staat voor elke aangemelde gebruiker in `recipe-actions`; de familie wordt met één `fetchFamily` per geladen recept opgehaald.

### T-014 — review-herstel
- `createRecipe` ruimt bij een mislukte foto-kopie de al gemaakte kopieën op (behalve bij een verbindingsfout) en controleert dan met een `select` of de bron nog bestaat, zodat `variant.sourceGone` verschijnt.
- `retries: 1` uit `playwright.config.ts` gehaald: het hoorde niet bij R-006 en maskeert wankele tests.

## T-017 — Favorieten (bouw)
- Eigen tabel `favorites (user_id, recipe_id)` met RLS op `user_id = auth.uid()`; insert-recht alleen op `recipe_id` (gebruiker via default), geen update. Zo blijven de rechten en de 2 MB-limiet van `recipes` onaangeroerd.
- `is_favorite(recipes)` is een berekend veld (`security invoker`), zodat PostgREST erop filtert (`eq('is_favorite', true)`) en alle bestaande `apply*Filter` ongewijzigd werken; geen lijst id's en geen extra aanroep. De lokale PostgREST ondersteunt dit, dus de terugvaloptie uit het plan was niet nodig.
- `search_recipes` is opnieuw aangemaakt (drop + create) met kolom `is_favorite`; de rest van de functie en de grants zijn gelijk gebleven.
- `RecipeBrowser` is de gedeelde lijst voor overzicht en favorieten (prop `favoritesOnly`, eigen `connectionKey`); het hartje staat naast de `Link` in het `<li>`, want een knop in een `<a>` is ongeldig.
- `FavoriteButton` is optimistisch en houdt alleen de laatste wens bij (`wanted`/`confirmed`, één lopende aanroep): een late of dubbele tik kan nooit een oudere keuze terugzetten. `23505` bij toevoegen en 0 rijen bij verwijderen tellen als geslaagd.
- Ontmarkeren op `/favorieten` laat de kaart staan tot de pagina opnieuw laadt; volgorde is die van het overzicht.
- Nieuwe tokens: `--color-text-heart` (valt onder de contrasttest) en `--space-heart-clearance`.
- `favorites` maakt van `recipes` ↔ `profiles` een tweede (veel-op-veel) relatie; PostgREST weigert dan `profiles(...)` als embed (PGRST201). Alle embeds van de auteur op `recipes` gebruiken nu `profiles!recipes_author_profile_fkey(display_name)`.
- `FavoriteButton` houdt per recept één gedeelde toestand (`entries`, op moduleniveau) buiten de component: een tik op de detailpagina met meteen "terug" toont op het overzicht de nieuwe toestand, ook als de aanroep nog loopt.
- `FavoriteButton` houdt zijn gedeelde toestand per gebruiker bij (sleutel `userId:recipeId`), zodat een nog lopende aanroep bij afmelden zijn wens niet doorgeeft aan de volgende gebruiker in hetzelfde tabblad.

## T-018 — Tweetalige interface (bouw)
- Taalstatus in `src/i18n/language.ts` als kleine externe store (`subscribe`/`getLanguage`); `useLanguage()` in `t.ts` (`useSyncExternalStore`) staat bovenaan elke component die `t` gebruikt. Zo wisselt de taal live zonder `key`-wissel, en blijft formulierstatus staan. Geen provider nodig: de route-elementen zijn stabiel en zouden anders niet opnieuw renderen.
- Standaardtaal is `nl` tot `initLanguage()` (in `main.tsx`, vóór de eerste render) loopt; `initLanguage` bewaart niets, alleen een expliciete keuze gaat naar `localStorage['smaakmaker.lang']`.
- `en.json` wordt in `t.ts` als `Record<TextKey, string>` getypt, zodat een ontbrekende Engelse sleutel al in `tsc -b` faalt. (Vervangen door T-022: nu `fr.json`.)
- Foutmeldingen in de status (`ReviewSection`, `ReviewForm`) zijn `TextKey`s en worden pas bij het renderen vertaald.
- Getalnotatie: hoeveelheid en receptgrootte gebruiken het decimaalteken van de taal zonder duizendtalscheiding; datum, tijd en score gebruiken `Intl` per locale (`nl-BE`/`en-GB`, tijdzone Europe/Brussels), met een cache per locale. (Vervangen door T-022: `nl-BE`/`fr-BE` en een komma in beide talen.)
- `LanguageSwitch` hergebruikt de bestaande `.choice`-knoppen (`aria-pressed`, ≥ 44 px) in een `role="group"`.
- `scripts/make-email-templates.mjs` schrijft een Nederlands en daarna een Engels blok (elk met link en code) en herschrijft alleen de twee `subject`-regels van `config.toml`. Na een wijziging van `config.toml` moet de lokale Supabase herstart worden (`supabase stop` en `start`), anders gebruikt de mailserver het oude onderwerp.

## T-019 — Ingrediënten- en eenhedendatabank (bouw)
- Twee tabellen (`ingredients`, `units`) met elk een sleuteltabel (`ingredient_keys`, `unit_keys`, `primary key (key)`): zo is een sleutel uniek over beide talen en alle synoniemen, wat een `unique` op kolommen niet kan. Een `after`-trigger (`security definer`) bouwt de sleutels opnieuw op; een conflict geeft `23505` en rolt alles terug.
- `item_key()` = `fold_key()` plus witruimte samenvoegen; `fold_key` blijft ongewijzigd voor tags en kookgerief.
- Gewone gebruikers hebben alleen `select` en `insert (name_nl, name_en)`; geen update/delete-grants of -policies (beheer is R-022). `add_ingredient`/`add_unit` zijn `security invoker` en idempotent: bij een bekende sleutel (ook na een race) komt het bestaande id terug met `created = false`.
- Koppeling zit als `ingredient_id`/`unit_id` in de bestaande jsonb-regel; een trigger controleert dat het item bestaat (`23503`). `link_recipes_to_catalog()` vangt per rij elke fout op en laat die rij dan ongemoeid.
- Client: `IngredientDraft` bewaart de koppeling met de sleutel van de tekst bij het laden (`ingredientRef`/`unitRef`); `toRow` neemt hem alleen mee als de sleutel gelijk bleef.

## T-020 — Woordnabijheid en suggesties
- Berekenen in de databank (`suggest_ingredients`/`suggest_units`), niet in de client: één bron voor sleutels (`item_key`), geen sleutellijst naar de gsm.
- Trigram via `pg_trgm.similarity()` (drempel 0,35, vergeleken als `real`); afstand via eigen `dl_distance` (beperkte Damerau-Levenshtein, per teken) omdat `fuzzystrmatch` geen verwisseling kent.
- Lengtegrens (termen < 4 tekens) geldt voor afstand én trigram; exact vanaf 1 teken, begint-met vanaf 2 (zonder `LIKE`, dus `%`/`_` zijn gewone tekens).
- Wrappers en `catalog_suggest` zijn `security definer` (afwijking van de brief: invoker): zo hoeft `authenticated` geen `execute` op `catalog_suggest`/`dl_*` te hebben en zijn die niet via `/rpc` aan te roepen. De wrappers weigeren zonder aanmelding (42501); de catalogus is voor elke aangemelde gebruiker leesbaar, dus er lekt niets.
- Client: `src/lib/suggest.ts` (zonder Supabase) met loader op `createDebouncer` + volgnummer, debounce 250 ms; `fetchSuggestions` staat in `recipes.ts`.

## T-021 — Ingrediënten en eenheden kiezen
- De naam blijft als momentopname in de regel (`name`/`unit`, in de interfacetaal bij opslaan) naast `ingredient_id`/`unit_id`: zoeken, de groottetelling en de terugval blijven werken. Detailpagina en formulier lezen de actuele naam via de verwijzing (`RecipeRecord.catalog`, geladen in `fetchRecipe`).
- Een gekoppelde regel in de draft hangt aan `ingredient`/`unitItem` (een `CatalogItem`); typen wist de koppeling. Een koppeling zonder geladen item blijft bestaan als item met de opgeslagen tekst als enige naam, zodat een mislukte lading niets wist.
- Het item ontstaat bij "Ja" (`add_ingredient`/`add_unit`), niet bij "Opslaan". Een leeg of leeg gemaakt `size` (null, "") wordt door `recipes_normalize()` weggelaten, net als een lege eenheid; andere ongeldige waarden (bv. `true`, 1, "huge") geeft `23514`.
- `CatalogField` houdt per veld bij of de tekst nog gecontroleerd moet worden (`unsettled`) en meldt zich aan in een register van het formulier. "Opslaan" controleert eerst alle niet-gecontroleerde velden en weigert bij een open vraag (melding bij de regel, focus op de vraag). Het formulier zet een patch ook meteen in `draftRef`, zodat "Opslaan" na zo'n controle het resultaat leest en niet de vorige render.
- Rijen hebben een stabiele `uid` (niet in `isDirty`, niet opgeslagen); antwoorden landen via de `uid`, niet via de index.
- Opties van de suggestielijst vangen `mousedown`/`pointerdown` op (`preventDefault`), zodat het veld niet blurt en de controle bij verlaten een gekozen suggestie niet overschrijft.
- `ingredientLine(ingredient, original, desired, item?, lang?, unitItem?)`: het formaat staat als laatste in haakjes; de eenheid wordt ook uit het item gelezen.
- Het formaat in `ingredientLine` wordt vertaald met de parameter `lang` (nieuwe `tIn` in `src/i18n/t.ts`), zodat naam, eenheid en formaat altijd in dezelfde taal staan.
- `REQUIREMENTS.md` (R-025) is niet door deze taak gewijzigd; laat de eigenaar dat apart committen.

## T-022 — Frans in plaats van Engels
- De migraties van T-019/T-020 zijn ter plaatse aangepast (`name_en` → `name_fr`, `'nl' | 'fr'`), want ze stonden nog niet online; lokaal is `supabase db reset` nodig.
- Een opgeslagen `smaakmaker.lang = "en"` wordt niet gewist: `loadLanguage` negeert elke ongeldige waarde en volgt dan de browsertaal; de volgende expliciete keuze overschrijft ze.
- Het decimaalteken is in beide talen een komma, vast in `formatQuantity` en `formatRecipeSize`; geen taalvergelijking meer voor notatie.
- Startlijst: Belgisch Frans (chicon, fromage blanc, cassonade). Een doos is "carton", want "boîte" hoort bij blik (een sleutel hoort bij één item); bol is "boule" (niet gelijk aan de Nederlandse sleutel "bol" van een ander item). Waar de Franse schrijfwijze in het Nederlands gangbaar is (brocoli, courgette) is die de naam van hetzelfde item; Engelse synoniemen zijn weg.

## T-026 — App-icoon koksmuts
- **Eén tekening, Chromium als rasterizer:** `scripts/make-icons.mjs` definieert de muts één keer (512-raster) en rasteriseert via Playwright-Chromium; geen nieuwe pakketten en geen tweede weergave van de tekening.
- **Kleuren uit `tokens.css`:** muts = `--color-bg` (= `background_color`), achtergrond = `--color-accent` (= `theme_color`); het manifest blijft qua kleur ongewijzigd.
- **Varianten per schaal:** alleen `icon.svg` staat als bron in de repo; maskable (schaal 0,82, binnen de veilige cirkel) en favicon (schaal 1,2) zijn dezelfde tekening met een andere schaal.

## T-023 — Tweetalige tags en kookgerief
- **Canonieke naam is de Nederlandse:** recepten bewaren `name`; `name_fr` is alleen voor weergave en opzoeken. Door gebruikers toegevoegde items hebben `name_fr = null` en tonen één naam in beide talen.
- **`name_fr` + `name_fr_key` met sleutel-trigger:** een trigger weigert (`23505`) een `name_key` die gelijk is aan de `name_fr_key` van een ander item in dezelfde groep, en omgekeerd; zo hoort elke sleutel bij hoogstens één item. Dezelfde Nederlandse sleutel op een andere rij telt niet als kruising (het herhalen van de startlijst-insert blijft veilig).
- **Resolvers zoeken eerst op beide sleutels** en geven de canonieke naam terug; ontdubbelen gebeurt op de canonieke sleutel ("soep" + "soupe" wordt één).
- **`seeded` op `equipment` en `equipment_choices()`:** startlijst-gerief is altijd een keuze; gebruikersgerief pas zodra een recept het gebruikt. `equipment_in_use()` blijft bestaan.
- **Samenvoegen in `merge_seeded_names()`:** bevat de startlijsten en hernoemt, herschrijft recepten, verwijdert verouderde rijen en zet daarna pas de Franse naam (volgorde door de sleutel-trigger). Alleen de eigenaar kan ze uitvoeren; de migratie roept ze aan en de migratietest kan ze herhalen.
- **Weergave via sleutel-opzoeking:** `useStoredNames` laadt de catalogi en toont opgeslagen namen in de taal van de lezer (onbekend: de opgeslagen tekst). Het overzicht zet een met de hand getypte Franse URL-naam om naar de canonieke naam voor de databankvraag, zonder herladen als de URL al canoniek is.
- **Gedeelde helper** `src/lib/namedItems.ts` (`NamedItem`, `shownName`, `findItem`, `sortByShownName` met `Intl.Collator`, `addNamed`), zonder Supabase-import.
