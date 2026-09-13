import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestEnv, type TestEnv } from "@/test/d1";
import { getProduct, getRecord, listCategories, listMakers, listProducts, listRecords, listStores } from "./queries";
import { categories, priceRecords, products } from "./schema";

let t: TestEnv;

beforeAll(async () => {
	t = await createTestEnv();
});
afterAll(() => t.dispose());
beforeEach(() => t.truncate());

async function seed() {
	await t.db.insert(categories).values([{ name: "飲料" }, { name: "乳製品" }]);
	await t.db.insert(products).values([
		{ name: "無調整豆乳", categoryId: 1, unit: "ml", amount: 1000 },
		{ name: "卵", categoryId: 2, unit: "個", amount: 10 },
		{ name: "未分類の何か", unit: "g", amount: 100 },
	]);
	await t.db.insert(priceRecords).values([
		{ productId: 1, store: "OKストア", price: 198, quantity: 1, recordedAt: "2026-09-10" },
		{ productId: 1, store: "業務スーパー", price: 548, quantity: 3, recordedAt: "2026-09-11" },
		{ productId: 1, store: "コンビニ", price: 248, quantity: 1, recordedAt: "2026-09-12" },
		{ productId: 2, store: "ライフ", price: 258, quantity: 1, recordedAt: "2026-09-12" },
	]);
}

describe("listCategories", () => {
	it("名前順で返す", async () => {
		await seed();
		expect((await listCategories(t.db)).map((c) => c.name)).toEqual(["乳製品", "飲料"]);
	});
});

describe("listProducts", () => {
	it("商品ごとに単価最小の記録を best として返す", async () => {
		await seed();
		const items = await listProducts(t.db);
		const soy = items.find((i) => i.name === "無調整豆乳")!;
		expect(soy.categoryName).toBe("飲料");
		// 548 / 3000 = 0.1827 < 198 / 1000 = 0.198
		expect(soy.best).toMatchObject({ store: "業務スーパー", price: 548, quantity: 3 });
	});

	it("記録の無い商品は best が null", async () => {
		await seed();
		const items = await listProducts(t.db);
		const none = items.find((i) => i.name === "未分類の何か")!;
		expect(none.best).toBeNull();
		expect(none.categoryName).toBeNull();
	});

	it("単価が同率なら新しい記録を優先する", async () => {
		await t.db.insert(products).values({ name: "同率", unit: "g", amount: 100 });
		await t.db.insert(priceRecords).values([
			{ productId: 1, store: "古い店", price: 100, quantity: 1, recordedAt: "2026-01-01" },
			{ productId: 1, store: "新しい店", price: 200, quantity: 2, recordedAt: "2026-06-01" },
		]);
		const [item] = await listProducts(t.db);
		expect(item.best?.store).toBe("新しい店");
	});

	it("カテゴリで絞り込める", async () => {
		await seed();
		const items = await listProducts(t.db, { categoryId: 2 });
		expect(items.map((i) => i.name)).toEqual(["卵"]);
	});

	it("商品名の部分一致で検索できる", async () => {
		await seed();
		expect((await listProducts(t.db, { query: "豆乳" })).map((i) => i.name)).toEqual(["無調整豆乳"]);
		expect(await listProducts(t.db, { query: "存在しない" })).toEqual([]);
	});

	it("カテゴリと検索を同時に指定できる", async () => {
		await seed();
		expect(await listProducts(t.db, { categoryId: 1, query: "卵" })).toEqual([]);
		expect((await listProducts(t.db, { categoryId: 1, query: "豆" })).length).toBe(1);
	});

	it("空の DB では空配列", async () => {
		expect(await listProducts(t.db)).toEqual([]);
	});
});

describe("getProduct", () => {
	it("カテゴリ名付きで返し、無ければ null", async () => {
		await seed();
		expect(await getProduct(t.db, 1)).toMatchObject({ name: "無調整豆乳", categoryName: "飲料", unit: "ml" });
		expect(await getProduct(t.db, 3)).toMatchObject({ categoryName: null });
		expect(await getProduct(t.db, 999)).toBeNull();
	});
});

describe("listRecords", () => {
	it("単価の安い順に返す", async () => {
		await seed();
		const rows = await listRecords(t.db, 1);
		expect(rows.map((r) => r.store)).toEqual(["業務スーパー", "OKストア", "コンビニ"]);
	});
	it("他商品の記録は含まない", async () => {
		await seed();
		expect((await listRecords(t.db, 2)).map((r) => r.store)).toEqual(["ライフ"]);
	});
});

describe("getRecord", () => {
	it("ID で 1 件取得、無ければ null", async () => {
		await seed();
		expect(await getRecord(t.db, 1)).toMatchObject({ store: "OKストア" });
		expect(await getRecord(t.db, 999)).toBeNull();
	});
});

describe("listStores", () => {
	it("重複なし・名前順", async () => {
		await seed();
		await t.db.insert(priceRecords).values({ productId: 2, store: "OKストア", price: 300, quantity: 1, recordedAt: "2026-09-12" });
		// SQLite の既定照合は UTF-8 のバイト順（ASCII → カタカナ → 漢字）
		expect(await listStores(t.db)).toEqual(["OKストア", "コンビニ", "ライフ", "業務スーパー"]);
		expect(new Set(await listStores(t.db)).size).toBe(4);
	});
});

describe("listMakers", () => {
	it("重複なしで返し、未設定は含めない", async () => {
		await t.db.insert(products).values([
			{ name: "a", unit: "g", amount: 100, maker: "Kikkoman" },
			{ name: "b", unit: "g", amount: 100, maker: "Kikkoman" },
			{ name: "c", unit: "g", amount: 100, maker: "Ajinomoto" },
			{ name: "d", unit: "g", amount: 100 },
		]);
		expect(await listMakers(t.db)).toEqual(["Ajinomoto", "Kikkoman"]);
	});

	it("1 件も無ければ空", async () => {
		expect(await listMakers(t.db)).toEqual([]);
	});
});

describe("外部キー制約", () => {
	it("商品削除で価格記録も消える（CASCADE）", async () => {
		await seed();
		await t.db.delete(products).where(eq(products.id, 1));
		expect(await listRecords(t.db, 1)).toEqual([]);
	});
	it("カテゴリ削除で商品は未分類になる（SET NULL）", async () => {
		await seed();
		await t.db.delete(categories).where(eq(categories.id, 1));
		expect((await getProduct(t.db, 1))?.categoryId).toBeNull();
	});
});
