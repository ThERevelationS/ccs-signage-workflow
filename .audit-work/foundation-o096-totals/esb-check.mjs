import esbuild from 'esbuild';
import path from 'node:path';
const uiStub = {
  name: 'ui-stub',
  setup(b) {
    b.onResolve({ filter: /^@\/components\/ui\/input$/ }, () => ({ path: 'input-stub', namespace: 'ui' }));
    b.onLoad({ filter: /.*/, namespace: 'ui' }, () => ({
      contents: `import React from 'react';
        export const Input = React.forwardRef(function Input(props, ref) {
          return React.createElement('input', { ...props, ref, className: 'ui-input ' + (props.className || '') });
        });
        export default Input;`,
      loader: 'jsx', resolveDir: process.cwd(),
    }));
  },
};
const r = await esbuild.build({
  entryPoints: ['fixture-browser/src/components/estimator/foundation/FoundationTotals.jsx',
                'fixture-browser/src/components/estimator/foundation/CustomerPricingPanel.jsx'],
  bundle: true, format: 'esm', platform: 'browser',
  outdir: 'fixture-browser/out',
  loader: { '.js': 'jsx', '.jsx': 'jsx', '.ts': 'ts' }, jsx: 'automatic',
  alias: { '@': path.resolve('fixture-browser/src') },
  absWorkingDir: process.cwd(), metafile: true,
  plugins: [uiStub],
});
console.log('bundle ok; inputs:', Object.keys(r.metafile.inputs).length);
for (const i of Object.keys(r.metafile.inputs)) console.log('  ', i);
