"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import { priceRecords } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { idFromForm, optionalText, optionalUrl, parseForm, type ActionState } from "@/lib/form";

const recordSchema = z.object({
	productId: idFromForm,
	store: z.string().trim().min(1, "店舗名を入力してください").max(100),
	price: z.coerce.number().int("価格は整数で入力してください").positive("価格は 1 円以上で入力してください"),
	amount: z.coerce.number().positive("容量は 0 より大きい値で入力してください"),
	quantity: z.coerce.number().int().positive().default(1),
	recordedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日付の形式が不正です"),
	url: optionalUrl,
	memo: optionalText,
});

export async function createRecord(_prev: ActionState, formData: FormData): Promise<ActionState> {
	await requireUser();
	const parsed = parseForm(recordSchema, formData);
	if (!parsed.ok) return { error: parsed.error };

	const db = await getDb();
	await db.insert(priceRecords).values({
		productId: parsed.data.productId,
		store: parsed.data.store,
		price: parsed.data.price,
		amount: parsed.data.amount,
		quantity: parsed.data.quantity,
		recordedAt: parsed.data.recordedAt,
		url: parsed.data.url ?? null,
		memo: parsed.data.memo ?? null,
	});

	revalidatePath("/");
	revalidatePath(`/products/${parsed.data.productId}`);
	return { success: "価格を記録しました" };
}

export async function deleteRecord(formData: FormData): Promise<void> {
	await requireUser();
	const parsed = parseForm(z.object({ id: idFromForm, productId: idFromForm }), formData);
	if (!parsed.ok) throw new Error(parsed.error);

	const db = await getDb();
	await db.delete(priceRecords).where(eq(priceRecords.id, parsed.data.id));
	revalidatePath("/");
	revalidatePath(`/products/${parsed.data.productId}`);
}
