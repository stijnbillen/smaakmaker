import { useSyncExternalStore } from 'react';
import type { TemperatureUnit } from './temperature';

const STORAGE_KEY = 'smaakmaker.tempUnit';

// Read lazily on first get; kept on the device only, never in the account.
let current: TemperatureUnit | null = null;
const listeners = new Set<() => void>();

/** Saved choice; anything invalid or unreadable counts as °C. */
export function loadTemperatureUnit(): TemperatureUnit {
  try {
    const saved = typeof localStorage === 'undefined' ? null : localStorage.getItem(STORAGE_KEY);
    if (saved === 'C' || saved === 'F') return saved;
  } catch {
    // Storage unusable (private mode): default.
  }
  return 'C';
}

export function getTemperatureUnit(): TemperatureUnit {
  current ??= loadTemperatureUnit();
  return current;
}

export function setTemperatureUnit(unit: TemperatureUnit): void {
  current = unit;
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, unit);
  } catch {
    // Not saved, but the switch still works until the next reload.
  }
  listeners.forEach((listener) => listener());
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

export const useTemperatureUnit = (): TemperatureUnit => useSyncExternalStore(subscribe, getTemperatureUnit);
