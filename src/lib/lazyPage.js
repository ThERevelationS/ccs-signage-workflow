import { lazy } from "react";

const RELOAD_KEY = "ccsChunkReloadAt";

// Loads a page only when it is opened. After a new publish, a tab that is still
// running the previous version can ask for a page file that no longer exists;
// in that case reload once to pick up the current version instead of showing a
// blank screen. The timestamp guard prevents a reload loop.
export function lazyPage(loader) {
  return lazy(() =>
    loader().catch((error) => {
      const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
      if (Date.now() - last > 30000) {
        sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
        window.location.reload();
        return new Promise(() => {});
      }
      throw error;
    })
  );
}