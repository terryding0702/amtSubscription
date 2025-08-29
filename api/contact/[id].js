const contacts = {
  1: { id: '1', email: 'test@example.com', newsletter: true },
};

module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { id } = req.query;

  try {
    if (req.method === 'GET') {
      const contact = contacts[id];
      return contact
        ? res.status(200).json(contact)
        : res.status(404).json({ error: 'Contact not found' });
    }

    if (req.method === 'POST') {
      const contact = contacts[id];
      if (!contact) return res.status(404).json({ error: 'Contact not found' });
      Object.assign(contact, req.body || {});
      return res.status(200).json({ success: true, contact });
    }

    res.setHeader('Allow', 'GET,POST,OPTIONS');
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  } catch (e) {
    console.error('API error:', e);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};
