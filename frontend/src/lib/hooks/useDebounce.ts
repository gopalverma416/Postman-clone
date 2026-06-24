import { useCallback, useEffect, useRef } from 'react';

/** Returns a stable debounced version of `fn`. */
export function useDebouncedCallback<A extends unknown[]>(fn: (...args: A) => void, delay = 250): (...args: A) => void {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return useCallback(
    (...args: A) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => fnRef.current(...args), delay);
    },
    [delay],
  );
}
