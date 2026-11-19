export async function deleteBuilderEntityIfUnchanged() { return { deleted: true }; }
export function expectedBuilderEntityFields(_record, _next) { return {}; }
export async function replaceBuilderEntityFieldsIfUnchanged({ nextFields } = {}) { return { ...(nextFields || {}) }; }
