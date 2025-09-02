import { useCallback, useEffect, useState } from 'react';

export function useSavedFilters<T>(key: string, initial: T): [T, (updater: (prev: T) => T) => void] {
  const [state, setState] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) return JSON.parse(raw) as T;
    } catch {}
    return initial;
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {}
  }, [key, state]);

  const update = useCallback((updater: (prev: T) => T) => {
    setState(prev => updater(prev));
  }, []);

  return [state, update];
}

