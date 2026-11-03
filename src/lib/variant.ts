import { PHOTO_MAX_BYTES } from './photoResize';
import { draftFromRecord, type PhotoDraft, type RecipeDraft, type RecipeRecord } from './recipe';

// Pure logic of variants (R-006). A variant is a full recipe of its own; these helpers only build the
// starting copy and read the family. The database holds the real rules (source fixed, family fixed).

/**
 * The starting values of the variant form: everything of the source, and its photos as "still to copy".
 * Nothing is written or uploaded here; the files are copied only at "Opslaan". The source id and the
 * family are not part of the draft: the page passes the source id to `createRecipe` separately.
 */
export function variantDraft(record: RecipeRecord, sizes: ReadonlyMap<string, number>): RecipeDraft {
  const plain = draftFromRecord(record, sizes);
  const photos: PhotoDraft[] = (record.photos ?? []).map((p) => {
    // A file missing from the folder listing counts as the bucket maximum, like the database does.
    const bytes = sizes.get(p.path) ?? PHOTO_MAX_BYTES;
    // Keyed by the source path: stable, so two drafts of one record compare equal ("not changed"), and it
    // names the copy-to-do in the form and in the save session.
    return { key: p.path, copyFrom: p.path, previewUrl: '', main: p.main, bytes };
  });
  return { ...plain, photos };
}

/** A member of a family as the one family query returns it. */
export interface FamilyMember {
  id: string;
  title: string;
  variant_of: string | null;
  created_at: string;
  author: { display_name: string | null } | null;
}

export interface FamilyView {
  /** Recipes whose source is the current one, in the given order. */
  direct: FamilyMember[];
  /** The whole family, current recipe included, in the given order (oldest first). */
  all: FamilyMember[];
  n: number;
}

export function familyView(members: readonly FamilyMember[], currentId: string): FamilyView {
  return { direct: members.filter((m) => m.variant_of === currentId), all: [...members], n: members.length };
}

/** 'bron': the source exists; 'verwijderd': made as a variant but the source is gone; 'geen': not a variant. */
export function variantSourceLine(
  variantOf: string | null,
  familyId: string,
  id: string,
  _sourceTitle: string | null,
): 'bron' | 'verwijderd' | 'geen' {
  if (variantOf) return 'bron';
  return familyId !== id ? 'verwijderd' : 'geen';
}

/** A recipe made as a variant keeps that, also when its source is deleted. */
export const isVariant = (row: { id: string; family_id: string }): boolean => row.family_id !== row.id;
