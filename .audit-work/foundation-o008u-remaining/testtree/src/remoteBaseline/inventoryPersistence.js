// ./inventoryPersistence stub for the harness.
export const createInventoryRecordWithRecovery = async ({ data }) => ({ record: { id: "stub-new", ...data } });
export const findInventoryPartReferences = async () => ({ count: 0, names: [] });
export const findInventoryEstimateUsage = async () => ({ estimates: 0, products: 0, estimateIds: [] });
export const deleteInventoryRecordIfUnchanged = async () => true;
