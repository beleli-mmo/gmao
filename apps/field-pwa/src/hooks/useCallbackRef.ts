import { useCallback, useEffect, useRef } from 'react';

/** Garde une référence stable vers le dernier callback (évite de relancer les effets). */
export function useCallbackRef<T extends (...args: any[]) => any>(cb: T): T {
  const ref = useRef(cb);
  useEffect(() => {
    ref.current = cb;
  });
  return useCallback(((...args) => ref.current(...args)) as T, []);
}
