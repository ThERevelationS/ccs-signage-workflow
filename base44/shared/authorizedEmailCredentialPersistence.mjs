function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).sort().reduce((out, key) => {
    out[key] = normalize(value[key]);
    return out;
  }, {});
}

function sameValue(a, b) {
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}

export async function replaceAuthorizedEmailCredentialFieldsIfUnchanged({
  entity,
  user,
  nextFields,
  guardFields = {},
  label = 'Authorized user credential',
  maxAttempts = 3,
} = {}) {
  const id = String(user?.id || '').trim();
  const desired = nextFields && typeof nextFields === 'object' && !Array.isArray(nextFields) ? nextFields : null;
  if (!id || !desired || Object.keys(desired).length === 0 || typeof entity?.get !== 'function' || typeof entity?.updateMany !== 'function') {
    throw new Error(`${label} could not initialize its concurrency-safe update.`);
  }
  const expected = Object.fromEntries(Object.keys(desired).map(field => [field, user?.[field]]));

  const attempts = Math.max(1, Math.min(5, Number(maxAttempts) || 3));
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const current = await entity.get(id);
    if (!current?.id) throw new Error(`${label} could not be re-read before saving.`);

    for (const [field, value] of Object.entries(guardFields || {})) {
      if (!sameValue(current[field], value)) {
        throw new Error(`${label} changed in another session (${field}).`);
      }
    }

    const alreadyDesired = Object.keys(desired).every(field => sameValue(current[field], desired[field]));
    if (alreadyDesired) return current;

    for (const field of Object.keys(desired)) {
      if (!sameValue(current[field], expected[field]) && !sameValue(current[field], desired[field])) {
        throw new Error(`${label} changed in another session (${field}).`);
      }
    }

    const version = String(current.updated_date || '').trim();
    if (!version) throw new Error(`${label} is missing its current version.`);

    let result;
    try {
      result = await entity.updateMany({ id, updated_date: version }, { $set: desired });
    } catch (error) {
      const afterError = await entity.get(id).catch(() => null);
      if (afterError && Object.keys(desired).every(field => sameValue(afterError[field], desired[field]))) return afterError;
      throw error;
    }

    if (!result || typeof result.updated !== 'number') throw new Error(`${label} conditional update could not be verified.`);
    if (result.updated > 1) throw new Error(`${label} unexpectedly updated multiple users.`);
    if (result.updated === 1) {
      const saved = await entity.get(id);
      if (!saved?.id || !Object.keys(desired).every(field => sameValue(saved[field], desired[field]))) {
        throw new Error(`${label} saved but could not be verified.`);
      }
      return saved;
    }
  }

  throw new Error(`${label} changed repeatedly while saving.`);
}

export async function claimPasswordResetToken({ entity, user, resetToken, resetTokenHash, label = 'Password reset token' } = {}) {
  const id = String(user?.id || '').trim();
  const token = String(resetToken || '').trim();
  const tokenHash = String(resetTokenHash || '').trim();
  if (!id || (!token && !tokenHash) || typeof entity?.get !== 'function' || typeof entity?.updateMany !== 'function') {
    throw new Error(`${label} could not initialize its single-use claim.`);
  }

  const current = await entity.get(id);
  const matchesHash = Boolean(tokenHash) && String(current?.password_reset_token_hash || '') === tokenHash;
  const matchesLegacyRaw = !matchesHash && Boolean(token) && String(current?.password_reset_token || '') === token;
  if (!current?.id || (!matchesHash && !matchesLegacyRaw)) {
    throw new Error('This password reset link has already been used or replaced.');
  }
  const version = String(current.updated_date || '').trim();
  if (!version) throw new Error(`${label} is missing its current version.`);

  const claimQuery = matchesHash
    ? { id, updated_date: version, password_reset_token_hash: tokenHash }
    : { id, updated_date: version, password_reset_token: token };

  let result;
  try {
    result = await entity.updateMany(
      claimQuery,
      { $set: { password_reset_token: null, password_reset_token_hash: null, password_reset_expires: null } },
    );
  } catch (error) {
    const afterError = await entity.get(id).catch(() => null);
    const stillMatches = matchesHash
      ? String(afterError?.password_reset_token_hash || '') === tokenHash
      : String(afterError?.password_reset_token || '') === token;
    if (afterError && !stillMatches) {
      throw new Error('The reset token claim outcome is ambiguous. Request a new reset link before retrying.');
    }
    throw error;
  }

  if (!result || typeof result.updated !== 'number') throw new Error(`${label} claim could not be verified.`);
  if (result.updated !== 1) {
    throw new Error('This password reset link has already been used or changed.');
  }
  const claimed = await entity.get(id);
  if (!claimed?.id || claimed.password_reset_token || claimed.password_reset_token_hash) {
    throw new Error(`${label} was claimed but the single-use state could not be verified.`);
  }
  return claimed;
}
