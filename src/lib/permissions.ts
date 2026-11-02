/** Only the author edits; an administrator may delete but not edit. The database enforces the same rule. */
export function canEdit(item: { authorId: string | null }, viewer: { userId: string | null }): boolean {
  return viewer.userId !== null && item.authorId !== null && item.authorId === viewer.userId;
}

/** The author or an administrator may delete; the database enforces the same rule. */
export function canDelete(
  item: { authorId: string | null },
  viewer: { userId: string | null; isAdmin: boolean },
): boolean {
  if (viewer.isAdmin) return true;
  return viewer.userId !== null && item.authorId !== null && item.authorId === viewer.userId;
}
