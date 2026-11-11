# Smaakmaker — voortgang

Eén taak per goedgekeurde requirement uit `REQUIREMENTS.md`, in bouwvolgorde. Een taak is klaar als de acceptatiecriteria van de requirement automatisch gecontroleerd zijn, build en tests slagen, en het savepoint (git-commit) gemaakt is.

## Legenda
- `[ ]` open
- `[~]` bezig
- `[x]` klaar (build en tests geslaagd, gecommit)
- `[!]` geblokkeerd (reden staat bij de taak)

Nieuw project: er zijn geen requirements met status "Bestaand", dus er is geen fase voor bestaand gedrag (`BestaandTotTaak = 0`).

---

## Fase 1 — Basis

- [x] **T-001** — R-001: Web-app, gedeelde databank en mobiel gebruik
- [x] **T-002** — R-016: Navigatie en visuele stijl (afhankelijk van T-001)
- [x] **T-003** — R-002: Aanmelden met uitnodigingscode (afhankelijk van T-001, T-002)
- [x] **T-004** — R-017: Beheerder (afhankelijk van T-003)

## Fase 2 — Recepten

- [x] **T-005** — R-003: Recept toevoegen en bewerken (afhankelijk van T-003). Ook: knop Verwijderen met bevestiging, ook voor de beheerder (R-017 crit. 3); gebruik `canDelete` en `is_admin()`; 0 rijen = mislukt.
- [x] **T-006** — R-007: Preptijd en totale doorlooptijd (afhankelijk van T-005)
- [x] **T-007** — R-013: Porties en omrekenen (afhankelijk van T-005)
- [x] **T-008** — R-015: Bron en opmerking (afhankelijk van T-005)
- [x] **T-009** — R-008: Kookgerief (afhankelijk van T-005)
- [x] **T-010** — R-010: Tags voor soort gerecht (afhankelijk van T-005)
- [x] **T-011** — R-011: Tags voor seizoen, dieet en stijl (afhankelijk van T-010)

## Fase 3 — Foto's en varianten

- [x] **T-012** — R-005: Foto's (afhankelijk van T-005)
- [x] **T-013** — R-004: Beperking van de grootte (afhankelijk van T-012, T-008)
- [x] **T-014** — R-006: Varianten (afhankelijk van T-013, T-006, T-007, T-009, T-011)

## Fase 4 — Zoeken, reviews en favorieten

- [x] **T-015** — R-009: Zoeken op ingrediënten (afhankelijk van T-005)
- [x] **T-016** — R-012: Reviews (afhankelijk van T-005)
- [x] **T-017** — R-014: Favorieten (afhankelijk van T-005, T-015)

## Fase 5 — Ingrediënten, eenheden en tweetaligheid

- [x] **T-018** — R-023: Tweetalige interface (afhankelijk van T-002, T-003)
- [x] **T-019** — R-018: Ingrediënten- en eenhedendatabank (afhankelijk van T-004, T-005)
- [x] **T-020** — R-019: Woordnabijheid en suggesties (afhankelijk van T-019)
- [x] **T-021** — R-020: Ingrediënten en eenheden kiezen in het formulier (afhankelijk van T-005, T-014, T-018, T-019, T-020)
- [x] **T-022** — R-026: Frans in plaats van Engels (afhankelijk van T-018, T-019, T-020, T-021)
- [x] **T-023** — R-024: Tweetalige gegevens (afhankelijk van T-009, T-010, T-011, T-018, T-019, T-021, T-022)
- [x] **T-024** — R-021: Zoeken met synoniemen (afhankelijk van T-015, T-019, T-020, T-021, T-022)
- [x] **T-025** — R-022: Beheer van de databank (afhankelijk van T-004, T-019, T-021, T-022)
- [x] **T-026** — R-025: App-icoon, koksmuts (afhankelijk van T-002)

## Fase 6 — Uitnodigen per e-mail en overzicht

- [x] **T-027** — R-027: Gebruikers uitnodigen met e-mailadres (afhankelijk van T-003, T-004, T-018). Vervangt de uitnodigingscodes in de databank en op het scherm Uitnodigingen; de mail gaat vanuit de browser van de beheerder, zonder geheime sleutel.
- [x] **T-028** — R-002: Aanmelden met e-mailadres, zonder uitnodigingscode (afhankelijk van T-027). Haalt veld, knop en code-logica uit het aanmeldscherm en uit `auth.ts`; een onbekend adres krijgt geen mail.
- [x] **T-029** — R-028: Overzicht met verborgen filters en uitgebreid sorteren (afhankelijk van T-015, T-017, T-018)

## Fase 7 — Tijdfilter, temperatuur, weekmenu en boodschappenlijst

- [x] **T-030** — R-029: Tijdfilter met schuifregelaar en invulveld (afhankelijk van T-029)
- [x] **T-031** — R-031: Temperatuur in °C of °F (afhankelijk van T-008, T-018)
- [!] **T-032** — R-033: Eenheden omzetten, soort en factor (afhankelijk van T-021, T-025) — reden: eindcontrole faalt
- [ ] **T-033** — R-030: Weekmenu (afhankelijk van T-005, T-007, T-018)
- [ ] **T-034** — R-032: Boodschappenlijst (afhankelijk van T-032, T-033)

---

## Buiten deze lijst
- Geparkeerd: tags beheren door een beheerder, account verwijderen, vertalingen van door gebruikers toegevoegde tags en kookgerief.
- Toekomst: donkere modus, offline lezen, boodschappenlijst, recept delen zonder account, meer talen, eenheden omzetten.

## Notities
- Architectuurkeuzes die tijdens een taak vallen, komen achteraf in `docs/beslissingen.md`.
- Kernbeslissingen in `CLAUDE.md` wijzigt alleen de eigenaar.
- T-008 (bron/opmerking) telt mee in de groottelimiet van T-013; T-013 komt daarom ná T-008.
- Noem in een taakregel nooit een ander T-nummer binnen de haakjes na "afhankelijk van" voor iets anders dan een afhankelijkheid.
