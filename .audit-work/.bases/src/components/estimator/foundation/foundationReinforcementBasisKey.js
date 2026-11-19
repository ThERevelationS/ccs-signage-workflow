const MAX_DEPTH = 32;
const MAX_NODES = 1000000;
const MAX_CHARACTERS = 16000000;

// Exact local stale-result equality, not a hash, authorization, or a CAS token.
// The caller owns selecting raw inputs/context and removing derived metadata.
export function encodeFoundationReinforcementBasis(value) {
  const chunks = [], ancestors = new Set();
  let nodes = 0, characters = 0;
  const append = text => {
    characters += text.length;
    if (characters > MAX_CHARACTERS) throw new RangeError("Reinforcement preview basis is too large.");
    chunks.push(text);
  };
  const visit = (current, depth) => {
    if (depth > MAX_DEPTH || ++nodes > MAX_NODES) throw new RangeError("Reinforcement preview basis exceeds the supported traversal limit.");
    if (current === null) { append("null;"); return; }
    switch (typeof current) {
      case "undefined": append("undefined;"); return;
      case "boolean": append(current ? "boolean:true;" : "boolean:false;"); return;
      case "string": append(`string:${JSON.stringify(current)};`); return;
      case "number":
        if (!Number.isFinite(current)) throw new TypeError("Reinforcement preview basis contains a nonfinite number.");
        append(`number:${Object.is(current, -0) ? "-0" : current};`); return;
      case "object": break;
      default: throw new TypeError("Reinforcement preview basis contains an unsupported value.");
    }
    if (ancestors.has(current)) throw new TypeError("Reinforcement preview basis contains a cycle.");
    if (Object.getOwnPropertySymbols(current).length) throw new TypeError("Reinforcement preview basis cannot contain symbol keys.");
    const array = Array.isArray(current);
    if (!array && ![Object.prototype, null].includes(Object.getPrototypeOf(current))) {
      throw new TypeError("Reinforcement preview basis requires plain objects and arrays.");
    }
    const keys = Object.getOwnPropertyNames(current);
    const child = key => {
      const descriptor = Object.getOwnPropertyDescriptor(current, key);
      if (!descriptor || !Object.hasOwn(descriptor, "value") || !descriptor.enumerable) {
        throw new TypeError("Reinforcement preview basis cannot contain hidden properties or accessors.");
      }
      visit(descriptor.value, depth + 1);
    };
    ancestors.add(current);
    if (array) {
      if (keys.length !== current.length + 1 || !keys.includes("length")) {
        throw new TypeError("Reinforcement preview basis requires dense arrays without extra properties.");
      }
      append(`array:${current.length}[`);
      for (let index = 0; index < current.length; index++) child(String(index));
      append("];");
    } else {
      keys.sort();
      append(`object:${keys.length}{`);
      for (const key of keys) { append(`${JSON.stringify(key)}:`); child(key); }
      append("};");
    }
    ancestors.delete(current);
  };
  visit(value, 0);
  return chunks.join("");
}
