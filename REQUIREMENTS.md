# Smaakmaker — requirements

Dit document beschrijft wat Smaakmaker moet doen. Het is het startpunt voor de analist en de tester.

Smaakmaker is een app om recepten bij te houden. Meerdere mensen gebruiken dezelfde gedeelde receptendatabank, vooral vanaf een gsm. Elke gebruiker kan recepten en reviews toevoegen.

Status per requirement:
- `Bestaand`: staat al in het project. Moet alleen nog gecontroleerd en vastgelegd worden met tests.
- `Goedgekeurd`: besproken met de eigenaar en klaar om te bouwen.
- `Concept`: nog niet goedgekeurd of bewust uitgesteld. Niet bouwen.

Elke requirement heeft een ID (R-xxx), een beschrijving en acceptatiecriteria die een tester automatisch kan controleren.

Afspraken die voor alle requirements gelden:
- Alle zichtbare teksten zijn Nederlands en staan in één tekstbestand (`nl.json`).
- Tijden zijn gehele minuten. Bytes: 1 MB = 1.048.576 bytes.
- Rechten worden afgedwongen in de databank (rij-niveau-regels), niet alleen in de interface.
- Zoektermen en tagnamen vergelijken hoofdletter- en accentongevoelig ("Crème" = "creme").

---

## Basis

### R-001 — Web-app, gedeelde databank en mobiel gebruik
- **Status:** Goedgekeurd
- **Beschrijving:** Smaakmaker is een installeerbare web-app (PWA) voor de gsm. Alle gebruikers delen dezelfde recepten en reviews in één online databank (Supabase).
- **Acceptatiecriteria:**
  - [ ] `npm run build` slaagt zonder fouten en `npm test` draait alle tests en slaagt.
  - [ ] Het web-app-manifest heeft naam "Smaakmaker", `display: standalone`, een start-URL en iconen van 192 en 512 px.
  - [ ] Een recept dat gebruiker A opslaat, staat bij gebruiker B na herladen van het overzicht (geen cache die het verbergt).
  - [ ] Alle schermen zijn bruikbaar bij een breedte van 360 px zonder horizontaal scrollen (Playwright, viewport 360 × 640).
  - [ ] Tikdoelen (knoppen, links, tags) zijn minstens 44 × 44 px.
  - [ ] Is de databank onbereikbaar, dan toont de app "Geen verbinding. Probeer opnieuw." met een knop "Opnieuw proberen"; wat de gebruiker in een formulier typte, blijft staan.
  - [ ] De app bevat geen geheime sleutels in de client; alleen de publieke databanksleutel.
- **Buiten scope:** Offline gebruik (ook offline lezen), native app-store-apps, push-meldingen.

### R-016 — Navigatie en visuele stijl
- **Status:** Goedgekeurd
- **Beschrijving:** Eén herkenbare, op gsm gerichte stijl en een vaste navigatie. De stijl krijgt een eigen identiteit passend bij koken (niet een generiek sjabloon); de ontwikkelaar gebruikt hiervoor de `frontend-design`-skill.
- **Acceptatiecriteria:**
  - [ ] Onderaan staat een vaste navigatiebalk met precies vier ingangen: "Recepten", "Favorieten", "Nieuw", "Profiel"; "Recepten" is na het aanmelden actief.
  - [ ] Kleuren, lettertypen en afstanden staan als variabelen (tokens) op één plaats; componenten bevatten geen vaste kleurwaarden.
  - [ ] Tekstkleur tegenover achtergrond heeft een contrastverhouding van minstens 4,5 : 1 (automatisch gecontroleerd op de tokens).
  - [ ] Elk invoerveld heeft een zichtbaar label; elk interactief element heeft zichtbare toetsenbordfocus.
  - [ ] Animaties worden niet afgespeeld als het toestel "verminderde beweging" vraagt.
  - [ ] Elke lijst heeft een lege toestand met een Nederlandse tekst (bv. "Nog geen recepten.") en een laadtoestand.
- **Buiten scope:** Donkere modus, meerdere talen.

### R-025 — App-icoon: koksmuts
- **Status:** Goedgekeurd
- **Beschrijving:** Het icoon van Smaakmaker is een koksmuts (zonder snor), op het beginscherm van de gsm, in het browsertabblad en bij het installeren van de app.
- **Acceptatiecriteria:**
  - [ ] Het icoon is een zelf getekende, vlakke koksmuts als vectorbestand (SVG) in de repo; geen overgenomen of auteursrechtelijk beschermde afbeelding.
  - [ ] Kleuren komen uit de tokens: een muts in de kleur van `--color-bg` (crème) op een achtergrond in de kleur van `--color-accent` (tomaatrood), gelijk aan `theme_color` en `background_color` van het manifest.
  - [ ] Uit de SVG zijn gemaakt: PNG van 192×192 en 512×512 (manifest), een "maskable" PNG van 512×512 waarvan alle mutspixels binnen een cirkel met een straal van 40% van de breedte liggen, een `apple-touch-icon` van 180×180 en een favicon van 32×32 plus de SVG.
  - [ ] Het manifest (`icons` met `purpose: "any"` en `purpose: "maskable"`) en `index.html` (`rel="icon"`, `rel="apple-touch-icon"`) verwijzen naar deze bestanden; elk verwezen bestand bestaat en heeft precies de opgegeven afmetingen.
  - [ ] Een test leest de PNG's: de middelste pixel heeft de mutskleur, een hoekpixel de achtergrondkleur, en in het favicon van 32×32 heeft minstens 20% van de pixels de mutskleur (leesbaar op klein formaat).
  - [ ] De bestanden worden gemaakt door `scripts/make-icons.mjs` zonder nieuwe pakketten; de gegenereerde bestanden staan in de repo.
  - [ ] De naam van de app in het manifest en op het beginscherm blijft "Smaakmaker".
- **Buiten scope:** Een snor of tekst in het icoon, een logo in het hoofdscherm, een animatie, een splash-scherm.

### R-002 — Aanmelden met uitnodigingscode
- **Status:** Goedgekeurd
- **Beschrijving:** Alleen wie een uitnodigingscode heeft, kan een account maken. Aanmelden gaat met e-mailadres (inloglink per e-mail, geen wachtwoord).
- **Acceptatiecriteria:**
  - [ ] Zonder geldige uitnodigingscode kan geen account worden gemaakt; een ongeldige of gebruikte code geeft "Deze code is niet geldig.".
  - [ ] Een code is eenmalig bruikbaar en vervalt 7 dagen na aanmaken (op 7 × 24 uur precies is ze nog geldig, 1 seconde later niet meer).
  - [ ] Een gebruiker geeft bij het eerste aanmelden een weergavenaam van 2–40 tekens op; 1 of 41 tekens wordt geweigerd.
  - [ ] Een ongeldig e-mailadres wordt geweigerd met een melding bij het veld.
  - [ ] Zonder aanmelding zijn recepten, reviews en foto's niet leesbaar of schrijfbaar (ook niet rechtstreeks via de databank-API).
  - [ ] De e-mail bevat de inloglink én een code van 6 cijfers; het aanmeldscherm heeft een veld "Code uit de e-mail". Een juiste code meldt aan, een foute of verlopen code geeft "Deze code is niet geldig." en meldt niet aan.
  - [ ] Een gebruiker kan afmelden; daarna toont de app het aanmeldscherm.
  - [ ] Elk recept en elke review toont de weergavenaam van de auteur en de datum.
- **Buiten scope:** Wachtwoorden, aanmelden met Google/Apple, account verwijderen `[later]`.

### R-017 — Beheerder
- **Status:** Goedgekeurd
- **Beschrijving:** Een of meer gebruikers zijn beheerder. Een beheerder maakt uitnodigingscodes en kan ongewenste inhoud verwijderen.
- **Acceptatiecriteria:**
  - [ ] Alleen een beheerder ziet en kan het scherm "Uitnodigingen" gebruiken; een gewone gebruiker krijgt via de databank-API een weigering.
  - [ ] Een beheerder maakt een code aan en ziet per code: status (open, gebruikt, verlopen), gebruiker en vervaldatum.
  - [ ] Een beheerder kan elk recept en elke review verwijderen (met bevestiging); een gewone gebruiker alleen de eigen.
  - [ ] De eerste beheerder wordt buiten de app ingesteld (databankinstelling), niet via een publiek scherm.
- **Buiten scope:** Gebruikers blokkeren of verwijderen, meldfunctie voor gebruikers.

---

## Recepten

### R-003 — Recept toevoegen en bewerken
- **Status:** Goedgekeurd
- **Beschrijving:** Een gebruiker maakt een recept met titel, ingrediënten en bereidingsstappen. Het overzicht toont alle recepten. Alleen de auteur (en een beheerder voor verwijderen) wijzigt een recept.
- **Acceptatiecriteria:**
  - [ ] Verplicht: titel van 1–100 tekens (na weghalen van spaties vooraan en achteraan), minstens 1 ingrediënt en minstens 1 stap; anders wordt opslaan geweigerd met een melding bij het veld.
  - [ ] Een ingrediënt heeft een naam (1–80 tekens), optioneel een hoeveelheid (getal groter dan 0, hoogstens 2 decimalen) en optioneel een eenheid (vrije tekst, hoogstens 20 tekens). Maximaal 60 ingrediënten en 40 stappen; een stap heeft 1–1000 tekens.
  - [ ] Ingrediënten en stappen zijn te herordenen en te verwijderen in het formulier.
  - [ ] Na opslaan staat het recept in het overzicht (nieuwste eerst) en is het te openen op een detailpagina.
  - [ ] Het overzicht toont per recept titel, preptijd en totale tijd zodra R-007 bestaat, en de auteur.
  - [ ] Een gebruiker kan alleen eigen recepten bewerken; via de databank-API wordt een wijziging van andermans recept geweigerd.
  - [ ] Verwijderen vraagt bevestiging; het recept verdwijnt uit overzicht, favorieten (R-014) en zoekresultaten.
  - [ ] Verlaat de gebruiker het formulier met niet-opgeslagen wijzigingen, dan vraagt de app "Wijzigingen weggooien?".
- **Wijziging:** ingrediëntnaam en eenheid worden gekozen uit de databank (R-018, R-020); vrije tekst blijft geldig als de gebruiker niets wil opslaan. Een regel krijgt een optioneel formaat (klein, middelgroot, groot). Alle criteria hierboven over lengtes en aantallen blijven gelden.
- **Buiten scope:** Import van websites, video, meerdere ingrediëntgroepen.

### R-007 — Preptijd en totale doorlooptijd
- **Status:** Goedgekeurd
- **Beschrijving:** Elk recept heeft preptijd (actief werk) en totale doorlooptijd (alles, ook rusten, wachten en oventijd).
- **Acceptatiecriteria:**
  - [ ] Beide tijden zijn verplicht, hele minuten van 0 tot en met 4320 (3 dagen); 4321 of een negatief of niet-numeriek getal wordt geweigerd.
  - [ ] Totale tijd ≥ preptijd; totale tijd gelijk aan preptijd is geldig, 1 minuut minder wordt geweigerd met "Totale tijd kan niet korter zijn dan de preptijd.".
  - [ ] Weergave: 0 → "0 min", 45 → "45 min", 60 → "1 u", 90 → "1 u 30 min", 4320 → "72 u".
  - [ ] In het overzicht kan op maximale preptijd en op maximale totale tijd gefilterd worden (keuzes: 15, 30, 60, 120 min); een recept met exact de gekozen waarde telt mee, 1 minuut erboven niet.
- **Buiten scope:** Timers tijdens het koken.

### R-013 — Porties en omrekenen
- **Status:** Goedgekeurd
- **Beschrijving:** Een recept geeft aan voor hoeveel porties het is. De gebruiker rekent de hoeveelheden op de detailpagina om naar een ander aantal porties.
- **Acceptatiecriteria:**
  - [ ] Aantal porties is verplicht, een geheel getal van 1 tot en met 99.
  - [ ] Op de detailpagina kan het aantal porties tijdelijk worden aangepast (min 1, max 99, stappen van 1); de opgeslagen waarde van het recept verandert niet.
  - [ ] Hoeveelheden worden omgerekend als `hoeveelheid × gewenst / origineel` en getoond met hoogstens 2 decimalen zonder overbodige nullen (bv. 200 g voor 4 → 300 g voor 6; 1 voor 4 → 0,25 voor 1).
  - [ ] Ingrediënten zonder hoeveelheid blijven ongewijzigd.
  - [ ] Bij het openen van een recept staat het aantal porties op de opgeslagen waarde.
- **Buiten scope:** Eenheden omzetten (g ↔ kg), afronden naar "mooie" hoeveelheden.

### R-015 — Bron en opmerking
- **Status:** Goedgekeurd
- **Beschrijving:** Een recept heeft een optionele bron (boek, website, "oma") en een optionele opmerking.
- **Acceptatiecriteria:**
  - [ ] Bron is optioneel, hoogstens 200 tekens; opmerking is optioneel, hoogstens 1000 tekens; 201 respectievelijk 1001 tekens wordt geweigerd.
  - [ ] Zijn ze leeg, dan toont de detailpagina de velden niet.
  - [ ] Een bron die begint met `http://` of `https://` is een aanklikbare link die in een nieuw tabblad opent met `rel="noopener noreferrer"`; andere tekst is gewone tekst.
- **Buiten scope:** Automatisch titel ophalen van een link.

### R-008 — Kookgerief
- **Status:** Goedgekeurd
- **Beschrijving:** Een recept geeft aan welk kookgerief nodig is (bv. Thermomix, oven, airfryer).
- **Acceptatiecriteria:**
  - [ ] Een recept heeft nul of meer kookgerief-items; naam van 1–30 tekens.
  - [ ] De gebruiker kiest uit bestaande items of voegt een nieuw item toe; een nieuwe naam die (hoofdletter- en accentongevoelig) al bestaat, hergebruikt het bestaande item.
  - [ ] Kookgerief staat zichtbaar op de detailpagina en in het overzicht.
  - [ ] Het overzicht filtert op kookgerief: een recept moet minstens één van de gekozen items vereisen; zonder keuze geen filter.
- **Wijziging:** een startlijst met namen in twee talen en vergelijken over talen heen (R-024).
- **Buiten scope:** Aankooplinks, instellingen per toestel, "alleen recepten zonder gerief".

### R-010 — Tags voor soort gerecht
- **Status:** Goedgekeurd
- **Beschrijving:** Een recept heeft tags voor het soort gerecht. Startlijst: dessert, soep, bijgerecht, tapas, hoofdgerecht, ontbijt, snack, saus. Gebruikers kunnen tags toevoegen.
- **Acceptatiecriteria:**
  - [ ] De startlijst staat bij de eerste installatie in de databank.
  - [ ] Een recept heeft nul of meer tags uit deze groep.
  - [ ] Een gebruiker voegt een nieuwe tag toe (1–30 tekens); bestaat die al in deze groep (hoofdletter- en accentongevoelig), dan wordt de bestaande gebruikt, geen dubbele.
  - [ ] Filteren in het overzicht: binnen één groep volstaat één van de gekozen tags (of), tussen groepen moeten alle groepsfilters kloppen (en); zonder keuze geen filter.
  - [ ] Gebruikers kunnen tags niet hernoemen of verwijderen; alleen een beheerder `[?]` verwijdert een ongebruikte tag.
- **Wijziging:** namen van de startlijst in twee talen en vergelijken over talen heen (R-024).
- **Buiten scope:** Tags met kleuren of iconen, hiërarchie.

### R-011 — Tags voor seizoen, dieet en stijl
- **Status:** Goedgekeurd
- **Beschrijving:** Een tweede groep tags: winter, zomer, lente, herfst, licht, vegetarisch, veganistisch, glutenvrij, snel. Gebruikers kunnen tags toevoegen.
- **Acceptatiecriteria:**
  - [ ] Werkt zoals R-010, maar als aparte groep ("Kenmerken") met eigen startlijst; dezelfde tagnaam mag in beide groepen bestaan.
  - [ ] Filters uit beide groepen zijn te combineren (bv. soep én vegetarisch).
  - [ ] Het filter "vegetarisch" gebruikt alleen de tag; ingrediënten worden niet gecontroleerd.
- **Wijziging:** namen van de startlijst in twee talen (R-024).
- **Buiten scope:** Automatisch afleiden van tags uit ingrediënten.

### R-005 — Foto's
- **Status:** Goedgekeurd
- **Beschrijving:** Een recept heeft nul tot drie foto's, genomen met de gsm of gekozen uit de galerij. Foto's worden op het toestel verkleind vóór het uploaden.
- **Acceptatiecriteria:**
  - [ ] Maximaal 3 foto's per recept; de vierde wordt geweigerd met "Maximaal 3 foto's.".
  - [ ] Toegelaten invoer: JPEG, PNG, WebP en HEIC. Andere bestandstypes (ook met een `.jpg`-extensie maar andere inhoud) worden geweigerd.
  - [ ] Elke foto wordt vóór upload omgezet naar JPEG met een langste zijde van hoogstens 1280 px en een grootte van hoogstens 500 KB (512.000 bytes); een kleinere foto wordt niet vergroot.
  - [ ] Een foto kan worden gekozen uit de galerij of met de camera genomen.
  - [ ] Eén foto is de hoofdfoto (standaard de eerste; te wijzigen) en staat in het overzicht; zonder foto toont het overzicht een standaardafbeelding.
  - [ ] Foto's zijn te verwijderen en van volgorde te veranderen; het verwijderen van een recept verwijdert ook de bestanden.
  - [ ] Foto's zijn alleen leesbaar voor aangemelde gebruikers.
- **Buiten scope:** Bijsnijden en filters, foto's bij reviews.

### R-004 — Beperking van de grootte
- **Status:** Goedgekeurd
- **Beschrijving:** Een recept mag niet groter zijn dan 2 MB (tekst en foto's samen), zodat de databank niet overloopt.
- **Acceptatiecriteria:**
  - [ ] De grootte van een recept is de som van alle tekstvelden (UTF-8-bytes, inclusief ingrediënten, stappen, bron, opmerking, tags) en alle foto's.
  - [ ] Exact 2.097.152 bytes wordt geaccepteerd; 1 byte meer wordt geweigerd met een melding die noemt wat te groot is (bv. "Foto's zijn samen te groot.").
  - [ ] De limiet wordt in de databank afgedwongen (een directe API-aanroep eroverheen wordt geweigerd), niet alleen in de interface.
  - [ ] Tijdens het bewerken toont het formulier de gebruikte grootte, bv. "1,3 van 2 MB".
  - [ ] Bij een geweigerde opslag blijft het recept zoals het was en blijft het formulier ingevuld; er blijven geen losse foto's achter in de opslag.
  - [ ] Een lege tekst of nul foto's blijft ver onder de limiet en wordt nooit door de grootte geweigerd.
- **Buiten scope:** Een totaalquotum per gebruiker, opruimen van oude recepten.

### R-006 — Varianten
- **Status:** Goedgekeurd
- **Beschrijving:** Een recept kan varianten hebben (bv. soep met feta en dezelfde soep met roomkaas). Een variant is een volledig eigen recept, maar de link met het bronrecept is duidelijk zichtbaar.
- **Acceptatiecriteria:**
  - [ ] Op de detailpagina staat de knop "Maak een variant"; het formulier opent met een kopie van alle velden (titel, ingrediënten, stappen, tijden, porties, bron, opmerking, gerief, tags) en de foto's van het bronrecept, met auteur = huidige gebruiker.
  - [ ] De kopie wordt pas bewaard bij "Opslaan"; annuleren laat niets achter, ook geen foto-bestanden.
  - [ ] Kopieerbare foto's tellen mee in de limiet van de variant (R-004); past de kopie niet, dan wordt ze geweigerd met de melding van R-004.
  - [ ] Elke gebruiker kan een variant maken van elk recept (ook van andermans recept).
  - [ ] Een variant toont bovenaan "Variant van: <titel>" met een link naar het bronrecept.
  - [ ] Het bronrecept toont de lijst van zijn varianten (titel en auteur); varianten van varianten zijn toegelaten en elk recept toont zijn directe bron en zijn directe varianten.
  - [ ] Daarnaast toont elk recept in een familie "Alle varianten (n)" met de volledige familie (alle recepten die via varianten met elkaar verbonden zijn).
  - [ ] Een variant is zelfstandig: wijzigen of verwijderen van het bronrecept verandert de variant niet.
  - [ ] Wordt het bronrecept verwijderd, dan blijft de variant bestaan en toont "Variant van een verwijderd recept"; de familielijst blijft de overige leden tonen.
  - [ ] Een recept kan niet zijn eigen bron zijn, en er kunnen geen kringen ontstaan.
  - [ ] Het overzicht markeert varianten met het label "Variant".
- **Wijziging:** de kopie bevat ook de verwijzingen naar de databank en de formaten van de ingrediënten (R-020).
- **Buiten scope:** Verschillen tussen varianten tonen, een variant later aan een ander bronrecept koppelen.

---

## Ingrediënten en eenheden

Een gedeelde databank van ingrediënten en eenheden, zodat "broccoli", "brocoli" en "brocolli" hetzelfde ingrediënt zijn. Een *sleutel* is een naam in kleine letters, zonder accenten, met overtollige spaties weggehaald ("Crème  Fraîche" → "creme fraiche").

### R-018 — Ingrediënten- en eenhedendatabank
- **Status:** Goedgekeurd
- **Beschrijving:** De databank bevat ingrediënten en eenheden, elk met een Nederlandse en een Franse naam en synoniemen (bijnamen en andere schrijfwijzen). Alle aangemelde gebruikers lezen en voegen toe; alleen een beheerder wijzigt of verwijdert (R-022).
- **Acceptatiecriteria:**
  - [ ] Een ingrediënt heeft een Nederlandse naam en een Franse naam (1–80 tekens) en 0 tot 20 synoniemen (1–80 tekens); minstens één van beide namen is ingevuld. Een eenheid werkt hetzelfde, met namen en synoniemen van 1–20 tekens.
  - [ ] Elke sleutel (van een naam of een synoniem, in beide talen) hoort bij hoogstens één ingrediënt, en apart bij hoogstens één eenheid. Een directe aanroep van de databank die een tweede item met een bestaande sleutel maakt, wordt geweigerd; twee gebruikers die tegelijk "tempeh" toevoegen, leveren één item op.
  - [ ] De startlijst staat bij de eerste installatie in de databank: minstens 150 ingrediënten en 25 eenheden, elk met een Nederlandse en een Franse naam. Voorbeelden die erin moeten staan: ingrediënt broccoli / brocoli met synoniemen "broccolli" en "brocolli"; aardappel / pomme de terre; tomaat / tomate; eenheden g, kg, ml, dl, l, el / c. à soupe (eetlepel), tl / c. à café (theelepel), stuk / pièce, snuf / pincée, teentje / gousse, takje / brin, blik / boîte, bosje / botte.
  - [ ] Aangemelde gebruikers kunnen alle items lezen; niet-aangemelde bezoekers niet.
  - [ ] Een aangemelde gebruiker kan een nieuw item toevoegen met één naam (in zijn interfacetaal); de andere taal blijft leeg en het item is meteen voor iedereen zichtbaar. Een gewone gebruiker kan een bestaand item via de databank-API niet wijzigen of verwijderen; die aanroep wordt geweigerd.
  - [ ] Bestaande recepten blijven ongewijzigd na de migratie: een ingrediëntregel waarvan de sleutel gelijk is aan een naam of synoniem van een item wordt gekoppeld aan dat item (idem voor eenheden); alle andere regels blijven vrije tekst. Geen recept, hoeveelheid of tekst gaat verloren.
- **Buiten scope:** Categorieën (groente, vlees), voedingswaarden, eenheden omzetten (g ↔ kg), automatische meervoudsherkenning (meervoud komt alleen via synoniemen).

### R-019 — Woordnabijheid en suggesties
- **Status:** Goedgekeurd
- **Beschrijving:** Bij het kiezen en zoeken berekent de app hoe dicht een getypt woord bij bestaande items ligt, om tikfouten en andere schrijfwijzen op te vangen ("Bedoelde u broccoli?").
- **Acceptatiecriteria:**
  - [ ] Vergelijken gebeurt op sleutels (hoofdletter- en accentongevoelig) en over beide talen en alle synoniemen heen; "Creme" en "crème" zijn gelijk.
  - [ ] Een exacte sleutelovereenkomst met een naam of synoniem is een treffer en geeft geen "Bedoelde u"-suggestie.
  - [ ] Zonder exacte overeenkomst komt een item in aanmerking als de Damerau-Levenshtein-afstand (invoegen, verwijderen, vervangen of twee verwisselde naburige letters, elk 1) tussen de sleutels hoogstens 1 is bij een term van 4–5 tekens, hoogstens 2 bij 6–9 tekens en hoogstens 3 bij 10 of meer tekens. Termen van 1–3 tekens krijgen geen vergelijkbare suggesties.
  - [ ] Daarnaast komt een item in aanmerking als de trigramgelijkenis (Jaccard van de 3-lettergroepen met spaties als opvulling) minstens 0,35 is; bv. "tomaten" stelt "tomaat" voor (0,36).
  - [ ] Voor het typen met automatisch aanvullen (vanaf 2 tekens) komen ook items in aanmerking waarvan een sleutel met de term begint ("bro" toont broccoli); dit telt niet als "Bedoelde u"-suggestie.
  - [ ] De suggesties staan op volgorde: exacte overeenkomst, begint-met, dan oplopende afstand, dan aflopende gelijkenis, dan alfabetisch; hoogstens 5.
  - [ ] Voorbeelden: "brocolli" → broccoli; "paprica" → paprika; "tomaaat" → tomaat; "tomate" → tomaat (via de Franse naam); "xqzv" → geen suggestie; "zout" (bestaat) → geen suggestie.
  - [ ] Dezelfde regels gelden voor eenheden. Tags en kookgerief behouden hun bestaande exacte vergelijking (R-008, R-010).
  - [ ] Het ophalen van suggesties gebeurt na een korte pauze in het typen (hoogstens 300 ms); bij snel opeenvolgende invoer toont het scherm de suggesties voor de laatste invoer.
- **Buiten scope:** Klankgelijkenis (Soundex/Metaphone, niet geschikt voor Nederlands), betekenisverwantschap ("zuivel" → kaas), leren van gebruik.

### R-020 — Ingrediënten en eenheden kiezen in het formulier
- **Status:** Goedgekeurd
- **Beschrijving:** In het receptformulier kiest de gebruiker ingrediënt en eenheid uit de databank. Is iets nieuw, dan vraagt de app of het in de databank mag.
- **Acceptatiecriteria:**
  - [ ] Vanaf 2 getypte tekens toont het naamveld hoogstens 5 suggesties (R-019), in de naam van de interfacetaal; komt de treffer van een synoniem, dan staat dat erbij ("brocoli → broccoli").
  - [ ] Een suggestie kiezen bewaart de verwijzing naar het item; typt de gebruiker een volledige bestaande naam of een synoniem en gaat verder, dan wordt dat item automatisch gekozen zonder extra vraag.
  - [ ] Zonder exacte overeenkomst maar met suggesties vraagt de app "Bedoelde u <naam>?" met een knop per suggestie en een knop "Nee, <invoer> is nieuw".
  - [ ] Is de invoer nieuw, dan vraagt de app "Nieuw ingrediënt '<invoer>'. Opslaan in de databank zodat iedereen het kan kiezen?". "Ja" maakt het item (naam in de interfacetaal; R-018) en kiest het; "Nee" laat de regel als vrije tekst staan, zonder item in de databank.
  - [ ] Een regel als vrije tekst blijft geldig (naam 1–80 tekens, eenheid hoogstens 20 tekens).
  - [ ] Het eenheidsveld werkt op dezelfde manier (suggesties, "Bedoelde u", de vraag om op te slaan); een lege eenheid blijft toegelaten.
  - [ ] Een regel heeft een optioneel formaat: Klein, Middelgroot of Groot (vaste keuze, vertaald). Het formaat is geen apart ingrediënt: "aardappel" met formaat groot is nog steeds het item aardappel. Weergave: "2 aardappel (groot)" in het Nederlands, "2 pomme de terre (grande taille)" in het Frans (formaten: petite taille, taille moyenne, grande taille).
  - [ ] Omrekenen van porties (R-013) en de groottelimiet (R-004) blijven werken: het formaat verandert niet bij omrekenen en telt mee in de grootte van het recept.
  - [ ] Het recept bewaart de verwijzing, niet een kopie van de naam: hernoemt een beheerder het item of vult hij de Franse naam in, dan toont het recept dat meteen. Een recept verwijderen laat de items bestaan.
  - [ ] Een variant (R-006) kopieert verwijzingen, vrije tekst en formaten.
  - [ ] Opslaan weigert een ongeldige nieuwe naam (leeg, te lang) met een melding bij het veld en maakt geen item aan.
- **Buiten scope:** Meerdere formaten of bereidingswijzen als apart veld ("in blokjes"), foto's van ingrediënten, ingrediëntgroepen.

### R-022 — Beheer van de databank
- **Status:** Goedgekeurd
- **Beschrijving:** Een beheerder houdt de databank netjes: namen en synoniemen aanpassen, dubbele items samenvoegen en ongebruikte items verwijderen.
- **Acceptatiecriteria:**
  - [ ] Een pagina "Ingrediënten en eenheden", bereikbaar vanaf Profiel, alleen voor beheerders; een gewone gebruiker die de route opent, gaat naar Profiel (zoals R-017).
  - [ ] De pagina toont een doorzoekbare lijst (zoeken volgens R-019) met Nederlandse naam, Franse naam, synoniemen en het aantal recepten dat het item gebruikt; een apart tabblad voor eenheden.
  - [ ] Een beheerder past beide namen aan en voegt synoniemen toe of verwijdert ze; een naam of synoniem waarvan de sleutel al bij een ander item hoort, wordt geweigerd met "Bestaat al bij <item>.".
  - [ ] Samenvoegen van item A in item B (na bevestiging): alle recepten die naar A verwijzen verwijzen naar B; de namen en synoniemen van A worden synoniemen van B; A verdwijnt; dit gebeurt in één transactie (bij een fout blijft alles zoals het was). Een item met zichzelf samenvoegen kan niet.
  - [ ] Verwijderen kan alleen als geen recept het item gebruikt; anders staat er "In gebruik door <n> recepten; voeg het samen met een ander item.".
  - [ ] Dit alles wordt in de databank afgedwongen: dezelfde aanroepen door een gewone gebruiker worden geweigerd, ook zonder de interface.
  - [ ] Het formaat (klein, middelgroot, groot) staat vast en is niet te beheren.
- **Buiten scope:** Ongedaan maken, een wachtrij met goedkeuring, geschiedenis van wijzigingen, beheer van tags en kookgerief (geparkeerd).

---

## Zoeken

### R-009 — Zoeken op ingrediënten
- **Status:** Goedgekeurd
- **Beschrijving:** Een gebruiker zoekt recepten op ingrediënt, met "zonder" en een minimum aantal overeenkomsten ("3 van de 5").
- **Acceptatiecriteria:**
  - [ ] Eén zoekterm vindt recepten waarvan minstens één ingrediëntnaam de term bevat: "feta" vindt "fetakaas" en "Feta"; "creme" vindt "Crème fraîche".
  - [ ] De gebruiker voert 1 tot 10 ingrediënten in en kiest "minstens k van de n"; standaard k = n (alle). k loopt van 1 tot n. Een recept telt mee als minstens k van de ingevoerde termen elk in minstens één ingrediënt voorkomen (één term telt maximaal één keer).
  - [ ] Voorbeeld: termen {feta, tomaat, olijf, ui, look} met k = 3: een recept met feta, tomaat en ui is een treffer; een recept met feta en tomaat niet.
  - [ ] "Zonder": 0 tot 10 termen; een recept met een ingrediënt dat een van die termen bevat, valt weg, ook als het aan het minimum voldoet.
  - [ ] Treffers staan bovenaan gesorteerd op aantal overeenkomsten (aflopend), daarna op nieuwste; het aantal overeenkomsten ("4 van 5") staat in het overzicht bij elk resultaat.
  - [ ] Zonder treffers staat er "Niets gevonden"; zonder termen toont het overzicht alle recepten.
  - [ ] Termen worden bijgewerkt na een korte pauze in het typen (hoogstens 400 ms) of bij een zoekknop; het resultaat is correct bij snel opeenvolgende invoer.
  - [ ] Zoeken combineert met alle filters (tijd, gerief, tags, favorieten).
  - [ ] Een lege of alleen-spaties-term wordt genegeerd; een term van 1 teken wordt geaccepteerd.
- **Wijziging:** synoniemen en vertalingen worden herkend en een tikfout krijgt een suggestie (R-021).
- **Buiten scope:** Automatische meervoudsherkenning, zoeken in stappen.

### R-021 — Zoeken met synoniemen
- **Status:** Goedgekeurd
- **Beschrijving:** Zoeken op ingrediënten (R-009) herkent synoniemen en vertalingen en stelt bij een tikfout een juiste term voor.
- **Wijziging:** breidt R-009 uit; alle criteria van R-009 blijven gelden.
- **Acceptatiecriteria:**
  - [ ] Een term die exact (volgens de sleutel, in beide talen) een naam of synoniem van een item is, vindt alle recepten die dat item bevatten, ongeacht formaat: "brocoli" vindt een recept met broccoli, "tomate" vindt een recept met tomaat. Het formaat speelt geen rol.
  - [ ] Ook het oude gedrag blijft: een term die als deel in de naam van een ingrediënt voorkomt (ook in vrije tekst) vindt het recept; "feta" vindt "fetakaas".
  - [ ] Is de term geen exact item maar zijn er suggesties volgens R-019 (zonder "begint met"), dan staat er onder het zoekveld "Bedoelde u <naam>?"; tikken erop vervangt de term en zoekt opnieuw. De resultaten van de term zoals getypt blijven ondertussen zichtbaar ("Niets gevonden" als er niets is).
  - [ ] "Zonder" gebruikt dezelfde herkenning: zonder "brocoli" laat recepten met broccoli weg.
  - [ ] Twee termen die hetzelfde item aanduiden (bv. "broccoli" en "brocoli") tellen als één: de tweede wordt niet toegevoegd en de app meldt "Al toegevoegd.".
  - [ ] De zoekresultaten zijn onafhankelijk van de interfacetaal: dezelfde term geeft in Nederlands en Frans dezelfde recepten.
  - [ ] Zoeken combineert nog steeds met alle filters (tijd, gerief, tags, favorieten).
- **Buiten scope:** Automatische meervoudsherkenning ("tomaten" vindt "tomaat" alleen via een synoniem of als deel van de naam), betekenisverwantschap, zoeken in stappen.

---

## Reviews en favorieten

### R-012 — Reviews
- **Status:** Goedgekeurd
- **Beschrijving:** Gebruikers beoordelen recepten met sterren en een optionele tekst.
- **Acceptatiecriteria:**
  - [ ] Score is verplicht, een geheel getal van 1 tot en met 5; 0 of 6 wordt geweigerd.
  - [ ] Tekst is optioneel, hoogstens 500 tekens; 501 tekens wordt geweigerd.
  - [ ] Een gebruiker heeft per recept hoogstens één review, ook op het eigen recept; een tweede toevoegen kan niet, maar de bestaande aanpassen of verwijderen wel.
  - [ ] Het recept toont het gemiddelde (afgerond op 1 decimaal, bv. 4,3) en het aantal reviews; zonder reviews staat er "Nog geen reviews" en geen gemiddelde.
  - [ ] Het overzicht toont het gemiddelde en kan sorteren op beoordeling (aflopend; recepten zonder review staan onderaan).
  - [ ] Reviews staan nieuwste eerst, met auteur en datum.
  - [ ] Een gebruiker kan alleen eigen reviews wijzigen of verwijderen; een beheerder kan elke review verwijderen. Het verwijderen van een recept verwijdert zijn reviews.
  - [ ] Reviews tellen niet mee in de grootte-limiet van het recept (R-004).
- **Buiten scope:** Foto's bij reviews, antwoorden op reviews, "nuttig"-stemmen.

### R-014 — Favorieten
- **Status:** Goedgekeurd
- **Beschrijving:** Een gebruiker bewaart recepten in een eigen favorietenlijst.
- **Acceptatiecriteria:**
  - [ ] Op overzicht en detailpagina staat een hartje om een recept toe te voegen of te verwijderen; de toestand is meteen zichtbaar.
  - [ ] De ingang "Favorieten" in de navigatie toont alleen de favorieten van de aangemelde gebruiker; andere gebruikers zien die lijst niet.
  - [ ] Zijn er geen favorieten, dan staat er "Nog geen favorieten.".
  - [ ] Zoeken en filteren (R-007, R-008, R-009, R-010, R-011) werken ook binnen de favorieten.
  - [ ] Een verwijderd recept verdwijnt uit alle favorietenlijsten.
  - [ ] Een gebruiker kan een recept maar één keer als favoriet markeren.
- **Buiten scope:** Favorieten delen, mappen of lijsten.

---

## Taal

### R-023 — Tweetalige interface
- **Status:** Goedgekeurd
- **Beschrijving:** De hele interface is beschikbaar in het Nederlands en het Frans. De gebruiker kiest zelf.
- **Wijziging:** vervangt de eis "interface Nederlands" (CLAUDE.md, Niet-functionele eisen) door "Nederlands en Frans".
- **Acceptatiecriteria:**
  - [ ] Alle zichtbare teksten staan in `nl.json` en `fr.json`. Beide bestanden hebben exact dezelfde sleutels, geen lege waarden en dezelfde plaatsaanduidingen (bv. `{n}`); een test controleert dat.
  - [ ] Een taalkeuze (Nederlands / Français) staat op het aanmeldscherm en op Profiel. De keuze blijft bewaard op het toestel, ook na herladen en opnieuw openen.
  - [ ] Bij het eerste bezoek zonder keuze: de browsertaal begint met "fr" → Frans, anders Nederlands.
  - [ ] Wisselen werkt meteen zonder herladen, ook op een open pagina; `<html lang>` en de paginatitel volgen de taal.
  - [ ] Onder de teksten vallen ook melding- en foutteksten, bevestigingsvragen, labels voor schermlezers (`aria-label`) en plaatsaanduidingen in velden; er wordt geen tekst rechtstreeks uit de databank of uit code getoond.
  - [ ] Getalnotatie volgt de taal: 0,25 in het Nederlands en in het Frans; tijd "1 u 30 min" in het Nederlands, "1 h 30 min" in het Frans; datums in de notatie van de taal (nl-BE / fr-BE). Een hoeveelheid invoeren accepteert zowel komma als punt, in beide talen.
  - [ ] De inlogmail (onderwerp en tekst) bevat Nederlands en Frans, Nederlands eerst; ze wordt gegenereerd uit beide tekstbestanden door `scripts/make-email-templates.mjs`.
  - [ ] In het Nederlands blijven alle teksten letterlijk zoals nu, zodat bestaande tests slagen.
  - [ ] In beide talen past elk scherm op 360 px breed zonder horizontaal scrollen en zonder afgesneden knoptekst.
  - [ ] Teksten van gebruikers (titel, stappen, bron, opmerking, review, namen) worden niet vertaald.
- **Buiten scope:** Meer dan twee talen, taal per account bewaren, automatisch vertalen van recepten, rechts-naar-linksschrift.

### R-024 — Tweetalige gegevens
- **Status:** Goedgekeurd
- **Beschrijving:** Ingrediënten, eenheden, tags en kookgerief uit de databank tonen zich in de taal van de lezer, zodat een Franstalige gebruiker "soupe" en "pomme de terre" ziet waar een Nederlandstalige "soep" en "aardappel" ziet.
- **Acceptatiecriteria:**
  - [ ] Ingrediënt- en eenhedennamen (R-018) worden getoond in de interfacetaal: de Nederlandse naam in het Nederlands, de Franse naam in het Frans; ontbreekt die taal, dan de andere naam. Dit geldt op de detailpagina, in het formulier, in suggesties en in het overzicht van zoekresultaten.
  - [ ] De startlijst-tags van R-010 en R-011 hebben een Nederlandse en een Franse naam (bv. soep / soupe, vegetarisch / végétarien, winter / hiver) en tonen zich in de taal van de lezer.
  - [ ] Kookgerief krijgt een startlijst (R-008 had er geen): oven / four, kookplaat / plaque de cuisson, microgolfoven / micro-ondes, airfryer / friteuse à air chaud, Thermomix / Thermomix, staafmixer / mixeur plongeant, blender / blender, keukenrobot / robot de cuisine, slowcooker / mijoteuse, barbecue / barbecue. Deze items staan altijd als keuze in het formulier en in het filter, ook als nog geen recept ze gebruikt. Bestaand kookgerief waarvan de sleutel gelijk is aan een naam uit de startlijst (bv. "Oven") wordt dat startlijst-item.
  - [ ] Door gebruikers toegevoegde tags en kookgerief hebben één naam, die in beide talen getoond wordt.
  - [ ] Filteren op een tag of kookgerief werkt over talen heen: een recept met tag soep komt in het overzicht bij het filter "soupe".
  - [ ] De controle "bestaat al" bij een nieuwe tag of nieuw kookgerief (R-008, R-010, R-011) vergelijkt met de namen in beide talen: een Franstalige gebruiker die "soupe" toevoegt, krijgt de bestaande tag soep.
  - [ ] Sorteren en alfabetische lijsten gebruiken de getoonde naam in de taal van de lezer.
- **Buiten scope:** Vertalingen van door gebruikers toegevoegde tags en kookgerief (geparkeerd), vertalen van tekst van auteurs.

### R-026 — Frans in plaats van Engels
- **Status:** Goedgekeurd
- **Beschrijving:** De tweede taal van de app is Frans, niet Engels. Wat al met Engels als tweede taal is gebouwd (R-018 t/m R-023), wordt omgezet; alles wat daarna komt, gebruikt meteen Frans.
- **Wijziging:** vervangt "Engels" door "Frans" in R-018, R-019, R-020, R-021, R-022, R-023 en R-024; de criteria daar zijn al aangepast.
- **Acceptatiecriteria:**
  - [ ] `en.json` bestaat niet meer. `fr.json` heeft exact dezelfde sleutels als `nl.json`, geen lege waarden en dezelfde plaatsaanduidingen, en is een volledige Franse vertaling (Belgisch Frans waar dat uitmaakt).
  - [ ] De taalcode "en" bestaat nergens meer; de keuze is "nl" of "fr". Een eerder opgeslagen keuze "en" op een toestel veroorzaakt geen fout: de app valt terug op de browsertaal (fr → Frans, anders Nederlands).
  - [ ] De kolommen en velden met de Engelse naam in de databank, de API en de client heten nu "Franse naam" (`name_fr`). De nog niet online gezette migraties van de catalogus worden daarvoor rechtstreeks aangepast; er blijft geen kolom of veld met "en" achter.
  - [ ] De startlijsten (minstens 150 ingrediënten, 25 eenheden) hebben Franse in plaats van Engelse namen, met de voorbeelden uit R-018 (aardappel / pomme de terre, tomaat / tomate, el / c. à soupe, enzovoort) en de Franse spelling die in het Nederlands gangbaar is als synoniem.
  - [ ] De formaten tonen "petite taille", "taille moyenne" en "grande taille" in het Frans; "2 aardappel (groot)" in het Nederlands blijft.
  - [ ] De inlogmail bevat Nederlands en Frans; getal-, tijd- en datumnotatie volgen R-023.
  - [ ] Alle bestaande tests slagen na de omzetting: tests die de tweede taal gebruiken, draaien met "fr" en Franse zoektermen (bv. "tomate", "pomme de terre"); geen test of bronbestand bevat nog Engelse gebruikerstermen als testgegevens of een verwijzing naar "en.json".
  - [ ] Elk scherm past in beide talen op 360 px zonder horizontaal scrollen (Franse teksten zijn vaak langer).
- **Buiten scope:** Engels als derde taal, vertalen van recepttekst.

---

## Niet-functionele eisen
- **Techniek:** React + TypeScript (PWA), Supabase (Postgres, aanmelden, bestandsopslag, rij-niveau-regels). Tests: Vitest (logica) en Playwright (interface). Toegestane Postgres-extensies voor R-019: pg_trgm, fuzzystrmatch en unaccent.
- **Platform:** moderne mobiele browsers (iOS Safari en Android Chrome, laatste twee hoofdversies); ook bruikbaar op desktop.
- **Distributie:** gehost als web-app; installeren via "Toevoegen aan beginscherm".
- **Taal:** interface Nederlands en Frans (R-023); code, identifiers en commentaar Engels.
- **Offline/online:** alleen online.
- **Veiligheid:** geen geheime sleutels in de client; rechten via rij-niveau-regels in de databank; elke invoer wordt ook in de databank gevalideerd.
- **Kernbeslissingen:** zie `CLAUDE.md`. Die wijzig je niet zonder overleg.

## Beslissingen
Door de eigenaar gekozen (2026-11-01):
- **Platform (R-001):** web-app (PWA), niet native.
- **Aanmelden (R-002):** uitnodigingscode + e-mail; inloglink én code van 6 cijfers in dezelfde mail zodat het ook werkt in de geïnstalleerde app op iPhone (2026-11-01).
- **Grootte (R-004, R-005):** 2 MB per recept, maximaal 3 foto's.
- **Tags (R-010, R-011):** startlijst, gebruikers voegen toe.
- **Rechten (R-003, R-017):** alleen eigen recepten wijzigen; beheerder kan alles verwijderen. Wie iets wil aanpassen aan andermans recept, maakt een variant.
- **Zoeken (R-009):** alle ingrediënten, plus "zonder", plus "x van de y".
- **Reviews (R-012):** 1–5 sterren + tekst, één per gebruiker, eigen recept mag ook.
- **Offline (R-001):** alleen online.
- **Varianten (R-006):** alles kopiëren, inclusief foto's.
- **Techniek:** React + TypeScript PWA met Supabase.
- **Testomgeving:** lokale Supabase via Docker Desktop (2026-11-01); Docker moet op de bouw-pc geïnstalleerd zijn voor de loop start.
- **Extra's in ronde 1:** porties + omrekenen (R-013), favorieten (R-014), bron/opmerking (R-015).
- **Ontwerp (R-016):** `frontend-design`-skill gebruiken voor de UI.

Door de eigenaar gekozen (2026-11-06, tweede ronde):
- **Ingrediënten en eenheden (R-018, R-020):** uit een gedeelde databank met synoniemen; bij een nieuw item vraagt de app of het mag worden opgeslagen; wat de gebruiker opslaat is meteen voor iedereen beschikbaar, een beheerder voegt achteraf samen of verwijdert (R-022).
- **Eenheden (R-018):** startlijst plus toevoegen door gebruikers, zoals ingrediënten.
- **Woordnabijheid (R-019):** Levenshtein-afstand en andere gangbare algoritmen; de app stelt voor ("Bedoelde u broccoli?").
- **Tweetalig (R-023, R-024):** interface én namen van ingrediënten, eenheden, tags en kookgerief in Nederlands en Frans (de eigenaar koos Frans als tweede taal, niet Engels); recepttekst blijft zoals de auteur ze schreef.
- **Formaat (R-020):** vaste keuze klein / middelgroot / groot bij een ingrediëntregel, terwijl het ingrediënt hetzelfde blijft ("aardappel").
- **Bewerken van een recept:** bestond al (R-003); geen nieuwe requirement.
- **Tweede taal (R-026, 2026-11-06):** Frans in plaats van Engels, voor de hele app; kookgerief krijgt een startlijst met Nederlandse en Franse namen (R-024).
- **Icoon (R-025):** een koksmuts, zonder snor (2026-11-06).

Standaardkeuzes die ik zelf invulde (niet apart besproken; pas aan als ze niet kloppen):
- Aanmelden zonder wachtwoord via inloglink; code eenmalig, 7 dagen geldig; weergavenaam 2–40 tekens (R-002).
- Tijd maximaal 4320 min; titel 1–100 tekens; foto's max 1280 px en 500 KB, JPEG-omzetting op het toestel (R-003, R-005, R-007).
- Binnen één tag-groep geldt "één van"; tussen groepen "en" (R-010).
- Varianten van varianten toegelaten, met familie-overzicht (R-006).
- Reviews tellen niet mee in de 2 MB-limiet; reviewtekst max 500 tekens (R-012).
- Porties verplicht, 1–99; omrekenen alleen in het scherm, niet opgeslagen (R-013).
- Vier ingangen in de navigatie: Recepten, Favorieten, Nieuw, Profiel (R-016).
- Drempels voor "Bedoelde u": afstand 1 bij 4–5 tekens, 2 bij 6–9, 3 bij 10 of meer; trigramgelijkenis minstens 0,35; hoogstens 5 suggesties; Soundex/Metaphone niet gebruikt (R-019).
- Eerste taal volgt de browser (fr → Frans, anders Nederlands); de keuze wordt op het toestel bewaard, niet in het account (R-023).
- Tags en kookgerief van gebruikers hebben één naam die in beide talen getoond wordt (R-024).
- Een nieuw item heeft één naam (in de taal van de gebruiker); de beheerder vult de andere taal later aan (R-018, R-022).
- Icoon: crème muts op tomaatrood, zelf getekend als SVG, zonder snor en zonder tekst (R-025).
- Een formaat telt als eigenschap van de regel, niet als eigen ingrediënt; het blijft bij omrekenen gelijk (R-020).

## Geparkeerd (nog geen requirement)
- Tags door een beheerder laten verwijderen of samenvoegen. Nodig: beslissen wie dat doet en wat er met recepten gebeurt.
- Account verwijderen en wat er dan met recepten en reviews gebeurt.
- Vertalingen van door gebruikers toegevoegde tags en kookgerief. Nodig: beslissen wie ze vertaalt (beheerder of automatisch).

## Toekomst (geen requirement, context voor de analist)
- Donkere modus.
- Offline lezen van recent bekeken recepten.
- Boodschappenlijst op basis van een recept.
- Delen van een recept met iemand zonder account.
- Meer talen dan Nederlands en Frans (bv. Engels); automatisch vertalen van recepttekst.
- Eenheden omzetten (g ↔ kg, el ↔ ml) nu de eenheden in een databank staan.
