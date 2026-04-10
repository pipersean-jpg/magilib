const ALLOWED_DOMAINS = [
  'conjuringarchive.com', 'www.conjuringarchive.com',
  'magicref.net', 'www.magicref.net',
'quickerthantheeye.com', 'www.quickerthantheeye.com',
  'collectingmagicbooks.com', 'www.collectingmagicbooks.com',
  'vanishingincmagic.com', 'www.vanishingincmagic.com',
  'penguinmagic.com', 'www.penguinmagic.com',
];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

  if (req.method === 'OPTIONS') { return res.status(200).end(); }

  try {
    const action = req.query.action || 'fetch';

    if (action === 'fetch') {
      const url = req.query.url;
      if (!url) return res.status(400).json({ error: 'url parameter required' });
      const urlObj = new URL(url);
      const domain = urlObj.hostname.replace('www.', '');
      if (!ALLOWED_DOMAINS.some(d => d.includes(domain))) {
        return res.status(403).json({ error: 'Domain not allowed: ' + domain });
      }
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        }
      });
      if (!response.ok) return res.status(response.status).json({ error: 'Fetch failed: HTTP ' + response.status });
      const html = await response.text();
      return res.status(200).json({ success: true, html, url });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
