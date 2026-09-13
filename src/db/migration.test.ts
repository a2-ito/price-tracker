import { afterEach, describe, expect, it } from "vitest";
import { createTestEnvUpTo, type TestEnv } from "@/test/d1";

/**
 * 容量を価格記録から商品へ移す移行（0004, 0005）の検証。
 * 移行前のスキーマでデータを作り、移行を適用して結果を確かめる。
 */
let t: TestEnv;

afterEach(() => t?.dispose());

type Row = Record<string, unknown>;

async function query(sql: string): Promise<Row[]> {
	const result = await t.d1.prepare(sql).all();
	return result.results as Row[];
}

/** 移行前の状態を作る。price_records が容量を持っていた頃の形 */
async function seedBeforeMigration(
	products: { id: number; name: string; unit: string }[],
	records: { productId: number; store: string; price: number; amount: number; quantity?: number }[],
) {
	t = await createTestEnvUpTo("0003");
	for (const p of products) {
		await t.d1.prepare("INSERT INTO products (id, name, unit) VALUES (?, ?, ?)").bind(p.id, p.name, p.unit).run();
	}
	for (const r of records) {
		await t.d1
			.prepare("INSERT INTO price_records (product_id, store, price, amount, quantity, recorded_at) VALUES (?, ?, ?, ?, ?, '2026-09-12')")
			.bind(r.productId, r.store, r.price, r.amount, r.quantity ?? 1)
			.run();
	}
}

async function runMigration() {
	await t.applyMigration("0004");
	await t.applyMigration("0005");
}

describe("容量を商品へ移す移行", () => {
	it("荷姿が 1 種類の商品は、その容量がそのまま入り名前は変わらない", async () => {
		await seedBeforeMigration(
			[{ id: 1, name: "こくいも", unit: "ml" }],
			[
				{ productId: 1, store: "やまや", price: 1188, amount: 1800 },
				{ productId: 1, store: "イオン", price: 1250, amount: 1800 },
			],
		);
		await runMigration();

		const products = await query("SELECT name, amount FROM products");
		expect(products).toEqual([{ name: "こくいも", amount: 1800 }]);
		expect(await query("SELECT COUNT(*) AS n FROM price_records WHERE product_id = 1")).toEqual([{ n: 2 }]);
	});

	it("荷姿が複数ある商品は、荷姿ごとに分かれて名前に容量が付く", async () => {
		await seedBeforeMigration(
			[{ id: 1, name: "リステリン", unit: "ml" }],
			[
				{ productId: 1, store: "アオキ", price: 1078, amount: 1000 },
				{ productId: 1, store: "スギ薬局", price: 1097, amount: 1000 },
				{ productId: 1, store: "スギ薬局", price: 1840, amount: 2000 },
				{ productId: 1, store: "スギ薬局", price: 2728, amount: 3000 },
			],
		);
		await runMigration();

		const products = await query("SELECT name, amount FROM products ORDER BY amount");
		expect(products).toEqual([
			{ name: "リステリン 1000ml", amount: 1000 },
			{ name: "リステリン 2000ml", amount: 2000 },
			{ name: "リステリン 3000ml", amount: 3000 },
		]);
	});

	it("分割後、各記録は容量の合う商品に紐づく", async () => {
		await seedBeforeMigration(
			[{ id: 1, name: "クロレッツ", unit: "g" }],
			[
				{ productId: 1, store: "アオキ", price: 645, amount: 140 },
				{ productId: 1, store: "コストコ", price: 1580, amount: 420 },
			],
		);
		await runMigration();

		const rows = await query(
			"SELECT p.name, p.amount, r.store, r.price FROM price_records r JOIN products p ON p.id = r.product_id ORDER BY p.amount",
		);
		expect(rows).toEqual([
			{ name: "クロレッツ 140g", amount: 140, store: "アオキ", price: 645 },
			{ name: "クロレッツ 420g", amount: 420, store: "コストコ", price: 1580 },
		]);
	});

	it("記録の多い荷姿が元の商品に残る", async () => {
		await seedBeforeMigration(
			[{ id: 1, name: "金麦", unit: "ml" }],
			[
				{ productId: 1, store: "イオン", price: 833, amount: 2100 },
				{ productId: 1, store: "スギ薬局", price: 844, amount: 2100 },
				{ productId: 1, store: "アオキ", price: 856, amount: 2100 },
				{ productId: 1, store: "Amazon", price: 4055, amount: 8400 },
			],
		);
		await runMigration();

		// 記録が 3 件ある 2100ml が id=1 に残り、8400ml が新しい商品になる
		const rows = await query("SELECT id, name, amount FROM products ORDER BY id");
		expect(rows[0]).toMatchObject({ id: 1, amount: 2100 });
		expect(rows[1]).toMatchObject({ amount: 8400 });
		expect(await query("SELECT COUNT(*) AS n FROM price_records WHERE product_id = 1")).toEqual([{ n: 3 }]);
	});

	it("小数の容量も扱える", async () => {
		await seedBeforeMigration(
			[{ id: 1, name: "だし", unit: "g" }],
			[
				{ productId: 1, store: "A", price: 300, amount: 7.5 },
				{ productId: 1, store: "B", price: 500, amount: 15 },
			],
		);
		await runMigration();

		const names = (await query("SELECT name FROM products ORDER BY amount")).map((r) => r.name);
		expect(names).toEqual(["だし 7.5g", "だし 15g"]);
	});

	it("記録が 1 件も無い商品は既定値のまま残る", async () => {
		await seedBeforeMigration([{ id: 1, name: "未記録の商品", unit: "g" }], []);
		await runMigration();
		expect(await query("SELECT name, amount FROM products")).toEqual([{ name: "未記録の商品", amount: 1 }]);
	});

	it("複数の商品が混ざっていても互いに影響しない", async () => {
		await seedBeforeMigration(
			[
				{ id: 1, name: "商品A", unit: "ml" },
				{ id: 2, name: "商品B", unit: "g" },
			],
			[
				{ productId: 1, store: "X", price: 100, amount: 500 },
				{ productId: 1, store: "Y", price: 180, amount: 1000 },
				{ productId: 2, store: "X", price: 200, amount: 100 },
			],
		);
		await runMigration();

		const rows = await query(
			"SELECT p.name, p.amount, COUNT(r.id) AS records FROM products p LEFT JOIN price_records r ON r.product_id = p.id GROUP BY p.id ORDER BY p.id",
		);
		expect(rows).toEqual([
			{ name: "商品A 500ml", amount: 500, records: 1 },
			{ name: "商品B", amount: 100, records: 1 },
			{ name: "商品A 1000ml", amount: 1000, records: 1 },
		]);
	});
});
