"use client";

import { useState } from "react";
import { inputClass } from "./ui";

const MAX_EDGE = 1200;
const JPEG_QUALITY = 0.85;

/** スマホ写真をそのまま送らず、長辺 1200px の JPEG に縮小してからアップロードする */
async function shrinkImage(file: File): Promise<File> {
	if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
	const bitmap = await createImageBitmap(file);
	const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
	if (scale === 1 && file.size < 500 * 1024) return file;

	const canvas = document.createElement("canvas");
	canvas.width = Math.round(bitmap.width * scale);
	canvas.height = Math.round(bitmap.height * scale);
	const ctx = canvas.getContext("2d");
	if (!ctx) return file;
	ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

	const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
	if (!blob) return file;
	return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
}

export function ImageInput({ name, currentUrl }: { name: string; currentUrl?: string | null }) {
	const [preview, setPreview] = useState<string | null>(currentUrl ?? null);
	const [busy, setBusy] = useState(false);

	async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
		const input = e.currentTarget;
		const file = input.files?.[0];
		if (!file) return;
		setBusy(true);
		try {
			const shrunk = await shrinkImage(file);
			if (shrunk !== file) {
				const dt = new DataTransfer();
				dt.items.add(shrunk);
				input.files = dt.files;
			}
			setPreview(URL.createObjectURL(shrunk));
		} catch (err) {
			console.error("画像の縮小に失敗しました", err);
			setPreview(URL.createObjectURL(file));
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className="space-y-2">
			{preview && (
				<img src={preview} alt="" className="h-40 w-40 rounded-md border border-zinc-200 object-cover dark:border-zinc-700" />
			)}
			<input type="file" name={name} accept="image/*" onChange={onChange} className={inputClass} />
			{busy && <p className="text-xs text-zinc-500">画像を縮小中…</p>}
		</div>
	);
}
