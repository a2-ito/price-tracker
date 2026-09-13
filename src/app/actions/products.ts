"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db";
import { priceRecords, products, UNITS } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { idFromForm, optionalIdFromForm, optionalText, parseForm, type ActionState } from "@/lib/form";
import { releaseImage } from "@/lib/image-cleanup";
import { storeImage } from "@/lib/images";

const productSchema = z.object({
	name: z.string().trim().min(1, "商品名を入力してください").max(100),
	maker: optionalText,
	categoryId: optionalIdFromForm,
	unit: z.enum(UNITS),
	amount: z.coerce.number().positive("容量は 0 より大きい値で入力してください"),
	count: z.coerce.number().int("入数は整数で入力してください").positive("入数は 1 以上で入力してください").default(1),
	memo: optionalText,
});

function imageFile(formData: FormData): File | null {
	const value = formData.get("image");
	return value instanceof File ? value : null;
}

export async function createProduct(_prev: ActionState, formData: FormData): Promise<ActionState> {
	await requireUser();
	const parsed = parseForm(productSchema, formData);
	if (!parsed.ok) return { error: parsed.error };

	let imageKey: string | null = null;
	try {
		imageKey = await storeImage(imageFile(formData));
	} catch (e) {
		return { error: e instanceof Error ? e.message : "画像の保存に失敗しました" };
	}

	const db = await getDb();
	const inserted = await db
		.insert(products)
		.values({
			name: parsed.data.name,
			maker: parsed.data.maker ?? null,
			categoryId: parsed.data.categoryId ?? null,
			unit: parsed.data.unit,
			amount: parsed.data.amount,
			count: parsed.data.count,
			memo: parsed.data.memo ?? null,
			imageKey,
		})
		.returning({ id: products.id });

	const id = inserted[0]?.id;
	if (id === undefined) return { error: "商品の登録に失敗しました" };

	revalidatePath("/");
	redirect(`/products/${id}`);
}

export async function updateProduct(_prev: ActionState, formData: FormData): Promise<ActionState> {
	await requireUser();
	const parsed = parseForm(productSchema.extend({ id: idFromForm, removeImage: z.string().optional() }), formData);
	if (!parsed.ok) return { error: parsed.error };

	const db = await getDb();
	const current = (await db.select().from(products).where(eq(products.id, parsed.data.id)).limit(1))[0];
	if (!current) return { error: "商品が見つかりません" };

	let imageKey = current.imageKey;
	try {
		const newKey = await storeImage(imageFile(formData));
		if (newKey) imageKey = newKey;
		else if (parsed.data.removeImage === "on") imageKey = null;
	} catch (e) {
		return { error: e instanceof Error ? e.message : "画像の保存に失敗しました" };
	}

	await db
		.update(products)
		.set({
			name: parsed.data.name,
			maker: parsed.data.maker ?? null,
			categoryId: parsed.data.categoryId ?? null,
			unit: parsed.data.unit,
			amount: parsed.data.amount,
			count: parsed.data.count,
			memo: parsed.data.memo ?? null,
			imageKey,
			updatedAt: new Date().toISOString().replace("T", " ").slice(0, 19),
		})
		.where(eq(products.id, parsed.data.id));

	// 参照が切れたことを確かめてから消すため、DB を更新したあとに片付ける
	if (imageKey !== current.imageKey) await releaseImage(db, current.imageKey);

	revalidatePath("/");
	revalidatePath(`/products/${parsed.data.id}`);
	redirect(`/products/${parsed.data.id}`);
}

export async function deleteProduct(formData: FormData): Promise<void> {
	await requireUser();
	const parsed = parseForm(z.object({ id: idFromForm }), formData);
	if (!parsed.ok) throw new Error(parsed.error);

	const db = await getDb();
	const current = (await db.select().from(products).where(eq(products.id, parsed.data.id)).limit(1))[0];
	if (current) {
		const records = await db
			.select({ imageKey: priceRecords.imageKey })
			.from(priceRecords)
			.where(eq(priceRecords.productId, parsed.data.id));
		// 行は ON DELETE CASCADE で消えるが R2 の画像は残る。
		// 他の商品と共有しているキーを巻き添えにしないよう、行を消したあとに片付ける
		await db.delete(products).where(eq(products.id, parsed.data.id));
		for (const key of [current.imageKey, ...records.map((r) => r.imageKey)]) {
			await releaseImage(db, key);
		}
	}
	revalidatePath("/");
	redirect("/");
}
