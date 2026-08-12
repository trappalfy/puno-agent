import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // apps/web's Next dev server owns 3000 — keep this off it so both can
    // run at once during the split-out period.
    port: 5173,
  },
});
