/**
 * Guards against out-of-order async results. Call `begin()` when starting a request and check
 * `isCurrent(token)` before applying its result; `invalidate()` makes every earlier request stale
 * (for example when the input it was started from has since changed).
 */
export function createLatestGate() {
  let seq = 0;
  return {
    begin: () => ++seq,
    isCurrent: (token: number) => token === seq,
    invalidate: () => {
      seq += 1;
    },
  };
}
