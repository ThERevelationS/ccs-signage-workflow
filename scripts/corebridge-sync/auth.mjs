import { readFileSync } from 'node:fs';

const decode = (value) => String(value || '').replace(/&(?:amp|lt|gt|quot|#39|#x[0-9a-f]+|#\d+);/gi, (entity) => {
  const fixed = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
  if (fixed[entity.toLowerCase()]) return fixed[entity.toLowerCase()];
  const match = entity.match(/^&#(x[0-9a-f]+|\d+);$/i);
  return match ? String.fromCodePoint(match[1][0].toLowerCase() === 'x' ? parseInt(match[1].slice(1), 16) : Number(match[1])) : entity;
});
const attrs = (tag) => {
  const result = {};
  for (const match of tag.matchAll(/([^\s=<>/'"]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    result[match[1].toLowerCase()] = decode(match[2] ?? match[3] ?? match[4]);
  }
  return result;
};

export function parseLoginForm(html) {
  const tag = [...String(html).matchAll(/<form\b[^>]*>/gi)].map((match) => attrs(match[0]))
    .find((form) => form.id === 'form1' || form.name === 'form1');
  if (!tag) throw new Error('CoreBridge login form1 not found.');
  const fields = {};
  for (const match of String(html).matchAll(/<input\b[^>]*>/gi)) {
    const input = attrs(match[0]);
    if (input.name) fields[input.name] = input.value || '';
  }
  for (const name of ['__VIEWSTATE', '__VIEWSTATEGENERATOR', '__EVENTVALIDATION']) {
    if (!fields[name]) throw new Error(`CoreBridge login form is missing ${name}.`);
  }
  return { action: tag.action || '/Login.aspx', fields };
}

export function loadCredentials(env = process.env, read = readFileSync) {
  const from = (user, pass, file) => {
    if (user || pass) {
      if (!user || !pass) throw new Error(`Both ${file} credentials must be supplied.`);
      return { user, pass };
    }
    try {
      const value = JSON.parse(read(file, 'utf8'));
      if (!value.user || !value.pass) throw new Error(`Credentials file ${file} must contain user and pass.`);
      return { user: value.user, pass: value.pass };
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  };
  return {
    corebridge: from(env.CB_USERNAME, env.CB_PASSWORD, '.cb-creds.json'),
    app: from(env.CCS_APP_USER, env.CCS_APP_PASS, '.permit-creds.json'),
  };
}

export async function loginCoreBridge({ username, password, baseUrl = 'https://cincinnaticustom.corebridge.net', fetchImpl = fetch }) {
  if (!username || !password) throw new Error('CoreBridge credentials are required.');
  const origin = new URL(baseUrl).origin;
  const cookies = new Map();
  async function request(path, init = {}) {
    const url = new URL(path, origin);
    if (url.origin !== origin) throw new Error('CoreBridge redirected to an unexpected origin.');
    const headers = new Headers(init.headers || {});
    if (cookies.size) headers.set('cookie', [...cookies].map(([name, value]) => `${name}=${value}`).join('; '));
    const response = await fetchImpl(url, { ...init, headers, redirect: 'manual', signal: AbortSignal.timeout(30000) });
    const setCookies = response.headers.getSetCookie?.() || [];
    for (const header of setCookies) {
      const first = header.split(';', 1)[0];
      const index = first.indexOf('=');
      if (index > 0) cookies.set(first.slice(0, index).trim(), first.slice(index + 1).trim());
    }
    return response;
  }
  const loginPage = await request('/Login.aspx');
  if (!loginPage.ok) throw new Error(`CoreBridge login page returned HTTP ${loginPage.status}.`);
  const form = parseLoginForm(await loginPage.text());
  const data = new URLSearchParams({ ...form.fields, txtUsername: username, txtPassword: password, __EVENTTARGET: 'btnLogin' });
  const submitted = await request(form.action, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: data });
  if (submitted.status >= 400) throw new Error(`CoreBridge login failed (HTTP ${submitted.status}).`);
  const location = submitted.headers.get('location') || '';
  if (location && /login\.aspx/i.test(location)) throw new Error('CoreBridge login failed; credentials were rejected.');
  if (location && new URL(location, origin).origin !== origin) throw new Error('CoreBridge login redirected to an unexpected origin.');
  const check = await request('/SalesModule/Orders/Order.aspx?OrderId=11286');
  const target = check.headers.get('location') || '';
  if (!check.ok || /login\.aspx/i.test(target) || /<form\b[^>]*(?:id|name)=["']form1["'][^>]*>[\s\S]*?txtPassword/i.test(await check.text())) {
    throw new Error('CoreBridge login failed; authenticated order access was not established.');
  }
  return { request };
}
