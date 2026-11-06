import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SUGGEST_DEBOUNCE_MS,
  createSuggestionLoader,
  didYouMean,
  exactHit,
  type Suggestion,
} from '../../src/lib/suggest';

// T-020 / R-019: pure client logic of the suggestions. The module must load without Supabase env variables.
const row = (name: string, matchKind: Suggestion['matchKind'], extra: Partial<Suggestion> = {}): Suggestion =>
  ({ id: name, nameNl: name, nameEn: null, matched: name, matchKind, distance: null, similarity: 0.5, ...extra }) as Suggestion;

describe('didYouMean / exactHit (crit. 2, 5, 7)', () => {
  it('gives [] as soon as one row is exact, even with similar rows next to it', () => {
    const rows = [row('zout', 'exact'), row('zuur', 'similar')];
    expect(didYouMean(rows)).toEqual([]);
    expect(exactHit(rows)?.id).toBe('zout');
  });

  it('exact hit also silences the suggestion when the exact row is not first', () => {
    expect(didYouMean([row('zuur', 'similar'), row('zout', 'exact')])).toEqual([]);
  });

  it('keeps only similar rows and always drops prefix rows (a completion is not "Bedoelde u")', () => {
    const rows = [row('broccoli', 'prefix'), row('brood', 'similar'), row('brons', 'prefix')];
    expect(didYouMean(rows).map((r) => r.id)).toEqual(['brood']);
  });

  it('gives [] for prefix rows only and for no rows; exactHit gives nothing then', () => {
    expect(didYouMean([row('broccoli', 'prefix')])).toEqual([]);
    expect(didYouMean([])).toEqual([]);
    expect(exactHit([row('brood', 'similar')]) ?? null).toBeNull();
    expect(exactHit([]) ?? null).toBeNull();
  });

  it('keeps the order of the similar rows', () => {
    const rows = [row('b', 'similar'), row('a', 'similar')];
    expect(didYouMean(rows).map((r) => r.id)).toEqual(['b', 'a']);
  });
});

describe('createSuggestionLoader (crit. 9)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /** A fetch whose answers the test resolves by hand, in any order. */
  function manualFetch() {
    const calls: Array<{ term: string; resolve: (rows: Suggestion[]) => void }> = [];
    const fetch = vi.fn((term: string) => new Promise<Suggestion[]>((resolve) => calls.push({ term, resolve })));
    return { fetch, calls };
  }

  it('waits at most 300 ms: SUGGEST_DEBOUNCE_MS <= 300', () => {
    expect(SUGGEST_DEBOUNCE_MS).toBeGreaterThan(0);
    expect(SUGGEST_DEBOUNCE_MS).toBeLessThanOrEqual(300);
  });

  it('three inputs within 100 ms give one call with the last term, within 300 ms of the last input', async () => {
    const { fetch, calls } = manualFetch();
    const loader = createSuggestionLoader({ fetch, onResult: vi.fn(), delayMs: SUGGEST_DEBOUNCE_MS });
    loader.update('b');
    await vi.advanceTimersByTimeAsync(50);
    loader.update('br');
    await vi.advanceTimersByTimeAsync(50);
    loader.update('bro');
    expect(fetch).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(300);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(calls[0].term).toBe('bro');
  });

  it('passes the rows of the call to onResult', async () => {
    const onResult = vi.fn();
    const rows = [row('broccoli', 'prefix')];
    const loader = createSuggestionLoader({ fetch: async () => rows, onResult, delayMs: 100 });
    loader.update('bro');
    await vi.advanceTimersByTimeAsync(100);
    expect(onResult).toHaveBeenCalledTimes(1);
    expect(onResult).toHaveBeenCalledWith(rows);
  });

  it('ignores a late answer: of two calls, only the answer of the second reaches onResult', async () => {
    const { fetch, calls } = manualFetch();
    const onResult = vi.fn();
    const loader = createSuggestionLoader({ fetch, onResult, delayMs: 100 });
    loader.update('bro');
    await vi.advanceTimersByTimeAsync(100);
    loader.update('broc');
    await vi.advanceTimersByTimeAsync(100);
    expect(calls.map((c) => c.term)).toEqual(['bro', 'broc']);
    const second = [row('broccoli', 'prefix')];
    calls[1].resolve(second);
    await vi.advanceTimersByTimeAsync(0);
    calls[0].resolve([row('brood', 'prefix')]); // the first answers last
    await vi.advanceTimersByTimeAsync(0);
    expect(onResult).toHaveBeenCalledTimes(1);
    expect(onResult).toHaveBeenLastCalledWith(second);
  });

  it('ignores the first answer when it comes in before the second call is made', async () => {
    const { fetch, calls } = manualFetch();
    const onResult = vi.fn();
    const loader = createSuggestionLoader({ fetch, onResult, delayMs: 100 });
    loader.update('bro');
    await vi.advanceTimersByTimeAsync(100);
    loader.update('broc'); // the call for "bro" is still running, the new input makes it stale
    calls[0].resolve([row('brood', 'prefix')]);
    await vi.advanceTimersByTimeAsync(0);
    expect(onResult).not.toHaveBeenCalled();
  });

  it('an empty term (also after trimming) gives an empty list at once, without a call', async () => {
    const { fetch } = manualFetch();
    const onResult = vi.fn();
    const loader = createSuggestionLoader({ fetch, onResult, delayMs: 100 });
    loader.update('   ');
    expect(onResult).toHaveBeenCalledWith([]);
    loader.update('');
    expect(onResult).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(500);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('an empty term cancels a pending timer and invalidates a running call', async () => {
    const { fetch, calls } = manualFetch();
    const onResult = vi.fn();
    const loader = createSuggestionLoader({ fetch, onResult, delayMs: 100 });
    loader.update('bro');
    loader.update(''); // timer for "bro" must not fire
    await vi.advanceTimersByTimeAsync(300);
    expect(fetch).not.toHaveBeenCalled();

    loader.update('bro');
    await vi.advanceTimersByTimeAsync(100);
    expect(calls).toHaveLength(1);
    onResult.mockClear();
    loader.update(''); // the running call becomes stale
    expect(onResult).toHaveBeenCalledWith([]);
    onResult.mockClear();
    calls[0].resolve([row('broccoli', 'prefix')]);
    await vi.advanceTimersByTimeAsync(0);
    expect(onResult).not.toHaveBeenCalled();
  });

  it('after cancel() no onResult comes, neither for a pending timer nor for a running call', async () => {
    const { fetch, calls } = manualFetch();
    const onResult = vi.fn();
    const loader = createSuggestionLoader({ fetch, onResult, delayMs: 100 });
    loader.update('bro');
    loader.cancel();
    await vi.advanceTimersByTimeAsync(300);
    expect(fetch).not.toHaveBeenCalled();

    loader.update('bro');
    await vi.advanceTimersByTimeAsync(100);
    expect(calls).toHaveLength(1);
    loader.cancel();
    calls[0].resolve([row('broccoli', 'prefix')]);
    await vi.advanceTimersByTimeAsync(0);
    expect(onResult).not.toHaveBeenCalled();
  });
});
