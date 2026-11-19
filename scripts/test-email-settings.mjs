// K-02 emailSettingsModel — normalization carriers, domain sanitization,
// send-as authorization, from-resolution precedence, per-user prefs patch,
// domain status, and the validation matrix.
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-email-settings.mjs');
buildSync({
  entryPoints: [resolve(here, '../base44/shared/emailSettingsModel.ts')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
});
const {
  EMAIL_SETTINGS_KEY,
  EMAIL_SETTINGS_ALIAS_KEYS,
  EMAIL_SETTINGS_DEFAULTS,
  BOUNCE_HANDLING_MODES,
  USER_NOTIFICATION_PREF_KEYS,
  normalizeDomain,
  normalizeEmailSettings,
  isAuthorizedSender,
  resolveFromAddress,
  userEmailPrefsPatch,
  domainStatus,
  validateEmailSettings,
} = await import(pathToFileURL(out).href);

// --- Vocabulary / defaults ---------------------------------------------------
assert.equal(EMAIL_SETTINGS_KEY, 'emailDelivery', 'canonical GlobalSettings block');
assert.ok(EMAIL_SETTINGS_ALIAS_KEYS.includes('emailSettings'));
assert.deepEqual(EMAIL_SETTINGS_DEFAULTS, {
  authorized_domains: [],
  default_from_address: 'noreply',
  default_from_name: '',
  reply_to: '',
  per_user_signature_enabled: true,
  bounce_handling: 'flag_only',
});
assert.ok(BOUNCE_HANDLING_MODES.includes('flag_only'));
assert.ok(USER_NOTIFICATION_PREF_KEYS.includes('automation_emails'), 'existing opt-out convention kept');
assert.ok(USER_NOTIFICATION_PREF_KEYS.every((k) => k === 'automation_emails' || k.startsWith('notify_')));

// --- normalizeEmailSettings: carriers ----------------------------------------
{
  const d = normalizeEmailSettings(undefined);
  assert.equal(d.default_from_address, 'noreply', 'missing settings → defaults');
  assert.deepEqual(d.authorized_domains, []);
  assert.equal(d.per_user_signature_enabled, true);
  assert.equal(d.enabled, false, 'enabled fail-closed');
  assert.deepEqual(normalizeEmailSettings(null).authorized_domains, []);
  assert.deepEqual(normalizeEmailSettings('oops').authorized_domains, []);
}
{
  // Slice passed directly.
  const s = normalizeEmailSettings({
    authorized_domains: ['CCS.com'],
    default_from_address: 'Sales@CCS.com',
    reply_to: 'Help@CCS.com',
    bounce_handling: 'suppress',
  });
  assert.deepEqual(s.authorized_domains, ['ccs.com'], 'domains lowercased');
  assert.equal(s.default_from_address, 'sales@ccs.com', 'address lowercased');
  assert.equal(s.reply_to, 'help@ccs.com');
  assert.equal(s.bounce_handling, 'suppress');
}
{
  // Flat GlobalSettings row (canonical A-21 block).
  const s = normalizeEmailSettings({
    emailDelivery: { enabled: true, default_from: 'noreply@ccs.com', authorized_domains: ['ccs.com'], from_salesperson_toggle: false },
  });
  assert.equal(s.enabled, true);
  assert.equal(s.default_from_address, 'noreply@ccs.com', 'legacy default_from maps');
  assert.equal(s.per_user_signature_enabled, false, 'legacy from_salesperson_toggle maps');
}
{
  // KV row whose whole value is the slice + KV blob holding the block.
  const kv = normalizeEmailSettings({ setting_key: 'emailDelivery', setting_value: { authorized_domains: ['a.com'] } });
  assert.deepEqual(kv.authorized_domains, ['a.com'], 'KV row value resolves');
  const blob = normalizeEmailSettings({ setting_key: 'x', setting_value: { emailDelivery: { authorized_domains: ['b.com'] } } });
  assert.deepEqual(blob.authorized_domains, ['b.com'], 'KV-blob block resolves');
}
{
  // emailSettings alias block overrides emailDelivery on conflicts.
  const s = normalizeEmailSettings({
    emailDelivery: { authorized_domains: ['old.com'], default_from_address: 'old@old.com' },
    emailSettings: { authorized_domains: ['new.com'] },
  });
  assert.deepEqual(s.authorized_domains, ['new.com'], 'alias block wins domains');
  assert.equal(s.default_from_address, 'old@old.com', 'unset keys still merge from base block');
}
{
  // enabled aliases: flat + nested; literal-true only.
  assert.equal(normalizeEmailSettings({ email_delivery_enabled: true }).enabled, true);
  assert.equal(normalizeEmailSettings({ delivery: { emailEnabled: true } }).enabled, true);
  assert.equal(normalizeEmailSettings({ enabled: 'true' }).enabled, false, 'string "true" is not the switch');
  assert.equal(normalizeEmailSettings({ enabled: false, email_delivery_enabled: true }).enabled, false, 'explicit false on primary path wins');
}

// --- normalizeEmailSettings: domain entry sanitization ------------------------
{
  assert.equal(normalizeDomain('HTTPS://CCS.COM/some/path?q=1'), 'ccs.com');
  assert.equal(normalizeDomain('Mail.CCS.com.'), 'mail.ccs.com');
  assert.equal(normalizeDomain('brett@gmail.com'), '', 'full address is not a domain entry');
  assert.equal(normalizeDomain('not a domain'), '');
  assert.equal(normalizeDomain('-bad-.com'), '');
}
{
  const s = normalizeEmailSettings({
    authorized_domains: 'CCS.com, https://example.org/x, brett@gmail.com, ccs.com',
    authorized_addresses: ['Owner@Gmail.com', 'junk'],
  });
  assert.deepEqual(s.authorized_domains, ['ccs.com', 'example.org'], 'string list split + cleaned + deduped');
  assert.deepEqual(s.invalid_domains, ['brett@gmail.com'], 'address-in-domain-list flagged');
  assert.deepEqual(s.duplicate_domains, ['ccs.com']);
  assert.deepEqual(s.authorized_addresses, ['owner@gmail.com']);
  assert.deepEqual(s.invalid_addresses, ['junk']);
  const objs = normalizeEmailSettings({ authorized_domains: [{ domain: 'obj.com', verified: true }] });
  assert.deepEqual(objs.authorized_domains, ['obj.com'], 'object entries read .domain');
}

// --- isAuthorizedSender --------------------------------------------------------
{
  const open = { authorized_domains: [] };
  assert.equal(isAuthorizedSender('anyone@anything.io', open), true, 'no allowlist configured → unrestricted');
  const s = { authorized_domains: ['ccs.com'], authorized_addresses: ['owner@gmail.com'] };
  assert.equal(isAuthorizedSender('sales@ccs.com', s), true);
  assert.equal(isAuthorizedSender('POS@MAIL.CCS.COM', s), true, 'subdomain inherits authorized parent');
  assert.equal(isAuthorizedSender('deep@pos.mail.ccs.com', s), true, 'multi-level subdomain inherits');
  assert.equal(isAuthorizedSender('user@evilccs.com', s), false, 'suffix lookalike does not match (needs dot boundary)');
  assert.equal(isAuthorizedSender('owner@gmail.com', s), true, 'full-address allowlist hits foreign domain');
  assert.equal(isAuthorizedSender('other@gmail.com', s), false, 'foreign domain rejected when policy configured');
  assert.equal(isAuthorizedSender('not-an-address', s), false);
  assert.equal(isAuthorizedSender('', s), false);
}

// --- resolveFromAddress ---------------------------------------------------------
{
  const settings = {
    authorized_domains: ['ccs.com'],
    default_from_address: 'noreply',
    default_from_name: 'CCS Signage',
    reply_to: 'help@ccs.com',
  };
  // User signature wins when enabled + authorized.
  const r1 = resolveFromAddress({
    settings,
    user: { full_name: 'Brett H', email_signature: { from: 'Brett@CCS.com', from_name: 'Brett', reply_to: 'b@ccs.com' } },
    location: { email: 'shop@ccs.com' },
  });
  assert.deepEqual(r1, { from_address: 'brett@ccs.com', from_name: 'Brett', reply_to: 'b@ccs.com' });
  // Signature nested under notification_prefs resolves too.
  const r1b = resolveFromAddress({
    settings,
    user: { notification_prefs: { email_signature: { from: 'brett@ccs.com' } } },
  });
  assert.equal(r1b.from_address, 'brett@ccs.com');
  assert.equal(r1b.from_name, 'CCS Signage', 'from_name falls back to default_from_name');
  assert.equal(r1b.reply_to, 'help@ccs.com', 'reply_to falls back to settings');
  // Unauthorized signature falls through to the location lane.
  const r2 = resolveFromAddress({
    settings,
    user: { email_signature: { from: 'brett@gmail.com' } },
    location: { email: 'Shop@CCS.com', name: 'Main counter', reply_to: 'counter@ccs.com' },
  });
  assert.deepEqual(r2, { from_address: 'shop@ccs.com', from_name: 'Main counter', reply_to: 'counter@ccs.com' });
  // Signature disabled → location lane.
  const r3 = resolveFromAddress({
    settings: { ...settings, per_user_signature_enabled: false },
    user: { email_signature: { from: 'brett@ccs.com' } },
    location: { email: 'shop@ccs.com' },
  });
  assert.equal(r3.from_address, 'shop@ccs.com');
  // Nothing upstream → bare local part completed by first authorized domain.
  const r4 = resolveFromAddress({ settings });
  assert.deepEqual(r4, { from_address: 'noreply@ccs.com', from_name: 'CCS Signage', reply_to: 'help@ccs.com' });
  // Full-address default is used literally; no domains → bare part stays bare.
  const r5 = resolveFromAddress({ settings: { default_from_address: 'orders@shop.com' } });
  assert.equal(r5.from_address, 'orders@shop.com');
  const r6 = resolveFromAddress({ settings: {} });
  assert.equal(r6.from_address, 'noreply', 'no authorized domain → bare local part (validation warns)');
  // No location email → default lane.
  const r7 = resolveFromAddress({ settings, location: { name: 'East' } });
  assert.equal(r7.from_address, 'noreply@ccs.com');
}

// --- userEmailPrefsPatch ----------------------------------------------------------
{
  const user = {
    notification_prefs: {
      automation_emails: false,
      notify_digests: true,
      bogus_key: true,
      notify_bad: 'yes',
      email_signature: { from: 'old@ccs.com', body: 'Brett' },
    },
  };
  const prefs = userEmailPrefsPatch({
    user,
    patch: { notify_digests: false, notify_bounces: true, not_allowed: true, notify_str: 'true', email_signature: { from: 'New@CCS.com', from_name: 'B', reply_to: 'r@ccs.com', body: 'sig' } },
  });
  assert.equal(prefs.automation_emails, false, 'existing allowed bool preserved');
  assert.equal(prefs.notify_digests, false, 'patched bool applied');
  assert.equal(prefs.notify_bounces, true, 'new allowlisted key applied');
  assert.equal(prefs.not_allowed, undefined, 'non-allowlisted key dropped');
  assert.equal(prefs.notify_str, undefined, 'non-boolean value dropped');
  assert.equal(prefs.bogus_key, undefined, 'unrecognized stored key dropped');
  assert.equal(prefs.notify_bad, undefined, 'non-boolean stored key dropped');
  assert.deepEqual(prefs.email_signature, { from: 'new@ccs.com', from_name: 'B', reply_to: 'r@ccs.com', body: 'sig' }, 'signature sanitized + nested');
}
{
  // {notification_prefs:{...}} wrapper accepted; invalid sig parts dropped;
  // bare-string signature stores body only.
  const prefs = userEmailPrefsPatch({
    user: {},
    patch: { notification_prefs: { automation_emails: true, email_signature: { from: 'bad addr', body: 'x' } } },
  });
  assert.equal(prefs.automation_emails, true);
  assert.deepEqual(prefs.email_signature, { body: 'x' }, 'invalid from dropped, body kept');
  const bare = userEmailPrefsPatch({ user: {}, patch: { email_signature: 'Brett — CCS' } });
  assert.deepEqual(bare.email_signature, { body: 'Brett — CCS' });
}

// --- domainStatus ------------------------------------------------------------------
{
  const s = { authorized_domains: ['ccs.com'] };
  assert.deepEqual(domainStatus('CCS.com', s), { domain: 'ccs.com', authorized: true, verified_hint: 'listed_unverified' });
  assert.deepEqual(domainStatus('pos.ccs.com', s), { domain: 'pos.ccs.com', authorized: true, verified_hint: 'listed_unverified' }, 'subdomain inherits');
  assert.deepEqual(domainStatus('other.com', s), { domain: 'other.com', authorized: false, verified_hint: 'not_listed' });
  assert.equal(domainStatus('bad', s).verified_hint, 'invalid_domain');
  assert.equal(domainStatus('a.com', {}).verified_hint, 'no_domains_configured');
}

// --- validateEmailSettings -----------------------------------------------------------
{
  const cleanRun = validateEmailSettings({ emailDelivery: { enabled: true, authorized_domains: ['ccs.com'], default_from_address: 'noreply' } });
  assert.deepEqual(cleanRun.errors, []);
  const bad = validateEmailSettings({ authorized_domains: ['ok.com', 'not a domain', 'ok.com'], reply_to: 'junk' });
  assert.ok(bad.errors.some((e) => e.includes('not a domain')), 'invalid domain → error');
  assert.ok(bad.errors.some((e) => e.includes('reply_to')), 'bad reply_to → error');
  assert.ok(bad.warnings.some((w) => w.includes('more than once')), 'duplicate → warning');
  const missing = validateEmailSettings({ default_from_address: '' });
  assert.ok(missing.errors.some((e) => e.includes('required')), 'missing from → error');
  const bareNoDomain = validateEmailSettings({ default_from_address: 'noreply' });
  assert.ok(bareNoDomain.warnings.some((w) => w.includes('no authorized domain')), 'bare local + no domain → warning');
  const offDomain = validateEmailSettings({ authorized_domains: ['ccs.com'], default_from_address: 'noreply@gmail.com' });
  assert.ok(offDomain.warnings.some((w) => w.includes('not on an authorized domain')));
  const badLocal = validateEmailSettings({ default_from_address: '%%%' });
  assert.ok(badLocal.errors.some((e) => e.includes('local part')));
  const badBounce = validateEmailSettings({ bounce_handling: 'explode' });
  assert.equal(normalizeEmailSettings({ bounce_handling: 'explode' }).bounce_handling, 'flag_only', 'unknown mode falls back');
  const disabled = validateEmailSettings({ enabled: false });
  assert.ok(disabled.warnings.some((w) => w.includes('disabled')), 'disabled → warning, no sending while off');
  const unrestricted = validateEmailSettings({ per_user_signature_enabled: true });
  assert.ok(unrestricted.warnings.some((w) => w.includes('unrestricted')));
}

rmSync(out, { force: true });
console.log('PASS email-settings');
