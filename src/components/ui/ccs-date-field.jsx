// Shared Mantine-backed date fields — every date/time input in the app should
// render through these so picking, typing, shortcuts, dark mode, and mobile
// behavior stay identical everywhere. Values keep the app's existing storage
// formats: date "YYYY-MM-DD", datetime "YYYY-MM-DDTHH:MM", time "HH:MM".
// onChange emits a synthetic { target: { value } } event so call sites keep
// their existing e.target.value handlers.
import { useSyncExternalStore } from "react";
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import { MantineProvider, createTheme } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { DatePickerInput, DateTimePicker, TimePicker } from "@mantine/dates";

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

export function CcsDateField({
  value, onChange, min, max, presets = datePresets(), clearable = true,
  placeholder = "mm/dd/yyyy", ...rest
}) {
  const dropdownType = useDropdownType();
  return (
    <DatePickerInput
      value={value || null}
      onChange={(v) => fire(onChange, v)}
      minDate={min || undefined}
      maxDate={max || undefined}
      valueFormat="MM/DD/YYYY"
      placeholder={placeholder}
      clearable={clearable}
      dropdownType={dropdownType}
      presets={presets === false ? undefined : presets}
      weekendDays={[0, 6]}
      {...rest}
    />
  );
}

export function CcsDateTimeField({
  value, onChange, min, max, presets = datePresets(), clearable = true,
  placeholder = "mm/dd/yyyy hh:mm", ...rest
}) {
  const dropdownType = useDropdownType();
  return (
    <DateTimePicker
      value={toMantineDateTime(value)}
      onChange={(v) => fire(onChange, fromMantineDateTime(v))}
      minDate={min || undefined}
      maxDate={max || undefined}
      valueFormat="MM/DD/YYYY hh:mm A"
      placeholder={placeholder}
      clearable={clearable}
      dropdownType={dropdownType}
      presets={presets === false ? undefined : presets}
      timePickerProps={{ withDropdown: true, format: "12h", minutesStep: 5 }}
      weekendDays={[0, 6]}
      {...rest}
    />
  );
}

export function CcsTimeField({
  value, onChange, min, max, clearable = true, placeholder = "--:--", ...rest
}) {
  return (
    <TimePicker
      value={trimTime(value)}
      onChange={(v) => fire(onChange, trimTime(v))}
      min={min || undefined}
      max={max || undefined}
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
  placeholder = "Pick range", ...rest
}) {
  const dropdownType = useDropdownType();
  return (
    <DatePickerInput
      type="range"
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
