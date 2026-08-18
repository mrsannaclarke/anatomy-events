function response(payload, status = 200) {
  return Response.json(payload, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export function onRequestGet({ env }) {
  if (!env.GOOGLE_WEB_CLIENT_ID) {
    return response({ ok: false, error: 'Server configuration is incomplete.' }, 503);
  }

  return response({ ok: true, googleWebClientId: env.GOOGLE_WEB_CLIENT_ID });
}

export function onRequest() {
  return response({ ok: false, error: 'Method not allowed.' }, 405);
}
