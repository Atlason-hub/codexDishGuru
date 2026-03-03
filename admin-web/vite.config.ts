import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      "/api/cities": {
        target: "https://www.10bis.co.il",
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api\/cities/, "/api/CityNameAutoComplete")
      },
      "/api/streets": {
        target: "https://www.10bis.co.il",
        changeOrigin: true,
        secure: true,
        rewrite: (path) =>
          path.replace(/^\/api\/streets/, "/api/StreetNameAutoComplete")
      }
    }
  }
});
