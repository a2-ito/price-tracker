"use client";

import { useActionState, useEffect, useRef } from "react";
import { createRecord } from "@/app/actions/records";
import type { Unit } from "@/db/schema";
import { initialActionState } from "@/lib/form";
import { todayIso } from "@/lib/price";
import { Field, FormMessage, inputClass, SubmitButton } from "./ui";

export function RecordForm({ productId, unit, stores }: { productId: number; unit: Unit; stores: string[] }) {
	const [state, formAction] = useActionState(createRecord, initialActionState);
	const formRef = useRef<HTMLFormElement>(null);

	// 成功したら価格まわりだけクリアして連続入力しやすくする
	useEffect(() => {
		if (!state.success || !formRef.current) return;
		for (const name of ["price", "amount", "memo"]) {
			const el = formRef.current.elements.namedItem(name);
			if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) el.value = "";
		}
	}, [state]);

	return (
		<form ref={formRef} action={formAction} className="space-y-4">
			<input type="hidden" name="productId" value={productId} />
			<FormMessage state={state} />

			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<Field label="店舗">
					<input name="store" required list="store-suggestions" className={inputClass} placeholder="例: OK ストア" />
					<datalist id="store-suggestions">
						{stores.map((s) => (
							<option key={s} value={s} />
						))}
					</datalist>
				</Field>
				<Field label="記録日">
					<input name="recordedAt" type="date" required defaultValue={todayIso()} className={inputClass} />
				</Field>
				<Field label="税込価格（円）">
					<input name="price" type="number" inputMode="numeric" min={1} step={1} required className={inputClass} />
				</Field>
				<div className="grid grid-cols-2 gap-3">
					<Field label={`容量（${unit}）`}>
						<input name="amount" type="number" inputMode="decimal" min={0.01} step="any" required className={inputClass} />
					</Field>
					<Field label="個数" hint="まとめ売りの場合">
						<input name="quantity" type="number" inputMode="numeric" min={1} step={1} defaultValue={1} className={inputClass} />
					</Field>
				</div>
			</div>

			<Field label="メモ">
				<input name="memo" maxLength={500} className={inputClass} placeholder="セール価格、会員価格など" />
			</Field>

			<SubmitButton pendingText="記録中…">価格を記録する</SubmitButton>
		</form>
	);
}
