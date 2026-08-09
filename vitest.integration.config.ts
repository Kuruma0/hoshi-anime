import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Live-network provider checks. Kept in a separate config because the default
 * suite excludes them — `npm test` must never fail because a provider is down.
 *
 * Run with: npm run test:integration
 */
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  test: {
    environment: 'node',
    include: ['src/**/integration.test.ts'],
    // Providers are rate limited per IP; parallel files would fight each other.
    fileParallelism: false,
    testTimeout: 60_000,
  },
});
