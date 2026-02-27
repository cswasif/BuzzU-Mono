import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import tailwindcss from '@tailwindcss/vite';

// Middleware to handle Google OAuth redirect POST requests
const googleAuthMiddleware = () => ({
  name: 'google-auth-middleware',
  configureServer(server: any) {
    server.middlewares.use(async (req: any, res: any, next: any) => {
      if (req.method === 'POST' && req.url?.startsWith('/verify')) {
        let body = '';
        req.on('data', (chunk: any) => { body += chunk; });
        req.on('end', () => {
          const params = new URLSearchParams(body);
          const credential = params.get('credential');
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
  }
});

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [
      react(),
      tailwindcss(),
      wasm(),
      topLevelAwait(),
      googleAuthMiddleware(),
    ],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.SIGNALING_URL': JSON.stringify(env.SIGNALING_URL || 'wss://buzzu-signaling.md-wasif-faisal.workers.dev'),
      'process.env.MATCHMAKER_URL': JSON.stringify(env.MATCHMAKER_URL || 'wss://buzzu-matchmaker.md-wasif-faisal.workers.dev'),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
        '@hooks': path.resolve(__dirname, 'src/hooks'),
        '@stores': path.resolve(__dirname, 'src/stores'),
        '@pages': path.resolve(__dirname, 'src/pages'),
        '@components': path.resolve(__dirname, 'components'),
      }
    },
    optimizeDeps: {
      exclude: ['@buzzu/wasm'],
    },
  };
});
