# T-019 — review (R-018)

Bekeken: `git diff` (PROGRESS.md, docs/beslissingen.md, docs/loop-log.md, src/lib/recipe.ts) en de nieuwe bestanden (`src/lib/catalog.ts`, drie migraties, vijf testbestanden). `CLAUDE.md` is niet gewijzigd. Geen kernbeslissing geschonden: rechten zitten in RLS en kolomrechten, de grootte telt de ids niet mee, de startlijst staat in een migratie, er is geen geheime sleutel in de client en er is geen nieuwe zichtbare tekst. `VRAGEN.md` heeft geen blok voor T-019.

Alle zes criteria hebben een test die faalt als de regel wegvalt. Er zijn alleen bevindingen met ernst laag.

## Bevindingen

1. **supabase/migrations/20261106120000_recipe_catalog_links.sql:124** — laag — ontwikkelaar
   Probleem: `exception when others then null` slikt elke fout in, ook een echte programmeerfout, zonder spoor. Het plan noemde `check_violation`/`raise_exception`. De data blijft veilig, want de rij blijft ongemoeid, maar bij de cloudmigratie zie je niet welke recepten vrije tekst bleven en waarom.
   Voorstel: doe `raise notice` met het recept-id en `sqlstate` in het exception-blok.

2. **supabase/migrations/20261106120000_recipe_catalog_links.sql:16,60** — laag — ontwikkelaar
   Probleem: de uuid-regex aanvaardt alleen kleine letters. Een client die een geldig uuid in hoofdletters stuurt, krijgt `23514`, terwijl dat id bestaat. Dat is nu geen probleem, want de ids komen uit de databank, maar R-020 schrijft ids vanuit de client.
   Voorstel: gebruik `~*`, of zet het id bij normaliseren om naar kleine letters.

3. **supabase/migrations/20261106100000_catalog.sql:173-177 (add_ingredient) en 205-209 (add_unit)** — laag — ontwikkelaar
   Probleem: als de sleutel al bestaat, komt het bestaande id terug zonder dat de invoer gecontroleerd wordt. Een naam van 81 tekens die na `item_key` toevallig gelijk is aan een bestaande sleutel, geeft dus geen `23514`. In de praktijk gebeurt dat niet.
   Voorstel: valideer de lengte vóór het opzoeken, of noteer het als bewuste keuze in `docs/beslissingen.md`.

4. **tests/db/catalog.test.ts:170-186** — laag — tester
   Probleem: twee HTTP-aanroepen met `Promise.all` lopen niet altijd echt tegelijk. Het pad `exception when unique_violation` in `add_ingredient` wordt dan niet geraakt, en de test slaagt ook via de gewone opzoekweg.
   Voorstel: dwing de race af via pg. Gebruik twee connecties, waarvan de eerste een open transactie heeft met een `insert` die nog niet gecommit is, en roep in de tweede `add_ingredient` aan (zet `request.jwt.claims`). Controleer daarna `created = false` en hetzelfde id.

5. **tests/db/catalog.test.ts:333-339** — laag — tester
   Probleem: "adding nothing" telt de hele tabel. Als een ander testbestand tegelijk items toevoegt, kan deze test vals falen.
   Voorstel: tel alleen op de gebruikte namen of op `created_by = a.id`.

6. **tests/e2e/recipe-catalog.spec.ts:30-48** — laag — tester
   Probleem: crit. 6 vraagt dat de detailpagina dezelfde tekst toont als vóór de koppeling. De test vergelijkt alleen vóór en na een bewerking van een recept dat al gekoppeld was, niet een ongekoppeld en een gekoppeld recept. Dat staat al in T-019-tests.md.
   Voorstel: zet hetzelfde recept eerst zonder `ingredient_id` in de databank, lees de pagina, voeg het id toe via pg (of `link_recipes_to_catalog`), lees opnieuw en vergelijk.

7. **supabase/migrations/20261106110000_catalog_seed.sql:27 / REQUIREMENTS.md R-019** — laag — ontwikkelaar (signaal voor T-020)
   Probleem: R-018 maakt "brocolli" een synoniem, dus het is een exacte treffer. R-019 noemt "brocolli" → broccoli als voorbeeld van een suggestie, terwijl een exacte treffer daar geen "Bedoelde u" geeft. Deze taak volgt R-018 correct, maar T-020 moet dit voorbeeld lezen als "geeft broccoli als treffer".
   Voorstel: meld het aan de analist van T-020. Hier is geen wijziging nodig.

## Scope
Er is geen scope bijgekomen buiten de taak. De wijziging in `recipe.ts` (koppeling bewaren bij het bewerken) staat in het plan en is nodig, anders zou de eerste bewerking de koppeling stil wissen.
