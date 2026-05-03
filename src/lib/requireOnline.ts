export class OfflineError extends Error {
  readonly isOffline = true;
  constructor() {
    super("You are offline");
  }
}

export const requireOnline = () => {
  if (!navigator.onLine) throw new OfflineError();
};
