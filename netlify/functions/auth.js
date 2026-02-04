const crypto = require('crypto');

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hodin

function base64url(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function sign(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function createToken(username, secret) {
  const payload = JSON.stringify({
    user: username,
    exp: Date.now() + TOKEN_TTL_MS,
  });
  const payloadB64 = base64url(Buffer.from(payload, 'utf8'));
  const sig = sign(payloadB64, secret);
  return payloadB64 + '.' + sig;
}

function verifyToken(token, secret) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, sig] = parts;
  const expectedSig = sign(payloadB64, secret);
  if (expectedSig !== sig) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(
        payloadB64.replace(/-/g, '+').replace(/_/g, '/'),
        'base64'
      ).toString('utf8')
    );
    if (payload.exp && payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const secret = process.env.AUTH_SECRET || process.env.LOGIN_PASSWORD || 'change-me-in-production';
  const expectedUser = process.env.LOGIN_USER || '';
  const expectedPass = process.env.LOGIN_PASSWORD || '';

  if (!expectedUser || !expectedPass) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Přihlášení není nakonfigurováno (LOGIN_USER / LOGIN_PASSWORD).' }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Neplatný JSON v těle požadavku.' }),
    };
  }

  const { username, password } = body;
  if (username !== expectedUser || password !== expectedPass) {
    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Nesprávné přihlašovací údaje.' }),
    };
  }

  const token = createToken(username, secret);
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: true, token }),
  };
};
