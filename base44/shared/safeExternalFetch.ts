const BLOCKED_HOST_SUFFIXES = ['.localhost', '.local', '.internal', '.lan', '.home.arpa'];
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function isBlockedIpv4(ip: string) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 192 && b === 0) return true;
  if (a === 192 && b === 2) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a === 198 && b === 51) return true;
  if (a === 203 && b === 0) return true;
  if (a >= 224) return true;
  return false;
}

function isBlockedIpv6(ip: string) {
  const value = ip.toLowerCase().replace(/^\[|\]$/g, '');
  if (value === '::' || value === '::1') return true;
  if (value.startsWith('fc') || value.startsWith('fd')) return true;
  if (/^fe[89ab]/.test(value)) return true;
  if (value.startsWith('ff')) return true;
  if (value.startsWith('2001:db8:') || value === '2001:db8::') return true;
  const mapped = /(?:^|:)ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(value);
  return mapped ? isBlockedIpv4(mapped[1]) : false;
}

function looksLikeIpv4(hostname: string) {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname);
}

function isBlockedAddress(address: string) {
  return address.includes(':') ? isBlockedIpv6(address) : isBlockedIpv4(address);
}

export async function assertSafeExternalUrl(input: unknown) {
  let url: URL;
  try {
    url = new URL(String(input || '').trim());
  } catch {
    throw Object.assign(new Error('A valid external URL is required.'), { status: 400 });
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw Object.assign(new Error('Only http and https URLs are allowed.'), { status: 400 });
  }
  if (url.username || url.password) {
    throw Object.assign(new Error('URLs containing embedded credentials are not allowed.'), { status: 400 });
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!hostname || hostname === 'localhost' || BLOCKED_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) {
    throw Object.assign(new Error('Private or local network destinations are not allowed.'), { status: 400 });
  }

  if (looksLikeIpv4(hostname) && isBlockedIpv4(hostname)) {
    throw Object.assign(new Error('Private or reserved network destinations are not allowed.'), { status: 400 });
  }
  if (hostname.includes(':') && isBlockedIpv6(hostname)) {
    throw Object.assign(new Error('Private or reserved network destinations are not allowed.'), { status: 400 });
  }

  // Resolve public hostnames before connecting so obvious DNS-to-private SSRF
  // attempts fail closed. Both A and AAAA answers are checked when available.
  if (!looksLikeIpv4(hostname) && !hostname.includes(':')) {
    let resolved = 0;
    for (const recordType of ['A', 'AAAA'] as const) {
      try {
        const answers = await Deno.resolveDns(hostname, recordType);
        for (const address of answers) {
          resolved += 1;
          if (isBlockedAddress(String(address))) {
            throw Object.assign(new Error('Private or reserved network destinations are not allowed.'), { status: 400 });
          }
        }
      } catch (error) {
        if (Number((error as any)?.status) === 400) throw error;
      }
    }
    if (resolved === 0) {
      throw Object.assign(new Error('The external hostname could not be resolved safely.'), { status: 400 });
    }
  }

  return url;
}

export async function safeExternalFetch(input: unknown, init: RequestInit = {}, maxRedirects = 5) {
  let url = await assertSafeExternalUrl(input);
  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    const response = await fetch(url, { ...init, redirect: 'manual' });
    if (!REDIRECT_STATUSES.has(response.status)) return response;
    if (redirectCount === maxRedirects) {
      throw Object.assign(new Error('Too many redirects while fetching the external document.'), { status: 400 });
    }
    const location = response.headers.get('location');
    if (!location) {
      throw Object.assign(new Error('External redirect did not provide a destination.'), { status: 400 });
    }
    url = await assertSafeExternalUrl(new URL(location, url).toString());
  }
  throw Object.assign(new Error('External document could not be fetched safely.'), { status: 400 });
}
