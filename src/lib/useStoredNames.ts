import { useCallback, useEffect, useState } from 'react';
import { getLanguage } from '../i18n/language';
import { findItem, shownName, type NamedItem } from './namedItems';
import { fetchEquipmentCatalog, fetchTagCatalog } from './recipes';
import type { TagKind } from './tags';

export type NameGroup = TagKind | 'equipment';

type Catalog = Record<NameGroup, NamedItem[]>;

export interface StoredNames {
  /** A stored (canonical) name in the reader's language; unknown names show the stored text. */
  shown: (group: NameGroup, name: string) => string;
  /** The canonical name for a name in either language (a hand-typed URL); unknown names stay as they are. */
  canonical: (group: NameGroup, name: string) => string;
}

/**
 * Looks names stored in a recipe up in the catalogue by key. A catalogue that did not load shows the
 * stored text. Call useLanguage() in the component too: `shown` reads the current language when it runs.
 */
export function useStoredNames(): StoredNames {
  const [catalog, setCatalog] = useState<Catalog | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([fetchTagCatalog(), fetchEquipmentCatalog()]).then(([tags, equipment]) => {
      // Silent fallback on purpose: the recipe itself loaded and stays readable with the stored (Dutch)
      // names. A banner here would block nothing and the other lists on the page report their own errors.
      if (!active || tags.error || equipment.error) return;
      setCatalog({ ...tags.items, equipment: equipment.items });
    });
    return () => {
      active = false;
    };
  }, []);

  const shown = (group: NameGroup, name: string) => {
    const item = catalog ? findItem(catalog[group], name) : undefined;
    return item ? shownName(item, getLanguage()) : name;
  };
  const canonical = useCallback(
    (group: NameGroup, name: string) => (catalog ? (findItem(catalog[group], name)?.name ?? name) : name),
    [catalog],
  );
  return { shown, canonical };
}
