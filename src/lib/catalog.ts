// Keys of the ingredient and unit catalogues (R-018). No Supabase import, so unit tests load it without
// environment variables.

/** Same idea as the database's item_key(): trimmed, lower case, no accents, runs of whitespace as one space. */
export function itemKey(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** A line's pointer to a catalogue item, with the key of the text at the time it was loaded. */
export interface IngredientRef {
  id: string;
  key: string;
}

export type UnitRef = IngredientRef;

/** The pointer survives only while the text still has the key it had when the pointer was set. */
export function keepRef(ref: IngredientRef | undefined, text: string): string | undefined {
  return ref && itemKey(text) === ref.key && ref.key !== '' ? ref.id : undefined;
}
