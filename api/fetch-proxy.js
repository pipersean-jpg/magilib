export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action, url } = req.query;

  if (!url) {
    return res.status(200).json({ success: false, error: 'url parameter is required' });
  }

  // action=image: fetch an image and return it as a base64 data URL
  // Used to bypass CORS on sites like MagicRef that block cross-origin image requests
  if (action === 'image') {
    try {
      const imgResp = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': new URL(url).origin + '/'
        }
      });
      if (!imgResp.ok) {
        return res.status(200).json({ success: false, error: 'Image fetch failed: ' + imgResp.status });
      }
      const contentType = imgResp.headers.get('content-type') || 'image/jpeg';
      const buffer = await imgResp.arrayBuffer();
      const b64 = Buffer.from(buffer).toString('base64');
      return res.status(200).json({ success: true, dataUrl: 'data:' + contentType + ';base64,' + b64 });
    } catch (imgErr) {
      return res.status(200).json({ success: false, error: imgErr.message });
    }
  }

  // action=fetch (default): fetch a URL and return its HTML text
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache'
      }
    });
    const html = await response.text();
    return res.status(200).json({ success: true, html, status: response.status });
  } catch (err) {
    return res.status(200).json({ success: false, error: err.message });
  }
}