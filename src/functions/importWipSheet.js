import { base44 } from "@/api/base44Client";
export const importWipSheet = (payload) => base44.functions.invoke("importWipSheet", payload);
