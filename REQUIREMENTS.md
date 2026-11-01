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

### R-002 — Aanmelden met uitnodigingscode
- **Status:** Goedgekeurd
- **Beschrijving:** Alleen wie een uitnodigingscode heeft, kan een account maken. Aanmelden gaat met e-mailadres (inloglink per e-mail, geen wachtwoord).
- **Acceptatiecriteria:**
  - [ ] Zonder geldige uitnodigingscode kan geen account worden gemaakt; een ongeldige of gebruikte code geeft "Deze code is niet geldig.".
  - [ ] Een code is eenmalig bruikbaar en vervalt 7 dagen na aanmaken (op 7 × 24 uur precies is ze nog geldig, 1 seconde later niet meer).
  - [ ] Een gebruiker geeft bij het eerste aanmelden een weergavenaam van 2–40 tekens op; 1 of 41 tekens wordt geweigerd.
  - [ ] Een ongeldig e-mailadres wordt geweigerd met een melding bij het veld.
  - [ ] Zonder aanmelding zijn recepten, reviews en foto's niet leesbaar of schrijfbaar (ook niet rechtstreeks via de databank-API).
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
- **Buiten scope:** Tags met kleuren of iconen, hiërarchie.

### R-011 — Tags voor seizoen, dieet en stijl
- **Status:** Goedgekeurd
- **Beschrijving:** Een tweede groep tags: winter, zomer, lente, herfst, licht, vegetarisch, veganistisch, glutenvrij, snel. Gebruikers kunnen tags toevoegen.
- **Acceptatiecriteria:**
  - [ ] Werkt zoals R-010, maar als aparte groep ("Kenmerken") met eigen startlijst; dezelfde tagnaam mag in beide groepen bestaan.
  - [ ] Filters uit beide groepen zijn te combineren (bv. soep én vegetarisch).
  - [ ] Het filter "vegetarisch" gebruikt alleen de tag; ingrediënten worden niet gecontroleerd.
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
- **Buiten scope:** Verschillen tussen varianten tonen, een variant later aan een ander bronrecept koppelen.

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
- **Buiten scope:** Meervoud-/synoniemherkenning ("tomaten" vindt "tomaat" alleen als de term een deel van de naam is), zoeken in stappen.

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

## Niet-functionele eisen
- **Techniek:** React + TypeScript (PWA), Supabase (Postgres, aanmelden, bestandsopslag, rij-niveau-regels). Tests: Vitest (logica) en Playwright (interface).
- **Platform:** moderne mobiele browsers (iOS Safari en Android Chrome, laatste twee hoofdversies); ook bruikbaar op desktop.
- **Distributie:** gehost als web-app; installeren via "Toevoegen aan beginscherm".
- **Taal:** interface Nederlands; code, identifiers en commentaar Engels.
- **Offline/online:** alleen online.
- **Veiligheid:** geen geheime sleutels in de client; rechten via rij-niveau-regels in de databank; elke invoer wordt ook in de databank gevalideerd.
- **Kernbeslissingen:** zie `CLAUDE.md`. Die wijzig je niet zonder overleg.

## Beslissingen
Door de eigenaar gekozen (2026-11-01):
- **Platform (R-001):** web-app (PWA), niet native.
- **Aanmelden (R-002):** uitnodigingscode + e-mail.
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

Standaardkeuzes die ik zelf invulde (niet apart besproken; pas aan als ze niet kloppen):
- Aanmelden zonder wachtwoord via inloglink; code eenmalig, 7 dagen geldig; weergavenaam 2–40 tekens (R-002).
- Tijd maximaal 4320 min; titel 1–100 tekens; foto's max 1280 px en 500 KB, JPEG-omzetting op het toestel (R-003, R-005, R-007).
- Binnen één tag-groep geldt "één van"; tussen groepen "en" (R-010).
- Varianten van varianten toegelaten, met familie-overzicht (R-006).
- Reviews tellen niet mee in de 2 MB-limiet; reviewtekst max 500 tekens (R-012).
- Porties verplicht, 1–99; omrekenen alleen in het scherm, niet opgeslagen (R-013).
- Vier ingangen in de navigatie: Recepten, Favorieten, Nieuw, Profiel (R-016).

## Geparkeerd (nog geen requirement)
- Tags door een beheerder laten verwijderen of samenvoegen. Nodig: beslissen wie dat doet en wat er met recepten gebeurt.
- Account verwijderen en wat er dan met recepten en reviews gebeurt.

## Toekomst (geen requirement, context voor de analist)
- Donkere modus.
- Offline lezen van recent bekeken recepten.
- Boodschappenlijst op basis van een recept.
- Delen van een recept met iemand zonder account.
