// Node module-resolution hook for fleetEntityLoaders unit tests.
// Redirects the loader's ./fleetInvoke import to a stub whose invokeFleet
// delegates to globalThis.__fleetInvokeMock, letting tests exercise the real
// loader (paging, dedupe, retry) without the base44Client/EmailGate chain.
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const stub = pathToFileURL(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "fleet-invoke-stub.js")
).href;

export async function resolve(specifier, context, next) {
  if (specifier === "./fleetInvoke" && context.parentURL?.endsWith("fleetEntityLoaders.js")) {
    return { url: stub, shortCircuit: true };
  }
  return next(specifier, context);
}
