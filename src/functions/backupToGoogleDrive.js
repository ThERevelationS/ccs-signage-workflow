import { base44 } from "@/api/base44Client";
export const backupToGoogleDrive = (payload) => base44.functions.invoke("backupToGoogleDrive", payload);
