// @/components/estimator/builder/builderEntityPersistence stub.
export const expectedEntityFields = (live, next) => ({ ...(live || {}), ...(next || {}) });
export const replaceEntityFieldsIfUnchanged = async ({ nextFields }) => nextFields;
export const deleteEntityIfUnchanged = async () => true;
export const createFoundationRecordWithRecovery = async ({ data }) => ({ record: { id: "stub", ...data } });
