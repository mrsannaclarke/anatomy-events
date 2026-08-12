import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const SHEET_WEB_APP_URL =
  process.env.VITE_SHEET_WEB_APP_URL ||
  'https://script.google.com/macros/s/AKfycbz475VzSvNesTsCuU2CdvFEX7zskQ0uyJf17CqjmYaWrMZ5vePbBpBrI-cNaYsoZQ55eA/exec';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'sheet-api-proxy',
      configureServer(server) {
        server.middlewares.use('/api/sheet', async (req, res) => {
          try {
            const requestUrl = new URL(req.url || '', 'http://localhost');
            const targetUrl = new URL(SHEET_WEB_APP_URL);
            requestUrl.searchParams.forEach((value, key) => {
              targetUrl.searchParams.set(key, value);
            });

            const response = await fetch(targetUrl.toString(), {
              headers: {
                Accept: 'application/json',
              },
            });
            const body = await response.text();

            res.statusCode = response.status;
            res.setHeader('content-type', response.headers.get('content-type') || 'application/json');
            res.end(body);
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
