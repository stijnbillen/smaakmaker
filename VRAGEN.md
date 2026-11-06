# Open vragen van de bouwloop

De loop zet hier vragen neer als een taak niet verder kan zonder jouw keuze. Beantwoord ze door bij `Antwoord:` de gekozen optie in te vullen en `Status:` op `beantwoord` te zetten, of via de sessie.

Een vraag heeft deze vorm:

```
## T-xxx — korte titel
Status: open
Vraag: ...
Opties:
1. ...
2. ...
Aanbeveling: ...
Antwoord:
```

Zodra `Status:` op `beantwoord` staat en `Antwoord:` ingevuld is, pakt de loop de taak weer op.

---

## T-003 — Inloglink werkt niet in de geïnstalleerde app op iPhone
Status: beantwoord
Vraag: R-002 zegt "inloglink per e-mail, geen wachtwoord". Op een iPhone heeft een app die via "Zet op beginscherm" geïnstalleerd is, eigen opslag, los van Safari. Een link in de mail opent altijd in Safari. Wie de geïnstalleerde app gebruikt, wordt dan in Safari aangemeld en blijft in de app afgemeld. Op Android speelt dit niet, omdat Chrome en de geïnstalleerde app hun opslag delen. iOS Safari is een doelplatform (zie niet-functionele eisen). Hoe moet aanmelden werken?
Opties:
1. Alleen de inloglink, zoals de requirement nu zegt. Op een iPhone werkt aanmelden dan alleen in Safari, niet in de geïnstalleerde app. We zetten in de app een uitleg op het aanmeldscherm.
2. Dezelfde mail bevat de inloglink én een code van 6 cijfers. Het aanmeldscherm krijgt een veld "Code uit de e-mail". De link werkt zoals nu, en wie in de geïnstalleerde app zit, typt de code over. Supabase ondersteunt dit standaard, zonder wachtwoord en zonder extra dienst.
3. Alleen een code van 6 cijfers per mail, zonder link. Dat werkt overal hetzelfde, maar wijkt af van de kernbeslissing "aanmelden met inloglink" in `CLAUDE.md`.
Aanbeveling: optie 2. De kernbeslissing blijft staan (er is nog steeds een inloglink en geen wachtwoord), en de app werkt op elke gsm, ook geïnstalleerd op een iPhone. Het kost één extra veld en een aangepaste mailtekst (Nederlands).
Antwoord: 2. Inloglink én code van 6 cijfers in dezelfde mail; veld "Code uit de e-mail" op het aanmeldscherm (door de eigenaar gekozen, 2026-11-01).

## T-023 — Kookgerief heeft geen startlijst
Status: beantwoord
Vraag: R-024 crit. 2 zegt dat "het startlijst-kookgerief van R-008" een Nederlandse en een Engelse naam krijgt. Maar R-008 heeft geen startlijst, en de databank ook niet: elk kookgerief-item is door een gebruiker toegevoegd (de voorbeelden Thermomix, oven, airfryer staan alleen in de beschrijving). Volgens crit. 3 heeft door gebruikers toegevoegd kookgerief één naam, die in beide talen gelijk blijft. Zonder startlijst wordt dus geen enkel kookgerief vertaald. Wat wil je?
Opties:
1. Kookgerief krijgt een startlijst met twee namen, via een nieuwe migratie. Voorstel: oven / oven, kookplaat / hob, microgolfoven / microwave, airfryer / air fryer, Thermomix / Thermomix, staafmixer / hand blender, blender / blender, keukenrobot / food processor, slowcooker / slow cooker, barbecue / barbecue. Deze items staan altijd als keuze in het formulier en in het filter, ook als nog geen recept ze gebruikt (zoals de tags). Bestaand kookgerief met dezelfde naam (bv. "Oven") wordt het startlijst-item.
2. Geen startlijst voor kookgerief. Crit. 2 geldt alleen voor de tags; alle kookgerief heeft één naam, in beide talen. De requirement wordt daarop aangepast.
3. Geen startlijst, maar kookgerief krijgt wel een (lege) kolom voor de Engelse naam. De beheerder vult die later in bij het beheer van de databank; tot dan blijft de naam in beide talen gelijk.
Aanbeveling: optie 1. Ze sluit aan bij wat crit. 2 bedoelt en werkt zoals de tags: een Engelstalige gebruiker ziet meteen "hob" en "microwave", en "microwave" toevoegen geeft de bestaande microgolfoven (crit. 5). De lijst kun je hier aanpassen voor de bouw begint.
Antwoord: 1, maar met Frans als tweede taal in plaats van Engels (door de eigenaar gekozen, 2026-11-06). Startlijst met Nederlandse en Franse namen: oven / four, kookplaat / plaque de cuisson, microgolfoven / micro-ondes, airfryer / friteuse à air chaud, Thermomix / Thermomix, staafmixer / mixeur plongeant, blender / blender, keukenrobot / robot de cuisine, slowcooker / mijoteuse, barbecue / barbecue. De taak T-022 (R-026) zet de hele app van Engels naar Frans; de taak voor dit gerief is nu T-023 (R-024).
