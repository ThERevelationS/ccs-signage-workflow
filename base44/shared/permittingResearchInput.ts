function cleanText(value: unknown) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function boundedField(value: unknown, label: string, maxLength: number, required = true) {
  const text = cleanText(value);
  if (required && !text) throw Object.assign(new Error(`${label} is required`), { status: 400 });
  if (text.length > maxLength) throw Object.assign(new Error(`${label} is too long`), { status: 400 });
  if (/[\u0000-\u001F\u007F]/.test(text)) throw Object.assign(new Error(`${label} contains invalid control characters`), { status: 400 });
  return text;
}

export function normalizePermittingResearchInput(body: any = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw Object.assign(new Error('Invalid request body'), { status: 400 });
  }

  return {
    jurisdictionName: boundedField(body.jurisdictionName, 'jurisdictionName', 160),
    jurisdictionState: boundedField(body.jurisdictionState, 'jurisdictionState', 64),
    jurisdictionType: boundedField(body.jurisdictionType || 'county', 'jurisdictionType', 64),
    includeParentCounty: body.includeParentCounty !== false,
  };
}
