export function createSingleFlight(fn) {
  let running = false;
  let queued = null;

  const start = () => {
    running = true;
    const result = Promise.resolve().then(fn);
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
    start().then(next.resolve, next.reject);
  };

  return () => {
    if (!running) return start();
    if (!queued) {
      let resolve, reject;
      const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
      queued = { promise, resolve, reject };
    }
    return queued.promise;
  };
}
