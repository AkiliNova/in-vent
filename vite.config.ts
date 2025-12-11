import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// Custom environment-aware plugin loader
function devOnly(plugin: any) {
  return process.env.NODE_ENV === "development" ? plugin : undefined;
}

export default defineConfig(({ mode }) => ({
  server: {
    host: "0.0.0.0",
    port: 8080,
  },
  plugins: [
    react(),
    devOnly(componentTagger()), // Only in dev
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.png"], // your favicon
      manifest: {
        name: "Tenant Event App",
        short_name: "EventApp",
        description: "Tenant event management PWA",
        theme_color: "#4F46E5",
        background_color: "#ffffff",
        display: "standalone",
        icons: [
          {
            src: "public/favicon.png", // your PNG
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "public/favicon.png",
            sizes: "512x512",
            type: "image/png",
          },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
