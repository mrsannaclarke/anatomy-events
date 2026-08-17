import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const PRODUCTION_SHEET_PROXY_URL = 'https://anatomy-events.pages.dev/api/sheet';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'sheet-api-proxy',
      configureServer(server) {
        server.middlewares.use('/api/sheet', async (req, res) => {
          try {
            const requestBody = await new Promise((resolve, reject) => {
              const chunks = [];
              req.on('data', (chunk) => chunks.push(chunk));
              req.on('end', () => resolve(Buffer.concat(chunks)));
              req.on('error', reject);
            });
            const response = await fetch(PRODUCTION_SHEET_PROXY_URL, {
              method: req.method,
              headers: {
                Accept: 'application/json',
                ...(req.headers.authorization ? { Authorization: req.headers.authorization } : {}),
                'Content-Type': req.headers['content-type'] || 'application/json',
              },
              body: req.method === 'GET' || req.method === 'HEAD' ? undefined : requestBody,
            });
            const responseBody = await response.text();

            res.statusCode = response.status;
            res.setHeader('content-type', response.headers.get('content-type') || 'application/json');
            res.end(responseBody);
          } catch (error) {
            res.statusCode = 502;
            res.setHeader('content-type', 'application/json');
            res.end(
              JSON.stringify({
                ok: false,
                error: error instanceof Error ? error.message : 'Sheet proxy failed.',
              }),
            );
          }
        });
      },
    },
  ],
});
