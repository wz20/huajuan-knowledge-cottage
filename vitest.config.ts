import {defineConfig} from 'vitest/config';
// Release folders can contain an Applications shortcut for the disk image.
// Test discovery must never walk packaged applications or external symlinks.
export default defineConfig({test:{include:['tests/**/*.test.{ts,js,mjs}'],exclude:['node_modules/**','out/**','release-*/**','.test-data/**']}});
