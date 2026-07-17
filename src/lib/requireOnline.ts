export class OfflineError extends Error {
  readonly isOffline = true;
  constructor() {
    super("You are offline");
  }
}

/** Thrown when an optimistic-concurrency write finds the row already changed
 *  by another request (e.g. two near-simultaneous consume operations on the
 *  same lot). See #432. */
export class ConcurrentUpdateError extends Error {
  readonly isConcurrentUpdate = true;
  constructor() {
    super("The record was modified by another request");
  }
}

export const requireOnline = () => {
  if (!navigator.onLine) throw new OfflineError();
};
