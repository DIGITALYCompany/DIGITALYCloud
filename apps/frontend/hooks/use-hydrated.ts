import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};

/** `false` during server rendering and hydration, `true` afterwards. Use for output that depends on the current time or locale. */
export function useHydrated() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  );
}
