import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
// Pure static SPA — all AI calls happen in the browser directly against the
// selected provider (see src/lib/providers). No backend.
export default defineConfig({
  plugins: [react()],
});
