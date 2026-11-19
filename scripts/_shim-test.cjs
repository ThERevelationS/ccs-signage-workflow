const dayjs = require("dayjs");
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

// --- functions copied verbatim from the deployed calendar.jsx shim ---
function toStr(d) { return d instanceof Date && !isNaN(d) ? dayjs(d).format("YYYY-MM-DD") : null; }
function toDate(s) { return s ? dayjs(s, "YYYY-MM-DD").toDate() : null; }
function matchOne(m, d) {
  if (typeof m === "boolean") return m;
  if (m instanceof Date) return dayjs(d).isSame(m, "day");
  if (typeof m === "function") return !!m(dayjs(d).toDate());
  if (m == null || typeof m !== "object") return false;
  if (typeof m.before !== "undefined" && m.before instanceof Date) return dayjs(d).isBefore(m.before, "day");
  if (typeof m.after !== "undefined" && m.after instanceof Date) return dayjs(d).isAfter(m.after, "day");
  if (m.from instanceof Date && m.to instanceof Date) { const x = dayjs(d); return !x.isBefore(m.from, "day") && !x.isAfter(m.to, "day"); }
  if (Array.isArray(m.dayOfWeek)) return m.dayOfWeek.includes(dayjs(d).day());
  return false;
}
function matcherToExclude(disabled) {
  if (disabled == null || disabled === false) return undefined;
  const list = Array.isArray(disabled) ? disabled : [disabled];
  if (list.length === 1 && typeof list[0] === "boolean") return list[0] ? () => true : undefined;
  return (d) => list.some((m) => matchOne(m, d));
}
// --- end copy ---

const today = new Date(); today.setHours(12,0,0,0);
const t = (name, cond) => console.log(cond ? "PASS" : "FAIL", name);

const exBefore = matcherToExclude({ before: addDays(today, 1) });  // SIPs: disable today+past
t("before: yesterday excluded", exBefore(addDays(today, -1).toISOString().slice(0,10)));
t("before: today excluded", exBefore(today.toISOString().slice(0,10)));
t("before: tomorrow allowed", !exBefore(addDays(today, 1).toISOString().slice(0,10)));

const exAfter = matcherToExclude({ after: today });               // SalesPipelineRow: no future
t("after: today allowed", !exAfter(today.toISOString().slice(0,10)));
t("after: tomorrow excluded", exAfter(addDays(today, 1).toISOString().slice(0,10)));

const exTrue = matcherToExclude(true);                            // saving state
t("bool true excludes all", exTrue(today.toISOString().slice(0,10)));
t("undefined matcher", matcherToExclude(undefined) === undefined);

const exArr = matcherToExclude([{ before: today }, addDays(today, 5)]); // mixed array
t("array: past excluded", exArr(addDays(today,-2).toISOString().slice(0,10)));
t("array: +5d excluded", exArr(addDays(today,5).toISOString().slice(0,10)));
t("array: +2d allowed", !exArr(addDays(today,2).toISOString().slice(0,10)));

const exDow = matcherToExclude({ dayOfWeek: [0,6] });
const sat = new Date(2026, 9, 31); // Oct 31 2026 = Saturday
t("dayOfWeek: Sat excluded", exDow(sat.toISOString().slice(0,10)));
t("dayOfWeek: Fri allowed", !exDow("2026-10-30"));

t("roundtrip Date->str->Date", toStr(toDate("2026-10-31")) === "2026-10-31");
t("invalid date -> null", toStr(undefined) === null && toStr(new Date("x")) === null);
const round = toDate("2026-10-31");
t("toDate local midnight", round.getFullYear()===2026 && round.getMonth()===9 && round.getDate()===31);
