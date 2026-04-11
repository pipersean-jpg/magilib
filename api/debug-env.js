export default function handler(req, res) {
  const key = process.env.ANTHROPIC_API_KEY;
  const allKeys = Object.keys(process.env).filter(k => !k.startsWith('npm_') && !k.startsWith('NODE') && !k.startsWith('PATH') && !k.startsWith('HOME') && !k.startsWith('VERCEL') && !k.startsWith('NOW_'));
  res.status(200).json({
    hasKey: !!key,
    keyLength: key ? key.length : 0,
    keyPrefix: key ? key.slice(0, 7) : 'missing',
    availableCustomEnvKeys: allKeys
  });
}
