/**
 * Shown in the overview for a recipe without photos: a simple pot with steam, drawn in the text colour
 * of its frame (currentColor) so it follows the tokens. Decorative, so hidden from screen readers.
 */
export function RecipePhotoPlaceholder() {
  return (
    <svg
      className="photo-placeholder"
      data-testid="recipe-photo-placeholder"
      viewBox="0 0 64 48"
      aria-hidden="true"
      focusable="false"
    >
      <g fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 22h36v10a10 10 0 0 1-10 10H24a10 10 0 0 1-10-10z" />
        <path d="M10 22h44" />
        <path d="M50 26h5a3 3 0 0 1 0 6h-5" />
        <path d="M24 16c-2-3 2-5 0-8M32 16c-2-3 2-5 0-8M40 16c-2-3 2-5 0-8" />
      </g>
    </svg>
  );
}
