import path from 'node:path';
import { build } from 'esbuild';

// Browser-safe, pure shared helpers only. Backend directories stay denied by Vite.
const names = new Set([
  'permittingAddressLocality.js', 'permittingAddressState.js',
  'permittingOfficeResearch.mjs', 'permittingOfficeResearchRequirements.json',
  'permittingSourceAuthorityPolicy.mjs', 'jurisdictionSourceTextSegments.mjs',
  'jurisdictionSourcePdfText.mjs',
  'salesTaskStatusAudit.mjs', 'salesTaskStageCatalog.mjs',
  'smartsheetSalesSafety.mjs', 'smartsheetSalesAssigneeTranslation.mjs',
  'smartsheetSalesImportEligibility.mjs', 'historicalSalesOutcomeReconciliation.mjs',
]);
const prefix = '\0ccs-frontend-shared:';
export function frontendSharedModules(root = process.cwd()) {
  const shared = path.resolve(root, 'base44/shared');
  const allowed = (file) => path.dirname(path.resolve(file)) === shared && names.has(path.basename(file));
  return {
    name: 'ccs-frontend-shared-modules', enforce: 'pre',
    resolveId(source, importer) {
      if (!importer) return null;
      const clean = source.split('?')[0];
      const file = clean.startsWith('/base44/shared/')
        ? path.resolve(root, clean.slice(1))
        : path.isAbsolute(clean) ? clean
        : clean.startsWith('.') ? path.resolve(path.dirname(importer.split('?')[0]), clean) : '';
      return allowed(file) ? prefix + file : null;
    },
    async load(id) {
      if (!id.startsWith(prefix)) return null;
      const file = id.slice(prefix.length);
      if (!allowed(file)) throw new Error('Unapproved frontend shared module');
      const watch = (file) => this.addWatchFile(file);
      const result = await build({
        entryPoints: [file], bundle: true, write: false, format: 'esm', platform: 'browser',
        plugins: [{ name: 'shared-module-boundary', setup(builder) {
          builder.onResolve({ filter: /.*/ }, (args) => {
            const resolved = path.resolve(args.resolveDir || root, args.path);
            if (!allowed(resolved)) return { errors: [{ text: 'Frontend shared helper imports an unapproved module' }] };
            return { path: resolved };
          });
          builder.onLoad({ filter: /.*/ }, (args) => { watch(args.path); return null; });
        }}],
      });
      return result.outputFiles[0].text;
    },
  };
}
