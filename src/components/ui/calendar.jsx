import dayjs from "dayjs";
import { DatePicker } from "@mantine/dates";
import { cn } from "@/lib/utils";

function toStr(d) {
  return d instanceof Date && !isNaN(d) ? dayjs(d).format("YYYY-MM-DD") : null;
}
function toDate(s) {
  return s ? dayjs(s, "YYYY-MM-DD").toDate() : null;
}

function matchOne(m, d) {
  if (typeof m === "boolean") return m;
  if (m instanceof Date) return dayjs(d).isSame(m, "day");
  if (typeof m === "function") return !!m(dayjs(d).toDate());
  if (m == null || typeof m !== "object") return false;
  if (typeof m.before !== "undefined" && m.before instanceof Date)
    return dayjs(d).isBefore(m.before, "day");
  if (typeof m.after !== "undefined" && m.after instanceof Date)
    return dayjs(d).isAfter(m.after, "day");
  if (m.from instanceof Date && m.to instanceof Date) {
    const x = dayjs(d);
    return !x.isBefore(m.from, "day") && !x.isAfter(m.to, "day");
  }
  if (Array.isArray(m.dayOfWeek)) return m.dayOfWeek.includes(dayjs(d).day());
  if (m instanceof Date) return dayjs(d).isSame(m, "day");
  return false;
}

function matcherToExclude(disabled) {
  if (disabled == null || disabled === false) return undefined;
  const list = Array.isArray(disabled) ? disabled : [disabled];
  if (list.length === 1 && typeof list[0] === "boolean")
    return list[0] ? () => true : undefined;
  return (d) => list.some((m) => matchOne(m, d));
}

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  mode = "single",
  selected,
  onSelect,
  disabled,
  month,
  defaultMonth,
  ...props
}) {
  const isAllDisabled = disabled === true ||
    (Array.isArray(disabled) && disabled.length === 1 && disabled[0] === true);

  const handleChange = (value) => {
    if (!onSelect) return;
    if (mode === "range") {
      onSelect({ from: toDate(value?.[0]), to: toDate(value?.[1]) });
    } else if (mode === "multiple") {
      onSelect((value || []).map(toDate).filter(Boolean));
    } else {
      onSelect(value ? toDate(value) : undefined);
    }
  };

  const value =
    mode === "range"
      ? [toStr(selected?.from), toStr(selected?.to)]
      : mode === "multiple"
        ? (selected || []).map(toStr).filter(Boolean)
        : toStr(selected);

  return (
    <div
      className={cn("p-3", className, isAllDisabled && "opacity-60 pointer-events-none")}
      aria-disabled={isAllDisabled || undefined}
    >
      <DatePicker
        type={mode === "range" ? "range" : mode === "multiple" ? "multiple" : "default"}
        value={value}
        onChange={handleChange}
        date={toStr(month || defaultMonth) || undefined}
        excludeDate={matcherToExclude(disabled)}
        hideOutsideDates={!showOutsideDays}
        size="sm"
        {...props}
      />
    </div>
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
