export default function handler(req, res) {
  const key = process.env.ANTHROPIC_API_KEY;
  res.status(200).json({
    hasKey: !!key,
    keyLength: key ? key.length : 0,
    keyPrefix: key ? key.slice(0, 7) : 'missing'
  });
}
