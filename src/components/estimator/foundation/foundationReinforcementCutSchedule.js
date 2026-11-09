import { foundationInputNumber } from "./foundationGeometryInputs";

// Rebar cut/stock schedule for version-2 reinforcement (O-029 / CMP-B15).
//
// Every quantity derives from the freshly calculated model's authored bar runs
// (`model.groups`) — never from a stored schedule, a guessed stock length, or an
// invented bend. This is a fabrication/purchasing plan artifact: it does not
// reprice steel (that stays per-foot on geometry), it does not approve
// engineering, and it never marks anything procurement-ready.
//
// Stock-length packing is first-fit-decreasing (FFD), generalized to variable
// stock lengths: pieces are processed longest-first (ties keep authored run
// order); each piece goes into the FIRST already-open stock piece with enough
// remaining capacity; when no open stock fits, a new stock piece opens at the
// SMALLEST configured stock length that can hold the cut. FFD is a documented
// deterministic heuristic only — no optimality claim is made or implied.
//
// Cut lines that exceed every configured stock length, malformed stock
// metadata, and missing stock metadata all fail closed with structured issues:
// a proven infeasibility is an error (the design cannot be fabricated from the
// configured stock), while unknown stock stays a warning — steel pricing does
// not consume the schedule, so the plan reports the gap instead of guessing.

const MAX_STOCK_LENGTH_INCHES = 1200;
const MAX_PIECES = 65536;
const FIT_TOLERANCE = 1e-9;
const STEEL_ROLES = Object.freeze(["horizontal", "longitudinal", "hoop", "inter_mat_tie"]);

// Shapes are mechanically derivable run forms only. Authored L/U/custom bends
// are not modeled inputs today, so nothing assigns an ACI/CRSI bend code —
// `bend_code` stays null rather than a fabricated shape label.
const ROLE_SHAPES = Object.freeze({
  horizontal: "straight",
  longitudinal: "straight",
  hoop: "hoop",
  inter_mat_tie: "as_authored",
});

const isRecord = value => value !== null && typeof value === "object"
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const finite = value => typeof value === "number" && Number.isFinite(value);
const positive = value => finite(value) && value > 0;
const whole = value => finite(value) && Number.isSafeInteger(value) && value >= 0;
const text = value => typeof value === "string" && value.trim() ? value.trim() : "";
const number = value => value === null || value === undefined || value === ""
  ? null : foundationInputNumber(value);

const base = status => ({
  version: 1, status, bar_size: null, bar_diameter_inches: null,
  instance_count: null, cut_lines: [], piece_count_total: 0,
  stock: null, elevation_summary: [], issues: [],
});

// Runs keep the model's stable group ids: `${matId}/x` and `${matId}/z` for
// spread mats (x-run bars span the item length; z-run bars span the width),
// `pillar/longitudinal`, and the authored hoop/tie ids.
function matRun(groupId) {
  if (typeof groupId !== "string") return null;
  if (groupId.endsWith("/x")) return { mat_id: groupId.slice(0, -2), direction: "x" };
  if (groupId.endsWith("/z")) return { mat_id: groupId.slice(0, -2), direction: "z" };
  return null;
}

// The configured rebar catalog row is the stock-length authority. A manual
// basis carries no stock metadata by construction; ambiguous or unavailable
// rows are already reported by the basis resolution, so the schedule only
// reports that no usable stock pool exists.
function stockPool(material, inventory, issue) {
  const lengths = new Set();
  let malformed = 0, row = null;
  if (material?.kind === "catalog" && typeof material.inventory_id === "string" && material.inventory_id) {
    const matches = (Array.isArray(inventory) ? inventory : [])
      .filter(candidate => isRecord(candidate) && candidate.id === material.inventory_id
        && candidate.material_type === "rebar");
    row = matches.length === 1 ? matches[0] : null;
  }
  const add = raw => {
    const value = number(raw);
    if (value === null) { if (raw !== null && raw !== undefined && raw !== "") malformed += 1; return; }
    if (!positive(value) || value > MAX_STOCK_LENGTH_INCHES) { malformed += 1; return; }
    lengths.add(value);
  };
  if (row) {
    add(row.rebar_stock_length_inches);
    const list = row.rebar_stock_lengths_inches;
    if (list !== null && list !== undefined && list !== "") {
      if (Array.isArray(list)) list.forEach(add);
      else if (typeof list === "string") list.split(",").forEach(add);
      else malformed += 1;
    }
  }
  if (malformed) {
    issue("stock_lengths", "reinforcement_stock_length_invalid",
      `${malformed} rebar stock-length entr${malformed === 1 ? "y was" : "ies were"} malformed and ignored; repair the catalog row.`,
      "warning");
  }
  return {
    row,
    lengths: [...lengths].sort((a, b) => a - b),
  };
}

function elevationSummary(design, model, groups) {
  const summary = [];
  const diameter = model?.groups?.[0]?.diameter_inches ?? design?.bar_diameter_inches;
  const radius = positive(diameter) ? diameter / 2 : null;
  const mats = Array.isArray(design?.spread?.mats) ? design.spread.mats : [];
  const bearings = mats.map(mat => number(mat?.bearing_elevation_inches));
  const order = bearings
    .map((bearing, index) => ({ bearing, index }))
    .sort((a, b) => (a.bearing ?? Infinity) - (b.bearing ?? Infinity));
  const tier = new Map(order.map((entry, rank) => [entry.index, rank]));
  mats.forEach((mat, index) => {
    const id = text(mat?.id);
    if (!id) return;
    const xRun = groups.find(group => group.id === `${id}/x`);
    const zRun = groups.find(group => group.id === `${id}/z`);
    const bearing = bearings[index];
    summary.push({
      kind: "mat", index, tier: tier.get(index) ?? index, mat_id: id,
      bearing_elevation_inches: bearing,
      x_bars: xRun ? {
        count: xRun.count, cut_length_inches: xRun.cut_length_inches,
        elevation_inches: bearing !== null && radius !== null ? bearing + radius : null,
      } : null,
      z_bars: zRun ? {
        count: zRun.count, cut_length_inches: zRun.cut_length_inches,
        elevation_inches: bearing !== null && radius !== null ? bearing + 3 * radius : null,
      } : null,
      crossings: xRun && zRun ? xRun.count * zRun.count : null,
    });
  });
  const longitudinal = design?.pillar?.longitudinal;
  const cageRun = groups.find(group => group.id === "pillar/longitudinal");
  if (cageRun) {
    const bottom = number(longitudinal?.bottom_end_inches);
    const top = number(longitudinal?.top_end_inches);
    summary.push({
      kind: "pillar_cage", index: 0,
      bar_count: cageRun.count, cut_length_inches: cageRun.cut_length_inches,
      bottom_elevation_inches: bottom, top_elevation_inches: top,
      radius_inches: number(longitudinal?.radius_inches),
    });
  }
  (Array.isArray(design?.pillar?.hoops) ? design.pillar.hoops : []).forEach((hoop, index) => {
    const run = groups.find(group => group.id === hoop?.id && group.role === "hoop");
    if (!run) return;
    summary.push({
      kind: "pillar_hoop", index, hoop_id: text(hoop?.id) || run.id,
      center_y_inches: number(hoop?.center_y_inches),
      centerline_diameter_inches: number(hoop?.centerline_diameter_inches),
      cut_length_inches: run.cut_length_inches,
    });
  });
  return summary;
}

// FFD bin packing over one bar group. `pieces` arrive sorted longest-first;
// `lengths` is the ascending configured stock pool. Returns the ordered open
// bins, or null when a cut provably exceeds the longest stock (caller reports).
function packFirstFitDecreasing(pieces, lengths) {
  const bins = [];
  for (const piece of pieces) {
    let target = null;
    for (const bin of bins) {
      if (bin.remaining + FIT_TOLERANCE >= piece.cut_length_inches) { target = bin; break; }
    }
    if (!target) {
      const stock = lengths.find(length => length + FIT_TOLERANCE >= piece.cut_length_inches);
      if (stock === undefined) return null;
      target = { stock_length_inches: stock, remaining: stock, cuts: new Map() };
      bins.push(target);
    }
    target.remaining -= piece.cut_length_inches;
    if (target.remaining < 0 && target.remaining > -FIT_TOLERANCE) target.remaining = 0;
    target.cuts.set(piece.cut_length_inches, (target.cuts.get(piece.cut_length_inches) ?? 0) + 1);
  }
  return bins;
}

export function calculateFoundationReinforcementCutSchedule({
  item, design, model, material, inventory = [], maxPieces = MAX_PIECES,
} = {}) {
  const issues = [];
  const issue = (field, code, message, severity = "error") => issues.push({ field, code, message, severity });
  const result = base("unavailable");
  result.issues = issues;

  if (model?.version !== 2 || !["valid", "off"].includes(model.status)) return result;
  if (model.status === "off") {
    return { ...base("not_required"), instance_count: model.instanceCount ?? null, issues };
  }
  const instanceCount = whole(model.instanceCount) && model.instanceCount > 0 ? model.instanceCount : null;
  if (instanceCount === null) {
    issue("model.instanceCount", "reinforcement_numeric_range_invalid",
      "A cut schedule requires a known positive foundation instance count.");
    return { ...result, issues };
  }
  result.instance_count = instanceCount;

  // Cut lines — one per authored bar run, straight from the validated model.
  const groups = Array.isArray(model.groups) ? model.groups : [];
  let malformedRuns = 0;
  for (const group of groups) {
    const run = isRecord(group) && STEEL_ROLES.includes(group.role)
      && whole(group.count) && group.count > 0
      && positive(group.cut_length_inches) && positive(group.diameter_inches)
      ? group : null;
    if (!run) { malformedRuns += 1; continue; }
    result.cut_lines.push({
      source_run_id: run.id, role: run.role, mat_id: matRun(run.id)?.mat_id ?? null,
      bar_size: null, bar_diameter_inches: run.diameter_inches,
      cut_length_inches: run.cut_length_inches,
      shape: ROLE_SHAPES[run.role], bend_code: null,
      quantity_per_instance: run.count,
      quantity_total: run.count * instanceCount,
    });
  }
  if (malformedRuns) {
    issue("model.groups", "reinforcement_cut_schedule_run_invalid",
      `${malformedRuns} modeled bar run${malformedRuns === 1 ? "" : "s"} could not be scheduled; the schedule is incomplete.`);
    return { ...result, issues };
  }
  result.piece_count_total = result.cut_lines.reduce((sum, line) => sum + line.quantity_total, 0);
  if (!result.cut_lines.length) return { ...result, status: "resolved", issues };

  // Bar-size provenance: only the configured catalog row's authored `rebar_size`
  // label is a bar size — the diameter stays the honest physical key otherwise.
  const { row: stockRow, lengths } = stockPool(material, inventory, issue);
  const barSize = text(stockRow?.rebar_size) || null;
  result.bar_size = barSize;
  result.bar_diameter_inches = result.cut_lines[0]?.bar_diameter_inches ?? null;
  for (const line of result.cut_lines) line.bar_size = barSize;

  result.elevation_summary = elevationSummary(design, model, groups);

  if (!lengths.length) {
    issue("stock_lengths", "reinforcement_stock_length_unconfigured",
      material?.kind === "manual"
        ? "A manual rebar basis carries no catalog stock lengths; the cut lines stand but the stock/waste plan is unresolved — record stock lengths or pin a catalog row."
        : "The configured rebar catalog row declares no usable stock lengths; the cut lines stand but the stock/waste plan is unresolved — record rebar stock length metadata on the catalog row.",
      "warning");
    return { ...result, status: "unresolved", issues };
  }
  if (result.piece_count_total > maxPieces) {
    issue("model.groups", "reinforcement_cut_schedule_budget_exceeded",
      `${result.piece_count_total} total cut pieces exceed the ${maxPieces}-piece schedule budget; cut lines are reported but stock packing is skipped.`,
      "warning");
    return { ...result, status: "unresolved", issues };
  }

  // Group runs by physical bar group (bar size label when proven, else diameter).
  const byBar = new Map();
  for (const line of result.cut_lines) {
    const key = `diameter:${line.bar_diameter_inches}`;
    if (!byBar.has(key)) byBar.set(key, { bar_group: key, bar_size: barSize, bar_diameter_inches: line.bar_diameter_inches, lines: [] });
    byBar.get(key).lines.push(line);
  }

  const stock = {
    source_inventory_id: typeof stockRow?.id === "string" ? stockRow.id : null,
    lengths_inches: lengths,
    groups: [],
    totals: {
      total_linear_inches_required: 0, stock_linear_inches_purchased: 0,
      stock_count_total: 0, waste_inches: 0, waste_pct: 0,
    },
  };
  let infeasible = false;
  for (const bar of byBar.values()) {
    // FFD order: longest pieces first; equal lengths keep authored run order.
    const pieces = bar.lines
      .flatMap((line, lineIndex) => Array.from({ length: line.quantity_total },
        () => ({ cut_length_inches: line.cut_length_inches, lineIndex })))
      .sort((a, b) => b.cut_length_inches - a.cut_length_inches || a.lineIndex - b.lineIndex);
    const packed = packFirstFitDecreasing(pieces, lengths);
    if (packed === null) {
      const longest = bar.lines.reduce((max, line) => Math.max(max, line.cut_length_inches), 0);
      issue("stock_lengths", "reinforcement_cut_exceeds_stock",
        `A ${longest}-in ${bar.bar_size ?? `⌀${bar.bar_diameter_inches}in`} cut exceeds the longest configured stock (${Math.max(...lengths)} in); the run cannot be fabricated from the configured stock — update the catalog stock lengths or split the authored run.`);
      infeasible = true;
      continue;
    }
    const bins = packed.map((bin, index) => ({
      index, stock_length_inches: bin.stock_length_inches,
      cuts: [...bin.cuts.entries()]
        .sort((a, b) => b[0] - a[0])
        .map(([cut_length_inches, quantity]) => ({ cut_length_inches, quantity })),
      offcut_inches: bin.remaining,
    }));
    const byLength = new Map();
    for (const bin of bins) {
      const entry = byLength.get(bin.stock_length_inches)
        ?? { stock_length_inches: bin.stock_length_inches, stock_count: 0, pieces_per_stock: [], offcut_inches: 0 };
      entry.stock_count += 1;
      entry.pieces_per_stock.push(bin.cuts.reduce((sum, cut) => sum + cut.quantity, 0));
      entry.offcut_inches += bin.offcut_inches;
      byLength.set(bin.stock_length_inches, entry);
    }
    const groupOut = {
      bar_group: bar.bar_group, bar_size: bar.bar_size, bar_diameter_inches: bar.bar_diameter_inches,
      bins, by_length: [...byLength.values()]
        .sort((a, b) => a.stock_length_inches - b.stock_length_inches)
        .map(entry => ({
          ...entry,
          waste_pct: entry.stock_count * entry.stock_length_inches > 0
            ? entry.offcut_inches / (entry.stock_count * entry.stock_length_inches) * 100 : 0,
        })),
      totals: { pieces: pieces.length, linear_inches_required: 0, stock_linear_inches_purchased: 0, stock_count: bins.length, offcut_inches: 0, waste_pct: 0 },
    };
    for (const bin of bins) {
      groupOut.totals.stock_linear_inches_purchased += bin.stock_length_inches;
      groupOut.totals.offcut_inches += bin.offcut_inches;
    }
    groupOut.totals.linear_inches_required = bar.lines
      .reduce((sum, line) => sum + line.cut_length_inches * line.quantity_total, 0);
    groupOut.totals.waste_pct = groupOut.totals.stock_linear_inches_purchased > 0
      ? groupOut.totals.offcut_inches / groupOut.totals.stock_linear_inches_purchased * 100 : 0;
    stock.groups.push(groupOut);
    stock.totals.total_linear_inches_required += groupOut.totals.linear_inches_required;
    stock.totals.stock_linear_inches_purchased += groupOut.totals.stock_linear_inches_purchased;
    stock.totals.stock_count_total += groupOut.totals.stock_count;
  }
  stock.totals.waste_inches = stock.totals.stock_linear_inches_purchased - stock.totals.total_linear_inches_required;
  stock.totals.waste_pct = stock.totals.stock_linear_inches_purchased > 0
    ? stock.totals.waste_inches / stock.totals.stock_linear_inches_purchased * 100 : 0;
  result.stock = stock.groups.length ? stock : null;
  result.status = infeasible ? "unresolved" : "resolved";
  return result;
}
