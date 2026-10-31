// Shared page-level UI kit. Pure presentation — no business logic, no data
// access. Import from the barrel: import { PageHeader, StatusChip } from "@/components/kit";

export { PageHeader } from "./PageHeader";
export { BreadcrumbBar } from "./BreadcrumbBar";
export { FilterBar, FilterSearchInput, FilterSelect, FilterField, filterInputCls } from "./FilterBar";
export { StatusChip, statusTone, statusLabel } from "./StatusChip";
export { KpiStrip } from "./KpiStrip";
export { EmptyState } from "./EmptyState";
export { RecordLink } from "./RecordLink";
export { DataTableShell, Tr, Th, Td } from "./DataTable";
export { showUndo } from "./UndoToast";
export { DetailDrawer } from "./DetailDrawer";

// Pure models (dependency-free — safe to bundle under Node for tests).
export {
  STATUS_TONES,
  TONE_NAMES,
  TONE_CHIP_CLASSES,
  TONE_DOT_CLASSES,
  TONE_TEXT_CLASSES,
} from "./statusTones";
export { RECORD_ROUTES, RECORD_KINDS, recordRoute, recordHref, recordLabel } from "./recordRoutes";
