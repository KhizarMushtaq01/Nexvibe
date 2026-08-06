export const detectPlatform = (userAgent = '') => {
  const ua = userAgent.toLowerCase();
  if (/android/.test(ua)) return 'android';
  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  if (/windows/.test(ua)) return 'windows';
  if (/macintosh|mac os x/.test(ua)) return 'macos';
  return 'other';
};
