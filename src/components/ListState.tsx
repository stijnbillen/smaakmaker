import type { ReactNode } from 'react';

interface ListStateProps {
  /** null while the data is still being fetched. */
  items: unknown[] | null;
  loadingText: string;
  emptyText: string;
  /** Rendered only when there is at least one item. */
  children: ReactNode;
}

/** Shared loading / empty / list states; every list in the app uses this. */
export function ListState({ items, loadingText, emptyText, children }: ListStateProps) {
  if (items === null) {
    return (
      <p role="status" className="list-state list-state--loading">
        <span className="spinner" aria-hidden="true" />
        {loadingText}
      </p>
    );
  }
  if (items.length === 0) return <p className="list-state">{emptyText}</p>;
  return <>{children}</>;
}
