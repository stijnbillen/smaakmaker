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
