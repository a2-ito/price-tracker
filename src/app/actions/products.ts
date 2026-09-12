"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db";
import { products, UNITS } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { idFromForm, optionalIdFromForm, optionalText, parseForm, type ActionState } from "@/lib/form";
import { deleteImage, storeImage } from "@/lib/images";

const productSchema = z.object({
	name: z.string().trim().min(1, "商品名を入力してください").max(100),
	categoryId: optionalIdFromForm,
	unit: z.enum(UNITS),
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
			categoryId: parsed.data.categoryId ?? null,
			unit: parsed.data.unit,
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
		if (newKey) {
			await deleteImage(current.imageKey);
			imageKey = newKey;
		} else if (parsed.data.removeImage === "on") {
			await deleteImage(current.imageKey);
			imageKey = null;
		}
	} catch (e) {
		return { error: e instanceof Error ? e.message : "画像の保存に失敗しました" };
	}

	await db
		.update(products)
		.set({
			name: parsed.data.name,
			categoryId: parsed.data.categoryId ?? null,
			unit: parsed.data.unit,
			memo: parsed.data.memo ?? null,
			imageKey,
			updatedAt: new Date().toISOString().replace("T", " ").slice(0, 19),
		})
		.where(eq(products.id, parsed.data.id));

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
		await deleteImage(current.imageKey);
		// price_records は ON DELETE CASCADE
		await db.delete(products).where(eq(products.id, parsed.data.id));
	}
	revalidatePath("/");
	redirect("/");
}
