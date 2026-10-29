import { base44 } from "@/api/base44Client";
export const setPassword = (payload) => base44.functions.invoke("setPassword", payload);
