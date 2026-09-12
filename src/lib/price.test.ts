import { describe, expect, it } from "vitest";
import { formatAmount, formatYen, unitBase, unitBaseLabel, unitPrice } from "./price";

describe("unitBase / unitBaseLabel", () => {
	it("g と ml は 100 あたり、それ以外は 1 あたり", () => {
		expect(unitBase("g")).toBe(100);
		expect(unitBase("ml")).toBe(100);
		expect(unitBase("個")).toBe(1);
		expect(unitBase("枚")).toBe(1);
		expect(unitBaseLabel("g")).toBe("100g");
		expect(unitBaseLabel("個")).toBe("1個");
	});
});

describe("unitPrice", () => {
	it("100g あたりの単価を計算する", () => {
		expect(unitPrice(198, 1000, 1, "ml")).toBeCloseTo(19.8);
	});
	it("まとめ売りは個数で割る", () => {
		expect(unitPrice(548, 1000, 3, "ml")).toBeCloseTo(18.2666, 3);
	});
	it("個数単位は 1 個あたり", () => {
		expect(unitPrice(258, 10, 1, "個")).toBeCloseTo(25.8);
	});
	it("容量が 0 以下なら NaN", () => {
		expect(unitPrice(100, 0, 1, "g")).toBeNaN();
		expect(unitPrice(100, 100, 0, "g")).toBeNaN();
	});
});

describe("formatYen", () => {
	it("小数 1 桁と桁区切りで整形する", () => {
		expect(formatYen(18.2666)).toBe("¥18.3");
		expect(formatYen(1234.5)).toBe("¥1,234.5");
	});
	it("桁数を指定できる", () => {
		expect(formatYen(198, 0)).toBe("¥198");
		expect(formatYen(19.96, 0)).toBe("¥20");
	});
	it("NaN / Infinity はハイフン", () => {
		expect(formatYen(Number.NaN)).toBe("-");
		expect(formatYen(Number.POSITIVE_INFINITY)).toBe("-");
	});
});

describe("formatAmount", () => {
	it("単品は容量のみ", () => {
		expect(formatAmount(1000, 1, "ml")).toBe("1,000ml");
	});
	it("複数個は × 個数を付ける", () => {
		expect(formatAmount(1000, 3, "ml")).toBe("1,000ml × 3");
	});
	it("小数の容量も表示できる", () => {
		expect(formatAmount(1.5, 1, "g")).toBe("1.5g");
	});
});
