// Suggestions for ingredients and units (R-019). Pure logic without a Supabase import, so unit tests load it
// without environment variables; the RPC call lives in suggestApi.ts.
import { createDebouncer } from './ingredientSearch';

export type SuggestKind = 'ingredient' | 'unit';
/** autocomplete: with begins-with rows; didYouMean: without (search screen). */
export type SuggestMode = 'autocomplete' | 'didYouMean';
export type MatchKind = 'exact' | 'prefix' | 'similar';

export interface Suggestion {
  id: string;
  nameNl: string | null;
  nameFr: string | null;
  /** Name or synonym as stored, so the form can show "brocoli → broccoli". */
  matched: string;
  matchKind: MatchKind;
  distance: number | null;
  similarity: number;
}

/** The exact row, if any: the typed text is a known name or synonym. */
export const exactHit = (rows: Suggestion[]): Suggestion | undefined => rows.find((r) => r.matchKind === 'exact');

/** "Bedoelde u" rows: only `similar`, and none at all once there is an exact hit. Completions are no suggestion. */
export function didYouMean(rows: Suggestion[]): Suggestion[] {
  if (exactHit(rows)) return [];
  return rows.filter((r) => r.matchKind === 'similar');
}

/** Pause in typing before the call; at most 300 ms (R-019). */
export const SUGGEST_DEBOUNCE_MS = 250;

export interface SuggestionLoader {
  update(term: string): void;
  cancel(): void;
}

/**
 * Debounces the fetch and passes on only the answer to the latest input: every input and cancel() bumps a
 * sequence number, and an answer with an older number is dropped.
 */
export function createSuggestionLoader(options: {
  fetch: (term: string) => Promise<Suggestion[]>;
  onResult: (rows: Suggestion[]) => void;
  delayMs?: number;
}): SuggestionLoader {
  let seq = 0;
  const run = createDebouncer((term: string) => {
    const mine = seq;
    options
      .fetch(term)
      .then((rows) => {
        if (mine === seq) options.onResult(rows);
      })
      .catch(() => {
        // A failed call leaves the previous suggestions; the caller's fetch reports connection problems.
      });
  }, options.delayMs ?? SUGGEST_DEBOUNCE_MS);
  return {
    update(term) {
      seq += 1;
      const trimmed = term.trim();
      if (trimmed === '') {
        run.cancel();
        options.onResult([]);
        return;
      }
      run(trimmed);
    },
    cancel() {
      seq += 1;
      run.cancel();
    },
  };
}
