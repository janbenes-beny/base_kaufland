// Project: base_kaufland
const crypto = require('crypto');

function sign(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
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

function getBearerToken(event) {
  const auth = event.headers.authorization || event.headers.Authorization || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const token = getBearerToken(event);
  const secret = process.env.AUTH_SECRET || process.env.LOGIN_PASSWORD || 'change-me-in-production';
  const user = verifyToken(token, secret);

  if (!user) {
    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Nejste přihlášeni nebo vypršela platnost. Přihlaste se znovu.' }),
    };
  }

  let feedUrl = process.env.HEUREKA_FEED_URL || process.env.FEED_URL;
  let apiKey = process.env.HEUREKA_API_KEY || process.env.FEED_API_KEY || '';

  if (event.httpMethod === 'POST' && event.body) {
    try {
      const body = JSON.parse(event.body);
      if (body.feedUrl) feedUrl = body.feedUrl;
      if (body.apiKey != null) apiKey = body.apiKey;
    } catch (_) {}
  }

  if (!feedUrl || !feedUrl.startsWith('http')) {
    return {
      statusCode: 503,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Feed URL není nakonfigurován. Nastavte HEUREKA_FEED_URL (nebo pošlete feedUrl v těle požadavku).',
      }),
    };
  }

  const headers = { 'Accept': 'application/xml, text/xml, */*' };
  if (apiKey) headers['Authorization'] = 'Bearer ' + apiKey;

  try {
    const res = await fetch(feedUrl, { headers });
    if (!res.ok) {
      return {
        statusCode: 502,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Feed API vrátilo chybu: ' + res.status + ' ' + res.statusText,
        }),
      };
    }
    const xml = await res.text();
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/xml; charset=utf-8' },
      body: xml,
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Nepodařilo se stáhnout feed: ' + (err.message || 'neznámá chyba'),
      }),
    };
  }
};
