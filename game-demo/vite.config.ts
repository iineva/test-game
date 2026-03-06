import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";

export default defineConfig({
  // Use relative asset paths so the app works under the GitHub Pages subdirectory.
  base: "./",
  plugins: [react(), basicSsl()],
  server: {
    https: true,
    host: true,
    port: 5173,
  },
});
