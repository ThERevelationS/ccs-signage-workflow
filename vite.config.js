import { frontendSharedModules } from './scripts/frontend-shared-modules.mjs'
import base44 from "@base44/vite-plugin"
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  logLevel: 'error', // Suppress warnings, only show errors
  // Keep original identifier names while still minifying whitespace and syntax.
  // Renaming can produce an identifier literally named "of"; a division right after it
  // inside a `for (...)` header is mis-lexed during the build and fails publishing.
  esbuild: {
    minifyIdentifiers: false,
  },
  plugins: [
    // Resolve the exact browser-safe shared helpers before Base44 blocks /base44/** imports.
    frontendSharedModules(),
    base44({
      // Support for legacy code that imports the base44 SDK with @/integrations, @/entities, etc.
      // can be removed if the code has been updated to use the new SDK imports from @base44/sdk
      legacySDKImports: process.env.BASE44_LEGACY_SDK_IMPORTS === 'true'
    }),
    react(),
  ]
});