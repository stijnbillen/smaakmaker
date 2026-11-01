const GATEWAY_STATUSES = new Set([502, 503, 504]);

/**
 * True when the database gave no answer (network failure) or a gateway error.
 * Answers from the server itself (4xx, 500) are not connection errors: they
 * carry their own message, e.g. a row-level-security rejection.
 */
export function isConnectionError(error: unknown): boolean {
  if (error === null || error === undefined) return false;
  if (error instanceof TypeError) return true; // fetch rejects with TypeError when offline
  if (typeof error === 'object') {
    const status = (error as { status?: unknown }).status;
    if (typeof status !== 'number' || status === 0) return true;
    return GATEWAY_STATUSES.has(status);
  }
  return false;
}
