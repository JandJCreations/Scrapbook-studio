import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    // The jsdom component tests are slow when the whole suite runs in parallel.
    testTimeout: 20000,
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
