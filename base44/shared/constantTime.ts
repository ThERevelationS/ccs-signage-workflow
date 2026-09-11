export function constantTimeEqual(a: unknown, b: unknown) {
  const left = String(a ?? '');
  const right = String(b ?? '');
  if (left.length !== right.length) return false;

  let diff = 0;
  for (let i = 0; i < left.length; i += 1) {
    diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return diff === 0;
}
