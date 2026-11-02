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
- [!] **T-014** — R-006: Varianten (afhankelijk van T-013, T-006, T-007, T-009, T-011) — reden: build of tests falen na 3 pogingen

## Fase 4 — Zoeken, reviews en favorieten

- [!] **T-015** — R-009: Zoeken op ingrediënten (afhankelijk van T-005) — reden: review niet goedgekeurd na 2 rondes
- [x] **T-016** — R-012: Reviews (afhankelijk van T-005)
- [ ] **T-017** — R-014: Favorieten (afhankelijk van T-005, T-015)

---

## Buiten deze lijst
- Geparkeerd: tags beheren door een beheerder, account verwijderen.
- Toekomst: donkere modus, offline lezen, boodschappenlijst, recept delen zonder account.

## Notities
- Architectuurkeuzes die tijdens een taak vallen, komen achteraf in `docs/beslissingen.md`.
- Kernbeslissingen in `CLAUDE.md` wijzigt alleen de eigenaar.
- T-008 (bron/opmerking) telt mee in de groottelimiet van T-013; T-013 komt daarom ná T-008.
- Noem in een taakregel nooit een ander T-nummer binnen de haakjes na "afhankelijk van" voor iets anders dan een afhankelijkheid.
