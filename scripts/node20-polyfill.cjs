// Vitest 5's failure reporter uses Map.groupBy and Object.groupBy, which Node 20 lacks.
// Without this, a failing test crashes the reporter instead of printing the failure.
// A no-op on Node 21 and later.
if (typeof Map.groupBy !== "function") {
  Map.groupBy = function groupBy(items, callback) {
    const map = new Map();
    let index = 0;
    for (const item of items) {
      const key = callback(item, index++);
      const group = map.get(key);
      if (group) group.push(item);
      else map.set(key, [item]);
    }
    return map;
  };
}
if (typeof Object.groupBy !== "function") {
  Object.groupBy = function groupBy(items, callback) {
    const result = Object.create(null);
    let index = 0;
    for (const item of items) {
      const key = callback(item, index++);
      (result[key] ||= []).push(item);
    }
    return result;
  };
}
