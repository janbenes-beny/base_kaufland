/**
 * Project: base_kaufland
 * Proxy pro BaseLinker API (https://api.baselinker.com/).
 * Přijímá token, method a parameters a volá connector.php.
 */

const BASELINKER_URL = 'https://api.baselinker.com/connector.php';

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Neplatný JSON' }),
    };
  }

  const { token, method, parameters } = body;
  if (!token || !method) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Chybí token nebo method' }),
    };
  }

  const params = parameters != null ? (typeof parameters === 'string' ? parameters : JSON.stringify(parameters)) : '{}';

  const form = new URLSearchParams();
  form.set('method', method);
  form.set('parameters', params);

  try {
    const res = await fetch(BASELINKER_URL, {
      method: 'POST',
      headers: {
        'X-BLToken': token,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    });
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return {
        statusCode: 502,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Neplatná odpověď z BaseLinker API', raw: text.slice(0, 500) }),
      };
    }
    return {
      statusCode: res.ok ? 200 : 502,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Chyba připojení k BaseLinker: ' + (err.message || 'neznámá') }),
    };
  }
};
