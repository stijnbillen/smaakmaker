# T-022 — review (R-026: Frans in plaats van Engels), ronde na "eindcontrole faalt"

Beoordeeld: de werkkopie tegen `51ffcfa`. Dat omvat bron, migraties, templates, config en tests, plus de nieuwe bestanden `fr.json`, `tests/helpers/retired-lang.ts`, `tests/helpers/english-terms.ts` en `tests/unit/no-english.test.ts`.
`CLAUDE.md` is niet gewijzigd. Er is geen kernbeslissing geraakt:
- alle teksten staan in `nl.json` en `fr.json`, met dezelfde sleutels;
- de taalkeuze blijft op het toestel;
- de migraties zijn rechtstreeks aangepast, zoals crit. 3 toelaat.

`docs/loop-log.md` meldt een geslaagde build om 10:44. De losse `build.log` uit de vorige ronde is weg.
`VRAGEN.md`: de startlijst voor kookgerief hoort bij T-023, niet bij deze taak.

## Per criterium
1. `en.json` is verwijderd. `fr.json` wordt getest op sleutels, lege waarden, plaatsaanduidingen en verschil met de Nederlandse tekst. De vertaling is Belgisch Frans (chicon, cassonade, fromage blanc, c. à soupe). Gehaald.
2. Het type is `Language = 'nl' | 'fr'`, en `detectLanguage` geeft fr → Frans, anders Nederlands. Een opgeslagen "en" telt als geen keuze. Dat is getest in `language.test.ts:92-115` en `language.spec.ts:147-180`, met een controle op console- en paginafouten. De scan in `no-english.test.ts` heeft negatieve controles. Gehaald.
3. `name_fr` staat in de tabellen, de grants, `catalog_names_valid`, `add_*`, `suggest_*` en de clienttypes. De databank weigert de oude code met 22023 (getest). De scan op `name_en`/`nameEn` vindt niets. Gehaald.
4. De startlijst heeft Franse namen, met de voorbeelden uit R-018. Brocoli is de Franse naam en zit daarmee in de sleutels. Gedekt in `tests/db/catalog.test.ts`. Gehaald.
5. "petite taille", "taille moyenne" en "grande taille" staan in het Frans, en "2 aardappel (groot)" blijft. Getest. Gehaald.
6. De mail toont een Nederlands en een Frans blok (`lang="fr"`), met als onderwerp `{nl} / {fr}`. Getallen krijgen in beide talen een komma, met de locale `fr-BE`. De template wordt gegenereerd uit de tekstbestanden, en een test houdt de twee gelijk. Gehaald.
7. De tests draaien met "fr" en Franse termen. De scan op de oude Engelse termen staat in `no-english.test.ts`. Gehaald.
8. `layout.spec.ts` loopt over nl en fr op 360 px. Gehaald.

## Bevindingen

### 1. `tests/unit/no-english.test.ts:6` — laag — tester
Probleem: het commentaar bevat nog Nederlands ("the Engelse naam kolom"). Deze bevinding stond al in de vorige ronde. `CLAUDE.md` vraagt Engels commentaar.
Voorstel: vervang door "the English-name column".

### 2. `src/i18n/fr.json:56,58,59,127,132,156,174,177,193,195` — laag — ontwikkelaar
Probleem: voor `?` en `:` staat een gewone spatie. Op 360 px kan het leesteken daardoor alleen op een nieuwe regel belanden. Dezelfde teksten staan in de mailtemplates.
Voorstel: gebruik een vaste spatie (U+00A0 of U+202F) voor `?`, `:`, `!` en `;`. Genereer daarna de templates opnieuw met `scripts/make-email-templates.mjs`.
