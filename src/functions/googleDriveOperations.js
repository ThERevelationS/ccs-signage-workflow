import { base44 } from "@/api/base44Client";
export const googleDriveOperations = (payload) => base44.functions.invoke("googleDriveOperations", payload);
