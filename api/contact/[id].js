// const contacts = {
//   1: { id: '1', email: 'test@example.com', newsletter: true },
// };

// module.exports = (req, res) => {
//   res.setHeader('Access-Control-Allow-Origin', '*');
//   res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
//   res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
//   if (req.method === 'OPTIONS') return res.status(200).end();

//   const { id } = req.query;

//   try {
//     if (req.method === 'GET') {
//       const contact = contacts[id];
//       return contact
//         ? res.status(200).json(contact)
//         : res.status(404).json({ error: 'Contact not found' });
//     }

//     if (req.method === 'POST') {
//       const contact = contacts[id];
//       if (!contact) return res.status(404).json({ error: 'Contact not found' });
//       Object.assign(contact, req.body || {});
//       return res.status(200).json({ success: true, contact });
//     }

//     res.setHeader('Allow', 'GET,POST,OPTIONS');
//     return res.status(405).end(`Method ${req.method} Not Allowed`);
//   } catch (e) {
//     console.error('API error:', e);
//     return res.status(500).json({ error: 'Internal Server Error' });
//   }
// };

// api/contact/[id].js

const BASE = process.env.CREATIO_BASE || 'https://amt.creatio.com';
const USER = process.env.CREATIO_USER || 'Supervisor';
const PASS = process.env.CREATIO_PASS || 'Longstatus458315!';

function getSetCookieArray(res) {
  // Node/undici in Vercel
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
  if (!res.ok)
    throw new Error(`Login failed: ${res.status} ${txt.slice(0, 200)}`);
  if (isLikelyHtml(txt))
    throw new Error(`Login returned HTML (not authenticated)`);

  const setCookies = getSetCookieArray(res);
  if (!setCookies.length) throw new Error('No Set-Cookie from login');

  return {
    cookie: buildCookieHeader(setCookies),
    csrf: extractCsrfFromCookies(setCookies),
  };
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { id } = req.query;
  const guid = normalizeGuid(id);

  try {
    const auth = await loginCreatio();

    if (req.method === 'GET') {
      const url = `${BASE}/0/odata/Contact(${guid})?$select=Id,Email,GivenName,Surname,Name`;
      const r = await fetch(url, {
        headers: { Cookie: auth.cookie, Accept: 'application/json' },
      });

      const text = await r.text();
      if (!r.ok || isLikelyHtml(text)) {
        return res
          .status(r.status || 500)
          .json({ error: 'Fetch failed', detail: text.slice(0, 500) });
      }

      const row = JSON.parse(text);
      return res.status(200).json({
        id: row.Id || guid,
        email: row.Email ?? '',
        // firstName: row.GivenName ?? '',
        // lastName: row.Surname ?? '',
        // fullName: row.Name ?? '',
      });
    }

    if (req.method === 'POST') {
      const payload = {};
      if (req.body && typeof req.body === 'object') {
        if (req.body.email != null) payload.Email = req.body.email;
        if (req.body.firstName != null) payload.GivenName = req.body.firstName;
        if (req.body.lastName != null) payload.Surname = req.body.lastName;
      }

      const url = `${BASE}/0/odata/Contact(${guid})`;
      const r = await fetch(url, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Cookie: auth.cookie,
          BPMCSRF: auth.csrf,
        },
        body: JSON.stringify(payload),
      });

      const text = await r.text();
      if (r.status === 204 || r.ok) {
        return res.status(200).json({ success: true, updated: payload });
      }
      return res
        .status(r.status || 500)
        .json({ error: 'Update failed', detail: text.slice(0, 500) });
    }

    res.setHeader('Allow', 'GET,POST,OPTIONS');
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  } catch (e) {
    console.error('API error:', e);
    return res
      .status(500)
      .json({ error: e.message || 'Internal Server Error' });
  }
};

// https://amt-subscription-drab.vercel.app/api/contact/B92C7FA7-B173-4FD5-B07C-A7A7608DBE2F

// https://amtsubscription.raoullake.com/test?contactId=3a9cc02d-278f-4ec2-87c7-58fed6e403b5

// https://amtsubscription.raoullake.com/test?contactId=3a9cc02d-278f-4ec2-87c7-58fed6e403b5&name=test&email=terryding@qq.com&competitions=true&aboutAMT=true
