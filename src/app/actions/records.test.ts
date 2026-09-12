import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { revalidated } from "@/test/action-mocks";
import { createTestEnv, formData, type TestEnv } from "@/test/d1";
import { listRecords } from "@/db/queries";
import { isForeignKeyViolation } from "@/lib/errors";
import { priceRecords, products } from "@/db/schema";

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
const { createRecord, deleteRecord } = await import("./records");

beforeAll(async () => {
	t = await createTestEnv();
});
afterAll(() => t.dispose());
beforeEach(async () => {
	await t.truncate();
	await t.db.insert(products).values({ name: "豆乳", unit: "ml" });
	revalidated.length = 0;
});

const valid = { productId: 1, store: "OKストア", price: 198, amount: 1000, quantity: 1, recordedAt: "2026-09-12" };

describe("createRecord", () => {
	it("記録して成功メッセージを返す", async () => {
		const state = await createRecord({}, formData({ ...valid, memo: "セール" }));
		expect(state).toEqual({ success: "価格を記録しました" });
		expect(await listRecords(t.db, 1)).toMatchObject([{ store: "OKストア", price: 198, amount: 1000, quantity: 1, memo: "セール" }]);
		expect(revalidated).toEqual(expect.arrayContaining(["/", "/products/1"]));
	});

	it("個数を省略すると 1", async () => {
		await createRecord({}, formData({ ...valid, quantity: undefined }));
		expect((await listRecords(t.db, 1))[0].quantity).toBe(1);
	});

	it("小数の容量を受け付ける", async () => {
		await createRecord({}, formData({ ...valid, amount: "1.5" }));
		expect((await listRecords(t.db, 1))[0].amount).toBe(1.5);
	});

	it.each([
		["店舗が空", { store: "" }, /店舗名を入力/],
		["価格が 0", { price: 0 }, /1 円以上/],
		["価格が小数", { price: "19.8" }, /整数/],
		["容量が 0", { amount: 0 }, /0 より大きい/],
		["日付形式が不正", { recordedAt: "2026/09/12" }, /日付の形式/],
		["個数が 0", { quantity: 0 }, /^quantity:/],
	])("%s なら検証エラー", async (_label, patch, pattern) => {
		const state = await createRecord({}, formData({ ...valid, ...patch }));
		expect(state.error).toMatch(pattern);
		expect(await listRecords(t.db, 1)).toEqual([]);
	});

	it("存在しない商品への記録は外部キー制約で失敗する", async () => {
		await expect(createRecord({}, formData({ ...valid, productId: 999 }))).rejects.toSatisfy(isForeignKeyViolation);
	});
});

describe("deleteRecord", () => {
	it("指定の記録だけ削除する", async () => {
		await t.db.insert(priceRecords).values([
			{ productId: 1, store: "A", price: 100, amount: 100, quantity: 1, recordedAt: "2026-09-01" },
			{ productId: 1, store: "B", price: 200, amount: 100, quantity: 1, recordedAt: "2026-09-02" },
		]);
		await deleteRecord(formData({ id: 1, productId: 1 }));
		expect((await listRecords(t.db, 1)).map((r) => r.store)).toEqual(["B"]);
		expect(revalidated).toContain("/products/1");
	});
	it("id が無ければ例外", async () => {
		await expect(deleteRecord(formData({ productId: 1 }))).rejects.toThrow(/^id:/);
	});
});
