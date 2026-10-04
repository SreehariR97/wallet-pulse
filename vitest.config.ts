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
    server: {
      deps: {
        // next-auth's ESM build imports "next/server" without an extension,
        // which Node's resolver rejects. Inlining lets Vite resolve it.
        inline: ["next-auth"],
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
