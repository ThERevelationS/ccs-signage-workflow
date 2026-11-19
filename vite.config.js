import { frontendSharedModules } from './scripts/frontend-shared-modules.mjs'
import base44 from "@base44/vite-plugin"
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  logLevel: 'error', // Suppress warnings, only show errors
  build: {
    rollupOptions: {
      output: {
        // Stable vendor chunks — app code publishes weekly but these libraries
        // rarely change, so returning users keep them cached instead of
        // re-downloading the whole entry bundle on every publish.
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom)[\\/]/.test(id)) return 'vendor-react';
          if (id.includes('@base44')) return 'vendor-base44';
          if (id.includes('@tanstack/react-query')) return 'vendor-query';
        },
      },
    },
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