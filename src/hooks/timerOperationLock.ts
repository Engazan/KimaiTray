// Shared by timer hooks within one query client. Acquire synchronously, before
// scheduling a mutation, so a second click in the same render is also blocked.
const locks = new WeakMap<object, Set<string>>();

export function acquireTimerOperation(owner: object, scope: string): (() => void) | null {
  let scopes = locks.get(owner);
  if (!scopes) {
    scopes = new Set();
    locks.set(owner, scopes);
  }
  if (scopes.has(scope)) return null;
  scopes.add(scope);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    scopes.delete(scope);
  };
}
