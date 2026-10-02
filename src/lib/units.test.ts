import { describe, expect, test } from "bun:test";

import {
  areUnitsConvertible,
  convertUnit,
  convertUnitExact,
  findUnitGroup,
  getConvertibleUnits,
  isConversionPrecisionLossy,
  roundUnitAmount,
} from "./units";

describe("findUnitGroup", () => {
  test("volume units resolve to the volume group", () => {
    expect(findUnitGroup("mL")?.id).toBe("volume");
    expect(findUnitGroup("L")?.id).toBe("volume");
  });

  test("weight units resolve to the weight group", () => {
    expect(findUnitGroup("g")?.id).toBe("weight");
    expect(findUnitGroup("kg")?.id).toBe("weight");
  });

  test("count-based and unknown/custom units have no group", () => {
    expect(findUnitGroup("個")).toBeUndefined();
    expect(findUnitGroup("本")).toBeUndefined();
    expect(findUnitGroup("袋")).toBeUndefined();
    expect(findUnitGroup("パック")).toBeUndefined(); // custom unit example
  });
});

describe("areUnitsConvertible", () => {
  test("same unit is always convertible", () => {
    expect(areUnitsConvertible("mL", "mL")).toBe(true);
    expect(areUnitsConvertible("個", "個")).toBe(true);
  });

  test("units within the same group are convertible", () => {
    expect(areUnitsConvertible("mL", "L")).toBe(true);
    expect(areUnitsConvertible("L", "mL")).toBe(true);
    expect(areUnitsConvertible("g", "kg")).toBe(true);
    expect(areUnitsConvertible("kg", "g")).toBe(true);
  });

  test("units across different groups are not convertible", () => {
    expect(areUnitsConvertible("mL", "g")).toBe(false);
    expect(areUnitsConvertible("L", "kg")).toBe(false);
  });

  test("units with no group are not convertible to anything else", () => {
    expect(areUnitsConvertible("個", "枚")).toBe(false);
    expect(areUnitsConvertible("個", "mL")).toBe(false);
  });
});

describe("convertUnit", () => {
  test("mL -> L", () => {
    expect(convertUnit(500, "mL", "L")).toBe(0.5);
    expect(convertUnit(1000, "mL", "L")).toBe(1);
  });

  test("L -> mL", () => {
    expect(convertUnit(0.5, "L", "mL")).toBe(500);
    expect(convertUnit(1.5, "L", "mL")).toBe(1500);
  });

  test("g -> kg", () => {
    expect(convertUnit(1500, "g", "kg")).toBe(1.5);
  });

  test("kg -> g", () => {
    expect(convertUnit(1.5, "kg", "g")).toBe(1500);
  });

  test("round-trips back to the original value", () => {
    const original = 350;
    const toL = convertUnit(original, "mL", "L");
    expect(toL).not.toBeNull();
    const back = convertUnit(toL!, "L", "mL");
    expect(back).toBe(original);
  });

  test("same-unit conversion is a no-op (still rounded)", () => {
    expect(convertUnit(123.456, "mL", "mL")).toBe(123.46);
  });

  test("zero converts to zero", () => {
    expect(convertUnit(0, "mL", "L")).toBe(0);
    expect(convertUnit(0, "g", "kg")).toBe(0);
  });

  test("non-convertible pairs (different groups) return null", () => {
    expect(convertUnit(500, "mL", "g")).toBeNull();
    expect(convertUnit(1, "kg", "L")).toBeNull();
  });

  test("units with no group return null unless identical", () => {
    expect(convertUnit(1, "個", "本")).toBeNull();
    expect(convertUnit(1, "個", "mL")).toBeNull();
    expect(convertUnit(3, "個", "個")).toBe(3);
  });

  test("avoids floating point noise (0.1 + 0.2 style errors)", () => {
    // 333 mL -> L would be 0.333 without rounding; conversions are rounded
    // to 2 decimal places to match the DB's numeric(12,2) precision.
    expect(convertUnit(333, "mL", "L")).toBe(0.33);
  });
});

describe("getConvertibleUnits", () => {
  test("volume unit returns all volume units", () => {
    expect(getConvertibleUnits("mL").sort()).toEqual(["L", "mL"].sort());
    expect(getConvertibleUnits("L").sort()).toEqual(["L", "mL"].sort());
  });

  test("weight unit returns all weight units", () => {
    expect(getConvertibleUnits("g").sort()).toEqual(["g", "kg"].sort());
    expect(getConvertibleUnits("kg").sort()).toEqual(["g", "kg"].sort());
  });

  test("ungrouped unit returns only itself", () => {
    expect(getConvertibleUnits("個")).toEqual(["個"]);
    expect(getConvertibleUnits("パック")).toEqual(["パック"]);
  });
});

describe("roundUnitAmount", () => {
  test("rounds to 2 decimal places", () => {
    expect(roundUnitAmount(1.005)).toBeCloseTo(1, 2);
    expect(roundUnitAmount(1.234)).toBe(1.23);
    expect(roundUnitAmount(1.235)).toBe(1.24);
  });

  test("integers are unaffected", () => {
    expect(roundUnitAmount(5)).toBe(5);
    expect(roundUnitAmount(0)).toBe(0);
  });
});

describe("convertUnitExact", () => {
  test("丸めずに換算する", () => {
    expect(convertUnitExact(15, "mL", "L")).toBeCloseTo(0.015, 10);
  });

  test("同一単位はそのまま、換算不能は null", () => {
    expect(convertUnitExact(1.234, "L", "L")).toBe(1.234);
    expect(convertUnitExact(1, "mL", "g")).toBeNull();
  });
});

describe("isConversionPrecisionLossy (#1143)", () => {
  test("小さい量を大きい単位に換算すると丸めで大きくずれる場合は true", () => {
    expect(isConversionPrecisionLossy(15, "mL", "L")).toBe(true); // 0.015 → 0.02 (+33%)
    expect(isConversionPrecisionLossy(5, "g", "kg")).toBe(true); // 0.005 → 0.01
    expect(isConversionPrecisionLossy(3, "mL", "L")).toBe(true); // 0.003 → 0
  });

  test("2桁で表せる、または誤差が小さい場合は false", () => {
    expect(isConversionPrecisionLossy(350, "mL", "L")).toBe(false); // 0.35
    expect(isConversionPrecisionLossy(1234, "mL", "L")).toBe(false); // 1.234 → 1.23 (-0.3%)
    expect(isConversionPrecisionLossy(1, "L", "mL")).toBe(false);
  });

  test("同一単位・換算不能・0以下は false", () => {
    expect(isConversionPrecisionLossy(1, "L", "L")).toBe(false);
    expect(isConversionPrecisionLossy(1, "mL", "g")).toBe(false);
    expect(isConversionPrecisionLossy(0, "mL", "L")).toBe(false);
  });
});
