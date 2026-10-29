import { base44 } from "@/api/base44Client";
export const sendGmail = (payload) => base44.functions.invoke("sendGmail", payload);
