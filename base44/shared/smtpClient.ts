// Minimal SMTP client for Deno — the Base44 functions runtime gives us
// Deno.connect / Deno.connectTls but no npm mail transport, so this speaks
// raw RFC 5321 directly over a socket:
//
//   TCP connect → 220 greeting → EHLO → STARTTLS → TLS upgrade → EHLO →
//   AUTH LOGIN (base64 username / base64 password) → MAIL FROM →
//   RCPT TO per recipient → DATA → message → CRLF.CRLF → QUIT
//
// Errors are SmtpError carrying a `kind` class — 'config' (bad caller input),
// 'connect' (unreachable / banner / EHLO refused), 'tls' (STARTTLS rejected
// or the upgrade failed), 'auth' (bad SMTP_USER/SMTP_PASS — the 535 family),
// 'sender' (MAIL FROM rejected), 'recipient' (RCPT rejected — relay/policy
// refusal), 'data', 'protocol' and 'timeout' — so callers can tell a bad
// mailbox password apart from an unreachable server or a relay reject.
// Credentials are only ever written to the socket: never logged and never
// embedded in an error message.

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const DEFAULT_PORT = 587;
const DEFAULT_TIMEOUT_MS = 20_000;
const BASE64_CHUNK = 0x8000;
const HEADER_BAD = /[\r\n]/;

export class SmtpError extends Error {
  kind: string;
  code: number;

  constructor(kind: string, message: string, code = 0) {
    super(message);
    this.name = 'SmtpError';
    this.kind = kind;
    this.code = code;
  }
}

export interface SmtpSendOptions {
  host: string;
  port?: number;    // default 587 — submission port with STARTTLS
  secure?: boolean; // implicit TLS from the connect (e.g. port 465)
  user: string;
  pass: string;
  from: string;
  to: string[];
  cc?: string[];
  replyTo?: string;
  subject: string;
  text?: string;
  html?: string;
  timeoutMs?: number;
}

export interface SmtpSendResult {
  ok: true;
  accepted: string[];
  messageId: string;
}

interface SmtpReply {
  code: number;
  text: string;
}

const utf8ToBase64 = (value: string): string => {
  const bytes = encoder.encode(value);
  let binary = '';
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + BASE64_CHUNK));
  }
  return btoa(binary);
};

const wrap76 = (b64: string) => (b64.match(/.{1,76}/g) || []).join('\r\n');

const crlf = (value: string) =>
  value.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n/g, '\r\n');

// RFC 5321 transparency: a content line starting with '.' is sent as '..'.
const dotStuff = (value: string) => value.replace(/^\./gm, '..');

const encodeHeaderText = (value: string) =>
  /^[\x20-\x7e]*$/.test(value) ? value : `=?UTF-8?B?${utf8ToBase64(value)}?=`;

const firstLine = (text: string) => text.split('\n')[0].slice(4, 120).trim();

const withTimeout = <T>(promise: Promise<T>, ms: number, stage: string): Promise<T> => {
  let timer: ReturnType<typeof setTimeout>;
  const bail = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new SmtpError('timeout', `SMTP ${stage} timed out after ${ms}ms.`)),
      ms,
    );
  });
  return Promise.race([promise, bail]).finally(() => clearTimeout(timer));
};

const writeAll = async (conn: any, data: string) => {
  const bytes = encoder.encode(data);
  let sent = 0;
  while (sent < bytes.length) sent += await conn.write(bytes.subarray(sent));
};

// Buffered line reader — SMTP replies are CRLF-terminated lines; a conn.read
// may return a partial line or several replies worth of bytes at once.
const makeLineReader = (conn: any) => {
  let pending = new Uint8Array(0);
  return async (): Promise<string> => {
    for (;;) {
      const nl = pending.indexOf(0x0a); // '\n'
      if (nl >= 0) {
        const line = decoder.decode(pending.subarray(0, nl)).replace(/\r$/, '');
        pending = pending.subarray(nl + 1);
        return line;
      }
      const chunk = new Uint8Array(8192);
      const n = await conn.read(chunk);
      if (n === null) throw new SmtpError('connect', 'SMTP server closed the connection.');
      const merged = new Uint8Array(pending.length + n);
      merged.set(pending);
      merged.set(chunk.subarray(0, n), pending.length);
      pending = merged;
    }
  };
};

// Multi-line replies continue while the code is followed by '-' and end on
// the first line where it is followed by a space.
const readReply = async (readLine: () => Promise<string>): Promise<SmtpReply> => {
  const lines: string[] = [];
  for (;;) {
    const line = await readLine();
    lines.push(line);
    const match = /^(\d{3})([ -])/.exec(line);
    if (!match) throw new SmtpError('protocol', `Malformed SMTP reply: ${line.slice(0, 80)}`);
    if (match[2] === ' ') return { code: Number(match[1]), text: lines.join('\n') };
  }
};

// One command/response round-trip. The command text is deliberately kept out
// of the thrown message — during AUTH the "command" is the base64 credential.
const exchange = async (
  conn: any,
  readLine: () => Promise<string>,
  command: string,
  expectCodes: number[],
  stage: string,
  kind: string,
  timeoutMs: number,
): Promise<SmtpReply> => {
  await withTimeout(writeAll(conn, `${command}\r\n`), timeoutMs, `${stage} write`);
  const reply = await withTimeout(readReply(readLine), timeoutMs, stage);
  if (!expectCodes.includes(reply.code)) {
    throw new SmtpError(kind, `SMTP ${stage} rejected (${reply.code}): ${firstLine(reply.text)}`, reply.code);
  }
  return reply;
};

// Deno 1.x upgrades an existing socket via startTls; Deno 2 folds the same
// operation into connectTls(conn, {hostname}). Feature-detect both.
const upgradeTls = async (conn: any, hostname: string): Promise<any> => {
  const deno: any = Deno;
  if (typeof deno.startTls === 'function') return deno.startTls(conn, { hostname });
  return deno.connectTls(conn, { hostname });
};

// RFC 5322 message: plain addresses, base64 UTF-8 bodies, multipart/
// alternative when both text and html are supplied.
const buildMessage = (o: {
  from: string;
  to: string[];
  cc: string[];
  replyTo?: string;
  subject: string;
  text?: string;
  html?: string;
}): { message: string; messageId: string } => {
  const fromDomain = o.from.split('@')[1] || 'localhost';
  const messageId = `<${crypto.randomUUID()}@${fromDomain}>`;
  const headers = [
    `From: ${o.from}`,
    `To: ${o.to.join(', ')}`,
    ...(o.cc.length ? [`Cc: ${o.cc.join(', ')}`] : []),
    ...(o.replyTo ? [`Reply-To: ${o.replyTo}`] : []),
    `Subject: ${encodeHeaderText(o.subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: ${messageId}`,
    'MIME-Version: 1.0',
  ];
  const boundary = `ccs_${crypto.randomUUID().replace(/-/g, '')}`;
  const bodyLines: string[] = [];
  if (o.text !== undefined && o.html !== undefined) {
    headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    bodyLines.push(
      `--${boundary}`,
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: base64',
      '',
      wrap76(utf8ToBase64(o.text)),
      `--${boundary}`,
      'Content-Type: text/html; charset=utf-8',
      'Content-Transfer-Encoding: base64',
      '',
      wrap76(utf8ToBase64(o.html)),
      `--${boundary}--`,
    );
  } else {
    headers.push(
      `Content-Type: ${o.html !== undefined ? 'text/html' : 'text/plain'}; charset=utf-8`,
      'Content-Transfer-Encoding: base64',
    );
    bodyLines.push(wrap76(utf8ToBase64(o.html !== undefined ? String(o.html) : String(o.text || ''))));
  }
  // No trailing blank line — the caller appends the CRLF.CRLF terminator.
  const message = crlf(`${headers.join('\r\n')}\r\n\r\n${bodyLines.join('\r\n')}`).replace(/(\r\n)+$/, '');
  return { message, messageId };
};

export async function sendSmtp(options: SmtpSendOptions): Promise<SmtpSendResult> {
  const host = String(options.host || '').trim();
  const port = Number(options.port ?? DEFAULT_PORT);
  const timeoutMs = Number(options.timeoutMs || DEFAULT_TIMEOUT_MS);
  const user = String(options.user || '');
  const pass = String(options.pass || '');
  const from = String(options.from || '').trim();
  const to = (options.to || []).map((v) => String(v || '').trim()).filter(Boolean);
  const cc = (options.cc || []).map((v) => String(v || '').trim()).filter(Boolean);
  const replyTo = String(options.replyTo || '').trim() || undefined;
  const subject = String(options.subject || '').trim();
  const secure = Boolean(options.secure) || port === 465;

  if (!host) throw new SmtpError('config', 'SMTP host is required.');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new SmtpError('config', 'SMTP port is invalid.');
  if (!user || !pass) throw new SmtpError('config', 'SMTP credentials are required.');
  if (!from || HEADER_BAD.test(from)) throw new SmtpError('config', 'SMTP from address is invalid.');
  for (const addr of [...to, ...cc, ...(replyTo ? [replyTo] : [])]) {
    if (HEADER_BAD.test(addr)) throw new SmtpError('config', 'Address contains invalid characters.');
  }
  if (!to.length) throw new SmtpError('config', 'At least one recipient is required.');
  if (!subject) throw new SmtpError('config', 'Subject is required.');
  if (options.text === undefined && options.html === undefined) {
    throw new SmtpError('config', 'A message body (text or html) is required.');
  }

  let conn: any = null;
  try {
    conn = secure
      ? await withTimeout((Deno as any).connectTls({ hostname: host, port }), timeoutMs, 'connect')
      : await withTimeout(Deno.connect({ hostname: host, port }), timeoutMs, 'connect');
  } catch (e: any) {
    if (e instanceof SmtpError) throw e;
    throw new SmtpError('connect', `SMTP connect failed: ${e?.message || e}`);
  }

  try {
    let readLine = makeLineReader(conn);
    const greeting = await withTimeout(readReply(readLine), timeoutMs, 'greeting');
    if (greeting.code !== 220) {
      throw new SmtpError('connect', `SMTP greeting refused (${greeting.code}): ${firstLine(greeting.text)}`, greeting.code);
    }

    const ehloName = from.split('@')[1] || 'localhost';
    await exchange(conn, readLine, `EHLO ${ehloName}`, [250], 'EHLO', 'connect', timeoutMs);

    if (!secure) {
      // STARTTLS must succeed before any credential crosses the wire — there
      // is no plaintext-auth fallback.
      await exchange(conn, readLine, 'STARTTLS', [220], 'STARTTLS', 'tls', timeoutMs);
      try {
        conn = await withTimeout(upgradeTls(conn, host), timeoutMs, 'TLS upgrade');
      } catch (e: any) {
        if (e instanceof SmtpError) throw e;
        throw new SmtpError('tls', `SMTP TLS upgrade failed: ${e?.message || e}`);
      }
      readLine = makeLineReader(conn);
      await exchange(conn, readLine, `EHLO ${ehloName}`, [250], 'EHLO (TLS)', 'connect', timeoutMs);
    }

    // AUTH LOGIN — the prompts and credentials are base64 on the wire. The
    // password is written to the socket only; it is never part of a log line
    // or an error message.
    await exchange(conn, readLine, 'AUTH LOGIN', [334], 'AUTH', 'auth', timeoutMs);
    await exchange(conn, readLine, utf8ToBase64(user), [334], 'AUTH user', 'auth', timeoutMs);
    await exchange(conn, readLine, utf8ToBase64(pass), [235], 'AUTH password', 'auth', timeoutMs);

    await exchange(conn, readLine, `MAIL FROM:<${from}>`, [250], 'MAIL FROM', 'sender', timeoutMs);
    const accepted: string[] = [];
    for (const rcpt of [...to, ...cc]) {
      await exchange(conn, readLine, `RCPT TO:<${rcpt}>`, [250, 251], 'RCPT TO', 'recipient', timeoutMs);
      accepted.push(rcpt);
    }

    await exchange(conn, readLine, 'DATA', [354], 'DATA', 'data', timeoutMs);
    const { message, messageId } = buildMessage({
      from, to, cc, replyTo, subject, text: options.text, html: options.html,
    });
    await exchange(conn, readLine, `${dotStuff(message)}\r\n.`, [250], 'message body', 'data', timeoutMs);

    try {
      await exchange(conn, readLine, 'QUIT', [221], 'QUIT', 'protocol', timeoutMs);
    } catch {
      // QUIT is best-effort — the server already accepted the message.
    }
    return { ok: true, accepted, messageId };
  } finally {
    try { conn?.close(); } catch { /* socket already closed */ }
  }
}
