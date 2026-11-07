// Equipment (cooking gear) rules shared by the form and the filter (R-008). The database enforces the
// same limits and decides on reuse; this client side gives a message at the field and picks the right button.
// No database import here: the unit tests load this file without a Supabase configuration.

import { addNamed, type NamedItem } from './namedItems';

export { EQUIPMENT_MAX_ITEMS } from './recipe';
export { shownName, sortByShownName, type NamedItem } from './namedItems';
export const EQUIPMENT_NAME_MAX = 30;

/** Counts code points after trimming, like the database does with its trim and char_length. */
const length = (value: string): number => [...value.trim()].length;

export type EquipmentNameResult = { ok: true } | { ok: false; error: 'equipmentInvalid' };

export function validateEquipmentName(name: string): EquipmentNameResult {
  const n = length(name);
  return n >= 1 && n <= EQUIPMENT_NAME_MAX ? { ok: true } : { ok: false, error: 'equipmentInvalid' };
}

/** Case- and accent-insensitive key; same outcome as the database's fold_key for Latin text. */
export function equipmentKey(name: string): string {
  return name
    .trim()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('nl');
}

/** Adds a typed name: the catalogue item with that Dutch or French name gives its canonical name. */
export function addEquipment(selected: readonly string[], catalog: readonly NamedItem[], input: string): string[] {
  return addNamed(selected, catalog, input);
}

export function toggleEquipment(selected: readonly string[], name: string): string[] {
  return selected.includes(name) ? selected.filter((n) => n !== name) : [...selected, name];
}
