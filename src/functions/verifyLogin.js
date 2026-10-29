import { base44 } from "@/api/base44Client";
export const verifyLogin = (payload) => base44.functions.invoke("verifyLogin", payload);
