import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Tests cover the provider/domain layers only — pure TypeScript with no React
// Native imports. UI is verified by running the app, not by a DOM emulator.
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Live-network checks are opt-in via `npm run test:integration`, so the
    // default suite stays fast and cannot fail because a provider is down.
    exclude: ['**/node_modules/**', '**/integration.test.ts'],
  },
});
