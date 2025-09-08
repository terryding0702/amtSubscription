const express = require('express');
const app = express();
const PORT = 3000;

const BASE = 'https://amt.creatio.com';
const USER = 'Supervisor';
const PASS = 'Longstatus458314!';

// ===== Middlewares =====
app.use(express.json());

app.use(express.urlencoded({ extended: true }));

// CORS
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, X-Webhook-Secret'
  );
  if (req.method === 'OPTIONS') return res.status(200).end();
  next();
});

// webhook credential（ Landingi Webhook'sRequest headers ）
const WEBHOOK_SECRET =
  process.env.LANDINGI_WEBHOOK_SECRET || 'dev-secret-change-me';

// ===== Utils =====
function getSetCookieArray(res) {
  if (typeof res.headers.getSetCookie === 'function')
    return res.headers.getSetCookie();
  if (typeof res.headers.raw === 'function') {
    const raw = res.headers.raw();
    if (raw && raw['set-cookie']) return raw['set-cookie'];
  }
  const single = res.headers.get('set-cookie');
  return single ? [single] : [];
}

function buildCookieHeader(setCookies) {
  const pairs = setCookies.map((s) => s.split(';')[0]);
  return pairs.join('; ');
}

function extractCsrfFromCookies(setCookies) {
  const pair = setCookies.find((c) => c.toLowerCase().startsWith('bpmcsrf='));
  return pair ? pair.split('=')[1].split(';')[0] : '';
}

function isLikelyHtml(text) {
  if (!text) return false;
  const t = text.trim().slice(0, 200).toLowerCase();
  return (
    t.startsWith('<!doctype') ||
    t.startsWith('<html') ||
    t.includes('<head') ||
    t.includes('<body')
  );
}

function normalizeGuid(id) {
  return String(id).replace(/['"]/g, '').trim().toUpperCase();
}

// ===== Creatio Auth =====
async function loginCreatio() {
  const url = `${BASE}/ServiceModel/AuthService.svc/Login`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ForceUseSession: 'true',
    },
    body: JSON.stringify({ UserName: USER, UserPassword: PASS }),
  });

  const txt = await res.text();
  if (!res.ok) {
    throw new Error(`Login failed: ${res.status} ${txt.slice(0, 200)}`);
  }
  if (isLikelyHtml(txt)) {
    throw new Error(
      `Login returned HTML (likely not authenticated): ${txt.slice(0, 200)}...`
    );
  }

  const setCookies = getSetCookieArray(res);
  if (!setCookies.length)
    throw new Error('No Set-Cookie returned from Creatio login');

  const cookie = buildCookieHeader(setCookies);
  const csrf = extractCsrfFromCookies(setCookies);
  return { cookie, csrf };
}

async function checkOdataAuth(auth) {
  const url = `${BASE}/0/odata/$metadata`;
  const r = await fetch(url, {
    headers: { Cookie: auth.cookie, Accept: 'application/xml' },
  });
  const text = await r.text();
  console.log(
    '[diag] $metadata status=',
    r.status,
    ' body=',
    text.slice(0, 300)
  );
  return r.ok && !isLikelyHtml(text);
}

// ===== read contact =====
app.get('/api/contact/:id', async (req, res) => {
  try {
    const id = normalizeGuid(req.params.id);
    const auth = await loginCreatio();
    console.log('[auth]', auth);

    const okMeta = await checkOdataAuth(auth);
    if (!okMeta) {
      return res.status(401).json({
        error: 'Not authenticated after login',
        hint: 'Check domain/ForceUseSession/cookies',
      });
    }

    const url = `${BASE}/0/odata/Contact(${id})?$select=Id,Email,GivenName,Surname,Name`;
    const r = await fetch(url, {
      headers: { Cookie: auth.cookie, Accept: 'application/json' },
    });
    const text = await r.text();
    console.log('[v4 by id]', r.status, url, text.slice(0, 300));

    if (r.ok && !isLikelyHtml(text)) {
      const row = JSON.parse(text);
      return res.json({
        id: row.Id || id,
        email: row.Email ?? '',
      });
    }

    return res
      .status(r.status || 500)
      .json({ error: 'Fetch failed', detail: text });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ===== Landingi Webhook  =====
app.post('/landingi/webhook', async (req, res) => {
  try {
    // verification of identity
    const sig = req.headers['x-webhook-secret'];
    if (WEBHOOK_SECRET && sig !== WEBHOOK_SECRET) {
      console.warn('[webhook] invalid secret header');
      return res.sendStatus(401);
    }

    const payload = req.body && Object.keys(req.body).length ? req.body : {};
    console.log('=== Landingi Webhook Inbound ===');
    console.log('headers:', req.headers);
    console.log('payload:', JSON.stringify(payload, null, 2));

    // payload: {
    //   "email": "tding@konceptbf.com",
    //   "name": "Terry Ding",
    //   "file": "https://landend-uploads.s3.amazonaws.com/coKUxCwTyxllewaY/11.pdf",
    //   "IP": "101.115.0.207"
    // }

    res.status(200).json({ ok: true });

    // TODO: file upload save to Creatio
  } catch (e) {
    console.error('[webhook error]', e);
    try {
      res.status(200).json({ ok: true });
    } catch {}
  }
});

// ===== Start =====
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(
    `POST your Landingi webhook to: http://localhost:${PORT}/landingi/webhook`
  );
});
