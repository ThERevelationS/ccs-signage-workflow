// Shared Mantine-backed date fields — every date/time input in the app should
// render through these so picking, typing, shortcuts, dark mode, and mobile
// behavior stay identical everywhere. Values keep the app's existing storage
// formats: date "YYYY-MM-DD", datetime "YYYY-MM-DDTHH:MM", time "HH:MM".
// onChange emits a synthetic { target: { value } } event so call sites keep
// their existing e.target.value handlers.
import { useSyncExternalStore } from "react";
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import { MantineProvider, Menu, createTheme } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { CalendarClock, X } from "lucide-react";
import { DateInput, DatePickerInput, DateTimePicker, TimePicker } from "@mantine/dates";

dayjs.extend(customParseFormat);

const theme = createTheme({
  fontFamily: "inherit",
  primaryColor: "violet",
  defaultRadius: "md",
});

function subscribeDark(cb) {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => obs.disconnect();
}
function useDarkScheme() {
  return useSyncExternalStore(
    subscribeDark,
    () => document.documentElement.classList.contains("dark"),
    () => false
  );
}

// Mount once near the app root so Mantine picks up the shell's light/dark mode.
export function CcsMantineProvider({ children }) {
  const dark = useDarkScheme();
  return (
    <MantineProvider theme={theme} forceColorScheme={dark ? "dark" : "light"}>
      {children}
    </MantineProvider>
  );
}

export function datePresets(today = dayjs()) {
  return [
    { value: today.format("YYYY-MM-DD"), label: "Today" },
    { value: today.add(1, "day").format("YYYY-MM-DD"), label: "Tomorrow" },
    { value: today.add(7, "day").format("YYYY-MM-DD"), label: "Next week" },
    { value: today.add(1, "month").format("YYYY-MM-DD"), label: "Next month" },
  ];
}

const fire = (onChange, value) => {
  if (onChange) onChange({ target: { value: value ?? "" } });
};

function useDropdownType() {
  const mobile = useMediaQuery("(max-width: 640px)");
  return mobile ? "modal" : "popover";
}

const toMantineDateTime = (v) => (v ? `${v.replace("T", " ").slice(0, 16)}:00` : null);
const fromMantineDateTime = (v) => (v ? v.replace(" ", "T").slice(0, 16) : "");
const trimTime = (v) => (v ? String(v).slice(0, 5) : "");
const toMantineTime = (v) => { const t = trimTime(v); return t ? `${t}:00` : ""; };


const TYPED_FORMATS = ["MM/DD/YYYY", "M/D/YYYY", "MM-DD-YYYY", "M-D-YYYY", "YYYY-MM-DD", "MM/DD/YY", "M/D/YY", "MMMM D, YYYY", "MMM D, YYYY", "YYYY/MM/DD"];

const parseTypedDate = (raw) => {
  const v = String(raw ?? "").trim();
  if (!v) return null;
  for (const f of TYPED_FORMATS) {
    const d = dayjs(v, f, true);
    if (d.isValid()) return d.format("YYYY-MM-DD");
  }
  const loose = dayjs(v);
  return loose.isValid() ? loose.format("YYYY-MM-DD") : null;
};

const sectionBtn = "inline-flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-200";

function ShortcutMenu({ presets, onPick }) {
  return (
    <Menu withinPortal position="bottom-end" shadow="md" width={160}>
      <Menu.Target>
        <button type="button" tabIndex={-1} aria-label="Date shortcuts" className={sectionBtn}>
          <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>Shortcuts</Menu.Label>
        {presets.map((p) => (
          <Menu.Item key={p.value} onClick={() => onPick(p.value)}>{p.label}</Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}

export function CcsDateField({
  value, onChange, min, max, presets = datePresets(), clearable = true,
  placeholder = "mm/dd/yyyy", className, classNames, disabled, readOnly, ...rest
}) {
  const showPresets = presets !== false && Array.isArray(presets) && presets.length > 0;
  const canInteract = !disabled && !readOnly;
  const showClear = canInteract && clearable && !!value;
  const rightSection = canInteract && (showPresets || showClear) ? (
    <span className="inline-flex items-center gap-0.5">
      {showClear ? (
        <button type="button" tabIndex={-1} aria-label="Clear date"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => { e.stopPropagation(); fire(onChange, ""); }}
          className={sectionBtn}>
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      ) : null}
      {showPresets ? <ShortcutMenu presets={presets} onPick={(v) => fire(onChange, v)} /> : null}
    </span>
  ) : undefined;
  return (
    <DateInput
      className="w-full"
      classNames={{ wrapper: "w-full", input: className, ...classNames }}
      value={value || null}
      onChange={(v) => fire(onChange, typeof v === "string" ? v : v ? dayjs(v).format("YYYY-MM-DD") : "")}
      dateParser={parseTypedDate}
      valueFormat="MM/DD/YYYY"
      fixOnBlur
      minDate={min || undefined}
      maxDate={max || undefined}
      placeholder={placeholder}
      clearable={!rightSection && clearable}
      rightSection={rightSection}
      rightSectionPointerEvents="all"
      rightSectionWidth={rightSection ? (showClear ? 52 : 30) : undefined}
      popoverProps={{ withinPortal: true, shadow: "md" }}
      weekendDays={[0, 6]}
      disabled={disabled}
      readOnly={readOnly}
      {...rest}
    />
  );
}

export function CcsDateTimeField({
  value, onChange, min, max, presets = datePresets(), clearable = true,
  placeholder = "mm/dd/yyyy hh:mm", className, classNames, ...rest
}) {
  const dropdownType = useDropdownType();
  return (
    <DateTimePicker
      className="w-full"
      classNames={{ input: className, ...classNames }}
      value={toMantineDateTime(value)}
      onChange={(v) => fire(onChange, fromMantineDateTime(v))}
      minDate={min || undefined}
      maxDate={max || undefined}
      valueFormat="MM/DD/YYYY hh:mm A"
      placeholder={placeholder}
      clearable={clearable}
      dropdownType={dropdownType}
      presets={dropdownType !== "modal" && presets !== false ? presets : undefined}
      timePickerProps={{ withDropdown: true, format: "12h", minutesStep: 5 }}
      weekendDays={[0, 6]}
      {...rest}
    />
  );
}

export function CcsTimeField({
  value, onChange, min, max, clearable = true, placeholder = "--:--", className, classNames, ...rest
}) {
  return (
    <TimePicker
      className="w-full"
      classNames={{ input: className, ...classNames }}
      value={value ? toMantineTime(value) : ""}
      onChange={(v) => fire(onChange, trimTime(v))}
      min={min ? toMantineTime(min) : undefined}
      max={max ? toMantineTime(max) : undefined}
      placeholder={placeholder}
      clearable={clearable}
      format="12h"
      minutesStep={5}
      withDropdown
      {...rest}
    />
  );
}

export function CcsDateRangeField({
  value = [null, null], onChange, presets, clearable = true,
  placeholder = "Pick range", className, classNames, ...rest
}) {
  const dropdownType = useDropdownType();
  return (
    <DatePickerInput
      type="range"
      className="w-full"
      classNames={{ input: className, ...classNames }}
      value={value}
      onChange={(v) => onChange && onChange(v)}
      valueFormat="MM/DD/YYYY"
      placeholder={placeholder}
      clearable={clearable}
      dropdownType={dropdownType}
      presets={presets}
      weekendDays={[0, 6]}
      {...rest}
    />
  );
}