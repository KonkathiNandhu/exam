import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  build: { outDir: "dist/web" },
  server: {
    host: process.env.LAN_ENABLED === "true" ? "0.0.0.0" : "127.0.0.1",
    port: Number(process.env.VITE_PORT || 5173),
  },
});
