import { createElement, useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";

/**
 * Resolves legacy public asset paths ("/fleet-assets/x.jpg",
 * "/permitting-evidence/y.pdf") to their migrated file-storage URLs.
 * The manifest is served by the public hostedAssetManifest function and
 * cached for the session. Unmapped/absolute URLs pass through unchanged —
 * safe to wrap every stored asset path.
 */

let manifestPromise = null;
let manifest = {};

export function loadHostedAssetManifest() {
  if (!manifestPromise) {
    manifestPromise = base44.functions
      .invoke("hostedAssetManifest", { op: "get_manifest" })
      .then((res) => {
        manifest = res?.data?.manifest || {};
        return manifest;
      })
      .catch(() => {
        manifest = {};
        return manifest;
      });
  }
  return manifestPromise;
}

/** Synchronous lookup — returns the hosted URL if the manifest is loaded. */
export function hostedAssetUrl(path) {
  const p = String(path || "").trim();
  if (!p) return p;
  return manifest[p] || p;
}

/** React hook: resolves once the manifest arrives; starts with the raw path. */
export function useHostedAssetUrl(path) {
  const p = String(path || "").trim();
  const [url, setUrl] = useState(() => hostedAssetUrl(p));
  useEffect(() => {
    let cancelled = false;
    loadHostedAssetManifest().then(() => {
      if (!cancelled) setUrl(hostedAssetUrl(p));
    });
    return () => { cancelled = true; };
  }, [p]);
  return url;
}

/** Anchor wrapper for legacy asset links (research JSON archives, etc.). */
export function HostedAssetLink({ href, children, ...rest }) {
  const resolved = useHostedAssetUrl(href);
  return createElement("a", { href: resolved, ...rest }, children);
}

/** Drop-in <img> that resolves legacy public paths to hosted file-storage URLs. */
export function HostedImg({ src, ...rest }) {
  const resolved = useHostedAssetUrl(src);
  return createElement("img", { src: resolved, ...rest });
}
