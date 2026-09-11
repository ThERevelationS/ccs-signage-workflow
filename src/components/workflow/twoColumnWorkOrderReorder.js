const COLUMN_IDS = new Set(["work-order-left", "work-order-right"]);

export function splitTwoColumnWorkOrders(items = []) {
  const left = [];
  const right = [];
  for (let index = 0; index < items.length; index += 1) {
    (index % 2 === 0 ? left : right).push(items[index]);
  }
  return { left, right };
}

export function combineTwoColumnWorkOrders(left = [], right = []) {
  const combined = [];
  const rowCount = Math.max(left.length, right.length);
  for (let row = 0; row < rowCount; row += 1) {
    if (row < left.length) combined.push(left[row]);
    if (row < right.length) combined.push(right[row]);
  }
  return combined;
}

function logicalIndex(droppableId, columnIndex) {
  return columnIndex * 2 + (droppableId === "work-order-right" ? 1 : 0);
}

export function reorderTwoColumnWorkOrders(items = [], result = {}) {
  const source = result?.source;
  const destination = result?.destination;
  if (!destination) return items;
  if (!COLUMN_IDS.has(source?.droppableId) || !COLUMN_IDS.has(destination?.droppableId)) {
    throw new Error("The Work Order drag target could not be identified safely.");
  }
  if (!Number.isInteger(source.index) || source.index < 0 || !Number.isInteger(destination.index) || destination.index < 0) {
    throw new Error("The Work Order drag position could not be identified safely.");
  }

  const { left, right } = splitTwoColumnWorkOrders(items);
  const sourceColumn = source.droppableId === "work-order-left" ? left : right;
  const destinationColumn = destination.droppableId === "work-order-left" ? left : right;
  if (source.index >= sourceColumn.length) {
    throw new Error("The Work Order drag source changed before the reorder could be applied.");
  }
  const sameColumn = source.droppableId === destination.droppableId;
  const maxDestinationIndex = destinationColumn.length - (sameColumn ? 1 : 0);
  if (destination.index > maxDestinationIndex) {
    throw new Error("The Work Order drag destination changed before the reorder could be applied.");
  }
  if (sameColumn && source.index === destination.index) return items;

  const sourceIndex = logicalIndex(source.droppableId, source.index);
  const requestedDestinationIndex = logicalIndex(destination.droppableId, destination.index);
  const reordered = Array.from(items);
  const [moved] = reordered.splice(sourceIndex, 1);
  // A canonical row-major list cannot represent an orphan right-column cell.
  // Clamp that one edge case to the final valid priority position.
  const destinationIndex = Math.min(requestedDestinationIndex, reordered.length);
  reordered.splice(destinationIndex, 0, moved);

  if (reordered.length !== items.length || new Set(reordered.map((item) => item?.id)).size !== items.length) {
    throw new Error("The Work Order reorder changed list membership unexpectedly.");
  }
  if (reordered.every((item, index) => item?.id === items[index]?.id)) return items;
  return reordered;
}
