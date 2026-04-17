import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Minimal Vitest config. Pure lib tests only — no jsdom, no React Testing
 * Library. If UI component tests become a need later, that's a separate
 * scope decision (see FOLLOWUPS).
 */
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
