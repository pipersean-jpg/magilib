const ALLOWED_DOMAINS = [
  'conjuringarchive.com', 'www.conjuringarchive.com',
  'magicref.net', 'www.magicref.net',
  'res.cloudinary.com', 'upload.cloudinary.com', 'api.cloudinary.com'
];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

  if (req.method === 'OPTIONS') { return res.status(200).end(); }

  try {
    const action = req.query.action || 'fetch';

      if (action === 'image') {
    try {
      const imgResp = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; MagiLib/1.0)',
          'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
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
    } catch(imgErr) {
      return res.status(200).json({ success: false, error: imgErr.message });
    }
  }
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

    if (action === 'cloudinary-upload') {
      const { imageData, uploadPreset, cloudName } = req.body;
      if (!imageData || !uploadPreset || !cloudName) {
        return res.status(400).json({ error: 'imageData, uploadPreset and cloudName required' });
      }
      const formData = new URLSearchParams();
      formData.append('file', imageData);
      formData.append('upload_preset', uploadPreset);
      formData.append('folder', 'magilib');
      const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
        method: 'POST', body: formData.toString(),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });
      const data = await response.json();
      if (data.secure_url) return res.status(200).json({ success: true, url: data.secure_url, publicId: data.public_id });
      return res.status(400).json({ error: data.error?.message || 'Upload failed' });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
