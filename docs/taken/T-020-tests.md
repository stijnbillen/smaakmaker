# T-020 — Tests

Bestanden: `tests/db/catalog-suggest.test.ts` (crit. 1–8), `tests/unit/suggest.test.ts` (crit. 2, 5, 9).

## Gedekt
- Crit. 1: sleutels, accenten/hoofdletters/witruimte, Engelse naam, synoniem, `matched` met originele schrijfwijze.
- Crit. 2: databank ("zout" exact eerst) en unit (`didYouMean` leeg bij exact, `exactHit`).
- Crit. 3: `dl_distance` (alle voorbeelden), `dl_max_distance`, grenzen 4/6/10 tekens (trigram < 0,35 vooraf gecontroleerd), term van 3 tekens.
- Crit. 4: 0,36 voor tomaten/tomaat via trigram; grenspaar `qzvkabc` (≥ 0,35) in, `qzvkabcd` (< 0,35) uit, beide buiten de afstandsgrens (vooraf gecontroleerd); 1–3 tekens geen `similar`.
- Crit. 5: prefix in autocomplete, niet in didYouMean; 1 teken; `%`/`_`; dubbele rij als prefix/similar; unit: `prefix` weglaten.
- Crit. 6: volgorde exact/prefix/similar met 5 rijen, afstand/gelijkenis/alfabet, 8 kandidaten → 5, beste sleutel per item, nl/en zelfde set.
- Crit. 7: alle voorbeelden in beide modi.
- Crit. 8: eenheden, "blik" per soort, tags: "soepp" krijgt eigen tag.
- Crit. 9: debounce ≤ 300, drie invoeren één aanroep, late antwoorden genegeerd, lege term, `cancel()`.
- Extra: rechten (anon 42501, interne functies niet via `/rpc`), `p_lang` 22023, lege/null term.

## Afwijkingen / niet gedekt
- Crit. 1: testitem "Crème fraîche" kan niet via pg worden ingevoegd (staat al in de startlijst, sleutel `creme fraiche`, anders 23505); de test gebruikt het bestaande item.
- Crit. 6: "een exact-, twee prefix- en drie similar-items" is 6 kandidaten; de test verwacht 5 rijen (de derde `similar` valt af).
- Crit. 8, regressie tags/kookgerief: alleen de nieuwe "soepp"-test; de bestaande tagtests draaien ongewijzigd mee in de suite.
- Crit. 9, Playwright: volgt met het formulier (buiten deze taak).

## Aannames over de API (uit de brief)
- RPC `suggest_ingredients` / `suggest_units` met `p_term`, `p_autocomplete`, `p_lang`; kolommen `id, name_nl, name_en, matched, match_kind, distance, similarity`.
- `src/lib/suggest.ts` exporteert `SUGGEST_DEBOUNCE_MS`, `createSuggestionLoader({fetch, onResult, delayMs})` met `update`/`cancel`, `didYouMean`, `exactHit` (geeft `undefined`/`null` zonder exacte rij) en type `Suggestion` met `id, nameNl, nameEn, matched, matchKind, distance, similarity`. `fetch(term)` geeft een `Promise<Suggestion[]>`.
- Testnaad: geen aanpassing nodig in productiecode.

## Status
`npx tsc --noEmit`: faalt alleen op ontbrekende module `src/lib/suggest` (en daaruit volgende impliciete `any`). Tests zijn nog niet tegen de migratie gedraaid (die bestaat nog niet).
