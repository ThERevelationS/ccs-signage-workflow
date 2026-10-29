// Compatibility shim: legacy "@/entities/all" imports now resolve through
// the session-gated entity facade (staffDataRead gateway + action functions).
export * from "../api/gatedEntities";
