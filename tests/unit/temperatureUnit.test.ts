import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getTemperatureUnit, loadTemperatureUnit, setTemperatureUnit, subscribe } from '../../src/lib/temperatureUnit';

// T-031 / R-031 crit. 1: the unit is kept on the device (like the language), default °C.
// Module state is shared between test files (vitest isolate:false), so each test ends on °C.

const KEY = 'smaakmaker.tempUnit';

function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

beforeEach(() => {
  vi.stubGlobal('localStorage', fakeStorage());
});

afterEach(() => {
  setTemperatureUnit('C');
  vi.unstubAllGlobals();
});

describe('loadTemperatureUnit', () => {
  it('defaults to C without a saved value', () => {
    expect(loadTemperatureUnit()).toBe('C');
  });

  it('returns a saved F', () => {
    vi.stubGlobal('localStorage', fakeStorage({ [KEY]: 'F' }));
    expect(loadTemperatureUnit()).toBe('F');
  });

  it.each(['K', '', 'f'])('invalid value %j counts as C', (bad) => {
    vi.stubGlobal('localStorage', fakeStorage({ [KEY]: bad }));
    expect(loadTemperatureUnit()).toBe('C');
  });

  it('unusable storage gives C without an error', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    });
    expect(() => loadTemperatureUnit()).not.toThrow();
    expect(loadTemperatureUnit()).toBe('C');
  });
});

describe('setTemperatureUnit', () => {
  it('writes the key on the device and notifies subscribers', () => {
    const storage = fakeStorage();
    vi.stubGlobal('localStorage', storage);
    const listener = vi.fn();
    const off = subscribe(listener);
    setTemperatureUnit('F');
    expect(storage.data.get(KEY)).toBe('F');
    expect(getTemperatureUnit()).toBe('F');
    expect(listener).toHaveBeenCalled();
    off();
    listener.mockClear();
    setTemperatureUnit('C');
    expect(listener).not.toHaveBeenCalled();
  });

  it('still switches when storage throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('denied');
      },
    });
    expect(() => setTemperatureUnit('F')).not.toThrow();
    expect(getTemperatureUnit()).toBe('F');
  });
});
