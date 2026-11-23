export function mergeProductRefreshScopes(left, right) {
  if (!Array.isArray(left?.lineIds) || !Array.isArray(right?.lineIds)) return undefined;
  return { lineIds: [...new Set([...left.lineIds, ...right.lineIds])] };
}

export function createSingleFlight(fn, merge = (_left, right) => right) {
  let running = false;
  let queued = null;

  const start = (scope) => {
    running = true;
    const result = Promise.resolve().then(() => fn(scope));
    result.then(finish, finish);
    return result;
  };

  const finish = () => {
    if (!queued) {
      running = false;
      return;
    }
    const next = queued;
    queued = null;
    start(next.scope).then(next.resolve, next.reject);
  };

  return (scope) => {
    if (!running) return start(scope);
    if (!queued) {
      let resolve, reject;
      const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
      queued = { promise, resolve, reject, scope };
    } else {
      queued.scope = merge(queued.scope, scope);
    }
    return queued.promise;
  };
}
