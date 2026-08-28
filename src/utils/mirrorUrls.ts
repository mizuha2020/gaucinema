export function getMirrorUrls(originalUrl: string): string[] {
  if (!originalUrl) return [];
  const mirrors = [
    'vip.opstream15.com',
    'vip.opstream16.com',
    'vip.opstream17.com',
    's1.phim1280.tv',
  ];
  const list: string[] = [originalUrl];
  try {
    const url = new URL(originalUrl);
    const host = url.host;
    if (host.includes('opstream') || host.includes('phim1280')) {
      for (const m of mirrors) {
        if (m !== host) {
          const copy = new URL(originalUrl);
          copy.host = m;
          list.push(copy.toString());
        }
      }
    }
  } catch {}
  return list;
}
