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

export function reorderTwoColumnWorkOrders(items = [], result = {}) {
  const source = result?.source;
  const destination = result?.destination;
  if (!destination) return items;
  if (!COLUMN_IDS.has(source?.droppableId) || !COLUMN_IDS.has(destination?.droppableId)) {
    throw new Error("The Work Order drag target could not be identified safely.");
  }
  if (source.droppableId === destination.droppableId && source.index === destination.index) {
    return items;
  }

  const { left, right } = splitTwoColumnWorkOrders(items);
  const columns = {
    "work-order-left": left,
    "work-order-right": right,
  };
  const sourceColumn = columns[source.droppableId];
  const destinationColumn = columns[destination.droppableId];

  if (!Number.isInteger(source.index) || source.index < 0 || source.index >= sourceColumn.length) {
    throw new Error("The Work Order drag source changed before the reorder could be applied.");
  }
  if (!Number.isInteger(destination.index) || destination.index < 0 || destination.index > destinationColumn.length) {
    throw new Error("The Work Order drag destination changed before the reorder could be applied.");
  }

  const [moved] = sourceColumn.splice(source.index, 1);
  destinationColumn.splice(destination.index, 0, moved);
  const reordered = combineTwoColumnWorkOrders(left, right);

  if (reordered.length !== items.length || new Set(reordered.map((item) => item?.id)).size !== items.length) {
    throw new Error("The Work Order reorder changed list membership unexpectedly.");
  }
  return reordered;
}
