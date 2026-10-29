import { base44 } from "@/api/base44Client";
export const migrateCredentials = (payload) => base44.functions.invoke("migrateCredentials", payload);
