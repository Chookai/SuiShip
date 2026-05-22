type JsonObject = Record<string, unknown>;

export function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (value !== null && typeof value === "object") {
    return Object.keys(value as JsonObject)
      .sort()
      .reduce<JsonObject>((acc, key) => {
        acc[key] = sortKeysDeep((value as JsonObject)[key]);
        return acc;
      }, {});
  }
  return value;
}

export function canonicalJson(value: unknown): Buffer {
  return Buffer.from(JSON.stringify(sortKeysDeep(value)));
}
