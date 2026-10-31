import { isPermittingPreviewHost } from '@/components/admin/permittingPreviewQa';
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import AppErrorBoundary from '@/components/auth/AppErrorBoundary'
import { CcsMantineProvider } from '@/components/ui/ccs-date-field'
import '@/index.css'
import '@mantine/core/styles.css'
import '@mantine/dates/styles.css'

const previewQaHost = isPermittingPreviewHost(window.location.hostname, import.meta.env.DEV);
const root = ReactDOM.createRoot(document.getElementById('root'));
if (previewQaHost && new URLSearchParams(window.location.search).get('permittingReviewQa') === '1') {
  // Fixture-only local callbacks; no application sessions or records are exposed.
  import('./components/admin/PermittingReviewBrowserFixture.jsx').then(({ default: Fixture }) => {
    root.render(<AppErrorBoundary><Fixture /></AppErrorBoundary>);
  });
} else {
  root.render(<AppErrorBoundary><CcsMantineProvider><App /></CcsMantineProvider></AppErrorBoundary>);
}

if (import.meta.hot) {
  import.meta.hot.on('vite:beforeUpdate', () => {
    window.parent?.postMessage({ type: 'sandbox:beforeUpdate' }, '*');
  });
  import.meta.hot.on('vite:afterUpdate', () => {
    window.parent?.postMessage({ type: 'sandbox:afterUpdate' }, '*');
  });
}



