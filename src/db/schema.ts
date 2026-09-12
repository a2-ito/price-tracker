import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

const timestamp = (name: string) =>
	text(name)
		.notNull()
		.default(sql`(datetime('now'))`);

export const categories = sqliteTable("categories", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	name: text("name").notNull().unique(),
	createdAt: timestamp("created_at"),
});

/** 容量の単位。g/ml は 100 あたり、それ以外は 1 あたりの単価を表示する */
export const UNITS = ["g", "ml", "個", "枚", "本", "回"] as const;
export type Unit = (typeof UNITS)[number];

export const products = sqliteTable(
	"products",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		name: text("name").notNull(),
		categoryId: integer("category_id").references(() => categories.id, { onDelete: "set null" }),
		unit: text("unit", { enum: UNITS }).notNull().default("g"),
		imageKey: text("image_key"),
		memo: text("memo"),
		createdAt: timestamp("created_at"),
		updatedAt: timestamp("updated_at"),
	},
	(t) => [index("products_category_idx").on(t.categoryId)],
);

export const priceRecords = sqliteTable(
	"price_records",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		productId: integer("product_id")
			.notNull()
			.references(() => products.id, { onDelete: "cascade" }),
		store: text("store").notNull(),
		/** 税込価格（円） */
		price: integer("price").notNull(),
		/** 1 パックあたりの容量（unit 単位） */
		amount: real("amount").notNull(),
		/** パック数（まとめ売り対応） */
		quantity: integer("quantity").notNull().default(1),
		/** 記録日 YYYY-MM-DD */
		recordedAt: text("recorded_at").notNull(),
		/** 商品ページやチラシへのリンク（http/https のみ） */
		url: text("url"),
		memo: text("memo"),
		createdAt: timestamp("created_at"),
	},
	(t) => [index("price_records_product_idx").on(t.productId)],
);

export type Category = typeof categories.$inferSelect;
export type Product = typeof products.$inferSelect;
export type PriceRecord = typeof priceRecords.$inferSelect;
