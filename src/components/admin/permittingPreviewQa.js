export function isPermittingPreviewHost(hostname, development = false) {
  return development || /^preview(?:-sandbox)?--[a-zA-Z0-9-]+\.base44\.app$/.test(hostname);
}
