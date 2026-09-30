import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  optimizeDeps: { include: ["@matcha/shared"] },
  build: { commonjsOptions: { include: [/node_modules/, /shared\/dist/] } },
  server: { port: 5173 },
});