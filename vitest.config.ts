import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "happy-dom",
    setupFiles: ["./vitest-cleanup-after-each.ts"],
    // Nested worktrees are other checkouts, not this tree's source.
    exclude: [...configDefaults.exclude, ".claude/worktrees/**"],
  },
});
