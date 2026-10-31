import { base44 } from "@/api/base44Client";
export const generateDocNumber = (payload) => base44.functions.invoke("generateDocNumber", payload);
