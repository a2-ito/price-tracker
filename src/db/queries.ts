import { asc, desc, eq, isNotNull, like, sql } from "drizzle-orm";
import type { Db } from "./index";
import { categories, priceRecords, products, type Category, type PriceRecord, type Product } from "./schema";

/** 単価（1 unit あたり）の SQL 式。price_records のカラムを参照する */
const unitCostExpr = sql<number>`${priceRecords.price} * 1.0 / ((SELECT p.amount * p.count FROM products p WHERE p.id = ${priceRecords.productId}) * ${priceRecords.quantity})`;

export type BestRecord = Pick<PriceRecord, "id" | "store" | "price" | "quantity" | "recordedAt">;
export type ProductListItem = Product & { categoryName: string | null; best: BestRecord | null };

export async function listCategories(db: Db): Promise<Category[]> {
	return db.select().from(categories).orderBy(asc(categories.name));
}

export async function listProducts(
	db: Db,
	filter: { categoryId?: number; query?: string } = {},
): Promise<ProductListItem[]> {
	// 商品ごとに単価最小（同率なら新しい記録）の 1 件を結合する
	const bestId = sql`(
		SELECT r.id FROM price_records r
		WHERE r.product_id = ${products.id}
		ORDER BY r.price * 1.0 / (${products.amount} * ${products.count} * r.quantity) ASC, r.recorded_at DESC, r.id DESC
		LIMIT 1
	)`;

	const conditions = [];
	if (filter.categoryId !== undefined) conditions.push(eq(products.categoryId, filter.categoryId));
	if (filter.query) conditions.push(like(products.name, `%${filter.query}%`));

	const rows = await db
		.select({
			product: products,
			categoryName: categories.name,
			bestId: priceRecords.id,
			bestStore: priceRecords.store,
			bestPrice: priceRecords.price,
			bestQuantity: priceRecords.quantity,
			bestRecordedAt: priceRecords.recordedAt,
		})
		.from(products)
		.leftJoin(categories, eq(categories.id, products.categoryId))
		.leftJoin(priceRecords, eq(priceRecords.id, bestId))
		.where(conditions.length > 0 ? sql.join(conditions, sql` AND `) : undefined)
		.orderBy(asc(categories.name), asc(products.name));

	return rows.map((r) => ({
		...r.product,
		categoryName: r.categoryName,
		best:
			r.bestId !== null && r.bestStore !== null && r.bestPrice !== null && r.bestQuantity !== null && r.bestRecordedAt !== null
				? { id: r.bestId, store: r.bestStore, price: r.bestPrice, quantity: r.bestQuantity, recordedAt: r.bestRecordedAt }
				: null,
	}));
}

export async function getProduct(db: Db, id: number): Promise<(Product & { categoryName: string | null }) | null> {
	const rows = await db
		.select({ product: products, categoryName: categories.name })
		.from(products)
		.leftJoin(categories, eq(categories.id, products.categoryId))
		.where(eq(products.id, id))
		.limit(1);
	const row = rows[0];
	return row ? { ...row.product, categoryName: row.categoryName } : null;
}

export async function listRecords(db: Db, productId: number): Promise<PriceRecord[]> {
	return db
		.select()
		.from(priceRecords)
		.where(eq(priceRecords.productId, productId))
		.orderBy(asc(unitCostExpr), desc(priceRecords.recordedAt));
}

export async function getRecord(db: Db, id: number): Promise<PriceRecord | null> {
	const rows = await db.select().from(priceRecords).where(eq(priceRecords.id, id)).limit(1);
	return rows[0] ?? null;
}

/** メーカー名のサジェスト用に既存の値を重複なしで返す */
export async function listMakers(db: Db): Promise<string[]> {
	const rows = await db
		.selectDistinct({ maker: products.maker })
		.from(products)
		.where(isNotNull(products.maker))
		.orderBy(asc(products.maker));
	return rows.map((r) => r.maker).filter((m): m is string => m !== null && m !== "");
}

/** 店舗名のサジェスト用に既存の店舗名を重複なしで返す */
export async function listStores(db: Db): Promise<string[]> {
	const rows = await db.selectDistinct({ store: priceRecords.store }).from(priceRecords).orderBy(asc(priceRecords.store));
	return rows.map((r) => r.store);
}
