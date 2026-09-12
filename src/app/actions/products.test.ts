import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { expectRedirect, revalidated } from "@/test/action-mocks";
import { createTestEnv, fakeImage, formData, type TestEnv } from "@/test/d1";
import { getProduct, listRecords } from "@/db/queries";
import { categories, priceRecords, products } from "@/db/schema";

let t: TestEnv;
vi.mock("@/lib/auth", async () => ({ requireUser: async () => (await import("@/test/action-mocks")).fakeUser }));
vi.mock("@/lib/cloudflare", () => ({ getEnv: () => Promise.resolve(t.env) }));
vi.mock("next/cache", async () => {
	const { revalidated } = await import("@/test/action-mocks");
	return { revalidatePath: (p: string) => void revalidated.push(p) };
});
vi.mock("next/navigation", async () => {
	const { RedirectSignal } = await import("@/test/action-mocks");
	return { redirect: (to: string) => { throw new RedirectSignal(to); } };
});
const { createProduct, deleteProduct, updateProduct } = await import("./products");

beforeAll(async () => {
	t = await createTestEnv();
});
afterAll(() => t.dispose());
beforeEach(async () => {
	await t.truncate();
	revalidated.length = 0;
});

async function r2Keys(): Promise<string[]> {
	return (await t.bucket.list()).objects.map((o) => o.key);
}

describe("createProduct", () => {
	it("登録して詳細ページへリダイレクトする", async () => {
		await t.db.insert(categories).values({ name: "飲料" });
		const to = await expectRedirect(() =>
			createProduct({}, formData({ name: "無調整豆乳", categoryId: 1, unit: "ml", memo: "  成分無調整  " })),
		);
		expect(to).toBe("/products/1");
		expect(await getProduct(t.db, 1)).toMatchObject({ name: "無調整豆乳", categoryId: 1, unit: "ml", memo: "成分無調整", imageKey: null });
		expect(revalidated).toContain("/");
	});

	it("カテゴリ未選択・メモ空は null で保存", async () => {
		await expectRedirect(() => createProduct({}, formData({ name: "卵", categoryId: "", unit: "個", memo: "" })));
		expect(await getProduct(t.db, 1)).toMatchObject({ categoryId: null, memo: null });
	});

	it("画像があれば R2 に保存してキーを持つ", async () => {
		await expectRedirect(() => createProduct({}, formData({ name: "卵", unit: "個", image: fakeImage("image/webp", 50, "a.webp") })));
		const p = await getProduct(t.db, 1);
		expect(p?.imageKey).toMatch(/^products\/.+\.webp$/);
		expect(await r2Keys()).toEqual([p!.imageKey]);
	});

	it("空のファイル入力（未選択）は画像なし扱い", async () => {
		await expectRedirect(() => createProduct({}, formData({ name: "卵", unit: "個", image: new File([], "", { type: "application/octet-stream" }) })));
		expect((await getProduct(t.db, 1))?.imageKey).toBeNull();
	});

	it("不正な単位は検証エラーで DB に触らない", async () => {
		const state = await createProduct({}, formData({ name: "卵", unit: "kg" }));
		expect(state.error).toMatch(/^unit:/);
		expect(await t.db.select().from(products)).toEqual([]);
	});

	it("商品名が空なら検証エラー", async () => {
		const state = await createProduct({}, formData({ name: "", unit: "g" }));
		expect(state.error).toMatch(/商品名を入力/);
	});

	it("画像形式が不正ならエラーを返し、商品は作らない", async () => {
		const state = await createProduct({}, formData({ name: "卵", unit: "個", image: fakeImage("text/plain", 10, "x.txt") }));
		expect(state.error).toMatch(/対応していない画像形式/);
		expect(await t.db.select().from(products)).toEqual([]);
		expect(await r2Keys()).toEqual([]);
	});
});

describe("updateProduct", () => {
	it("項目を更新して詳細へ戻る", async () => {
		await t.db.insert(categories).values([{ name: "A" }, { name: "B" }]);
		await t.db.insert(products).values({ name: "旧", categoryId: 1, unit: "g" });
		const to = await expectRedirect(() => updateProduct({}, formData({ id: 1, name: "新", categoryId: 2, unit: "ml", memo: "m" })));
		expect(to).toBe("/products/1");
		expect(await getProduct(t.db, 1)).toMatchObject({ name: "新", categoryId: 2, unit: "ml", memo: "m" });
		expect(revalidated).toEqual(expect.arrayContaining(["/", "/products/1"]));
	});

	it("新しい画像を付けると旧画像は R2 から消える", async () => {
		await t.bucket.put("products/old.jpg", new Uint8Array(3));
		await t.db.insert(products).values({ name: "p", unit: "g", imageKey: "products/old.jpg" });
		await expectRedirect(() => updateProduct({}, formData({ id: 1, name: "p", unit: "g", image: fakeImage() })));
		const p = await getProduct(t.db, 1);
		expect(p?.imageKey).not.toBe("products/old.jpg");
		expect(await r2Keys()).toEqual([p!.imageKey]);
	});

	it("removeImage を付けると画像を消して null にする", async () => {
		await t.bucket.put("products/old.jpg", new Uint8Array(3));
		await t.db.insert(products).values({ name: "p", unit: "g", imageKey: "products/old.jpg" });
		await expectRedirect(() => updateProduct({}, formData({ id: 1, name: "p", unit: "g", removeImage: "on" })));
		expect((await getProduct(t.db, 1))?.imageKey).toBeNull();
		expect(await r2Keys()).toEqual([]);
	});

	it("画像を変更しなければ既存キーを保持する", async () => {
		await t.db.insert(products).values({ name: "p", unit: "g", imageKey: "products/keep.jpg" });
		await expectRedirect(() => updateProduct({}, formData({ id: 1, name: "p2", unit: "g" })));
		expect((await getProduct(t.db, 1))?.imageKey).toBe("products/keep.jpg");
	});

	it("存在しない商品はエラー", async () => {
		const state = await updateProduct({}, formData({ id: 999, name: "p", unit: "g" }));
		expect(state).toEqual({ error: "商品が見つかりません" });
	});
});

describe("deleteProduct", () => {
	it("商品・価格記録・画像をまとめて削除し一覧へ戻る", async () => {
		await t.bucket.put("products/x.jpg", new Uint8Array(3));
		await t.db.insert(products).values({ name: "p", unit: "g", imageKey: "products/x.jpg" });
		await t.db.insert(priceRecords).values({ productId: 1, store: "s", price: 100, amount: 100, quantity: 1, recordedAt: "2026-09-12" });

		const to = await expectRedirect(() => deleteProduct(formData({ id: 1 })));
		expect(to).toBe("/");
		expect(await getProduct(t.db, 1)).toBeNull();
		expect(await listRecords(t.db, 1)).toEqual([]);
		expect(await r2Keys()).toEqual([]);
	});

	it("紐づく価格記録の写真も R2 から消える", async () => {
		await t.bucket.put("products/product.jpg", new Uint8Array(3));
		await t.bucket.put("products/record-a.jpg", new Uint8Array(3));
		await t.bucket.put("products/record-b.jpg", new Uint8Array(3));
		await t.db.insert(products).values({ name: "p", unit: "g", imageKey: "products/product.jpg" });
		await t.db.insert(priceRecords).values([
			{ productId: 1, store: "a", price: 100, amount: 100, quantity: 1, recordedAt: "2026-09-12", imageKey: "products/record-a.jpg" },
			{ productId: 1, store: "b", price: 200, amount: 100, quantity: 1, recordedAt: "2026-09-12", imageKey: "products/record-b.jpg" },
			{ productId: 1, store: "c", price: 300, amount: 100, quantity: 1, recordedAt: "2026-09-12" },
		]);

		await expectRedirect(() => deleteProduct(formData({ id: 1 })));
		expect(await r2Keys()).toEqual([]);
	});

	it("存在しない商品でもエラーにならず一覧へ戻る", async () => {
		expect(await expectRedirect(() => deleteProduct(formData({ id: 42 })))).toBe("/");
	});
});
