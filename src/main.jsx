import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'

const previewQaHost = import.meta.env.DEV || /^preview(?:-sandbox)?--[a-zA-Z0-9-]+\.base44\.app$/.test(window.location.hostname);
const root = ReactDOM.createRoot(document.getElementById('root'));
if (previewQaHost && new URLSearchParams(window.location.search).get('permittingReviewQa') === '1') {
  // Fixture-only local callbacks; no application sessions or records are exposed.
  import('./components/admin/PermittingReviewBrowserFixture.jsx').then(({ default: Fixture }) => root.render(<Fixture />));
} else {
  root.render(<><App />{previewQaHost && <button className="fixed bottom-2 left-2 z-40 rounded border bg-white p-2 text-xs text-gray-900" onClick={() => {
    const destination = new URL(window.location.href);
    destination.searchParams.set('permittingReviewQa', '1');
    window.location.assign(destination);
  }}>Open isolated permitting acceptance</button>}</>);
}

if (import.meta.hot) {
  import.meta.hot.on('vite:beforeUpdate', () => {
    window.parent?.postMessage({ type: 'sandbox:beforeUpdate' }, '*');
  });
  import.meta.hot.on('vite:afterUpdate', () => {
    window.parent?.postMessage({ type: 'sandbox:afterUpdate' }, '*');
  });
}



