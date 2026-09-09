// Backward-compatible re-export. GlobalSettings persistence is shared across
// permitting and other admin settings surfaces.
export {
  loadSingleGlobalSetting,
  saveGlobalSettingValueIfUnchanged,
} from "@/components/shared/globalSettingsPersistence";
