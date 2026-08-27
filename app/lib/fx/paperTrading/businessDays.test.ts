import { describe, expect, it } from "vitest";
import { addBusinessDays } from "./businessDays";

describe("addBusinessDays", () => {
  it("平日始まりなら土日をスキップして加算する", () => {
    // 2026-08-17は月曜日
    const monday = Date.UTC(2026, 7, 17, 10, 0, 0);
    const result = addBusinessDays(monday, 5);
    // 月+5営業日 = 月火水木金の次の月曜日
    const expected = Date.UTC(2026, 7, 24, 10, 0, 0);
    expect(result).toBe(expected);
  });

  it("金曜始まりで1営業日後は月曜になる（土日をスキップ）", () => {
    // 2026-08-14は金曜日
    const friday = Date.UTC(2026, 7, 14, 10, 0, 0);
    const result = addBusinessDays(friday, 1);
    const expectedMonday = Date.UTC(2026, 7, 17, 10, 0, 0);
    expect(result).toBe(expectedMonday);
  });
});
