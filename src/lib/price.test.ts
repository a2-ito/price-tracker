import { describe, expect, it } from "vitest";
import { formatAmount, formatPackage, formatYen, packageAmount, unitBase, unitBaseLabel, unitPrice } from "./price";

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
	it("100ml あたりの単価を計算する", () => {
		expect(unitPrice({ price: 198, amount: 1000, unit: "ml" })).toBeCloseTo(19.8);
	});
	it("まとめ買いは購入数で割る", () => {
		expect(unitPrice({ price: 548, amount: 1000, quantity: 3, unit: "ml" })).toBeCloseTo(18.2666, 3);
	});
	it("入数のあるパッケージは合計容量で割る", () => {
		// 350ml × 6 本 = 2,100ml を 833 円
		expect(unitPrice({ price: 833, amount: 350, count: 6, unit: "ml" })).toBeCloseTo(39.667, 2);
	});
	it("入数とまとめ買いの両方を掛ける", () => {
		// 350ml × 6 本を 2 パッケージ = 4,200ml
		expect(unitPrice({ price: 1666, amount: 350, count: 6, quantity: 2, unit: "ml" })).toBeCloseTo(39.667, 2);
	});
	it("個数単位は 1 個あたり", () => {
		expect(unitPrice({ price: 258, amount: 10, unit: "個" })).toBeCloseTo(25.8);
	});
	it("容量や個数が 0 以下なら NaN", () => {
		expect(unitPrice({ price: 100, amount: 0, unit: "g" })).toBeNaN();
		expect(unitPrice({ price: 100, amount: 100, quantity: 0, unit: "g" })).toBeNaN();
		expect(unitPrice({ price: 100, amount: 100, count: 0, unit: "g" })).toBeNaN();
	});
});

describe("formatPackage", () => {
	it("入数が 1 でも個数を示す", () => {
		expect(formatPackage(1000, 1, "ml")).toBe("1,000ml × 1");
	});
	it("入数が 2 以上なら合計も添える", () => {
		expect(formatPackage(350, 6, "ml")).toBe("350ml × 6 = 2,100ml");
	});
	it("小数の容量も扱える", () => {
		expect(formatPackage(7.5, 4, "g")).toBe("7.5g × 4 = 30g");
	});
	it("容量の単位が個数系でも読める", () => {
		expect(formatPackage(10, 1, "個")).toBe("10個 × 1");
		expect(formatPackage(10, 3, "個")).toBe("10個 × 3 = 30個");
	});
	it("入数が 0 以下でも 1 として扱う", () => {
		expect(formatPackage(100, 0, "g")).toBe("100g × 1");
	});
});

describe("packageAmount", () => {
	it("1 個あたりの容量に入数を掛ける", () => {
		expect(packageAmount(350, 6)).toBe(2100);
		expect(packageAmount(1000, 1)).toBe(1000);
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
