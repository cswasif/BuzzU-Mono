import path from "path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

// Middleware to handle Google OAuth redirect POST requests
const googleAuthMiddleware = () => ({
  name: "google-auth-middleware",
  configureServer(server: any) {
    server.middlewares.use(async (req: any, res: any, next: any) => {
      if (req.method === "POST" && req.url?.startsWith("/verify")) {
        let body = "";
        req.on("data", (chunk: any) => {
          body += chunk;
        });
        req.on("end", () => {
          const params = new URLSearchParams(body);
          const credential = params.get("credential");
          if (credential) {
            res.writeHead(303, { Location: `/verify#token=${credential}` });
            res.end();
          } else {
            next();
          }
        });
      } else {
        next();
      }
    });
  },
});

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  return {
    server: {
      port: 3000,
      host: "0.0.0.0",
    },
    plugins: [
      react(),
      tailwindcss(),
      wasm(),
      topLevelAwait(),
      googleAuthMiddleware(),
      VitePWA({
        registerType: "prompt",
        injectRegister: "auto",
        includeAssets: ["favicon.ico", "pwa-icon.svg"],
        manifest: {
          name: "BuzzU - Anonymous Chat",
          short_name: "BuzzU",
          description: "The premier anonymous chatting platform",
          theme_color: "#09090b",
          background_color: "#09090b",
          display: "standalone",
          display_override: ["fullscreen", "standalone"],
          orientation: "any",
          scope: "/",
          categories: ["social", "communication"],
          icons: [
            {
              src: "pwa-icon.svg",
              sizes: "any",
              type: "image/svg+xml",
              purpose: "any maskable",
            },
          ],
        },
        workbox: {
          globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
          maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: "CacheFirst",
              options: {
                cacheName: "google-fonts-cache",
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: "CacheFirst",
              options: {
                cacheName: "gstatic-fonts-cache",
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: ({ request }) => request.mode === "navigate",
              handler: "NetworkFirst",
              options: {
                cacheName: "pages-cache",
                networkTimeoutSeconds: 3,
                expiration: {
                  maxEntries: 50,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: false, // Keep false in dev — service worker causes confusing cache behaviour
          type: "module",
          navigateFallback: "index.html",
        },
      }),
    ],
    define: {
      "process.env.API_KEY": JSON.stringify(env.GEMINI_API_KEY),
      "process.env.GEMINI_API_KEY": JSON.stringify(env.GEMINI_API_KEY),
      "process.env.SIGNALING_URL": JSON.stringify(
        env.SIGNALING_URL ||
          "wss://buzzu-signaling.md-wasif-faisal.workers.dev",
      ),
      "process.env.MATCHMAKER_URL": JSON.stringify(
        env.MATCHMAKER_URL ||
          "wss://buzzu-matchmaker.md-wasif-faisal.workers.dev",
      ),
      // KLIPY_API_KEY must be set via .env.local or Cloudflare Pages secrets — no hardcoded fallback.
      "process.env.KLIPY_API_KEY": JSON.stringify(env.KLIPY_API_KEY || ""),
    },
    build: {
      sourcemap: false,
      minify: "esbuild",
      cssMinify: true,
      reportCompressedSize: false,
      chunkSizeWarningLimit: 2000,
      rollupOptions: {
        maxParallelFileOps: 2,
      },
    },
    test: {
      watch: false,
      globals: true,
      environment: "jsdom",
      exclude: ["**/e2e/**", "**/node_modules/**"],
      passWithNoTests: true,
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "."),
        "@hooks": path.resolve(__dirname, "src/hooks"),
        "@stores": path.resolve(__dirname, "src/stores"),
        "@pages": path.resolve(__dirname, "src/pages"),
        "@components": path.resolve(__dirname, "components"),
        "figma:asset": path.resolve(__dirname, "src/assets"),
      },
    },
    optimizeDeps: {
      exclude: ["@buzzu/wasm"],
    },
  };
});
