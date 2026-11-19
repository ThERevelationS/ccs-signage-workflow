export const loadAllEntityRows = async () => {
  if (globalThis.__tplLoadErr) throw globalThis.__tplLoadErr;
  return globalThis.__tplRows || [];
};
