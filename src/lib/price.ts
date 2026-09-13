import type { Unit } from "@/db/schema";

/** 単価を表示する基準量。g / ml は 100 あたり、それ以外は 1 あたり */
export function unitBase(unit: Unit): number {
	return unit === "g" || unit === "ml" ? 100 : 1;
}

export function unitBaseLabel(unit: Unit): string {
	return `${unitBase(unit)}${unit}`;
}

/**
 * 基準量あたりの単価（円）。
 * amount は商品 1 個あたりの容量、quantity は購入個数。
 */
export function unitPrice(price: number, amount: number, quantity: number, unit: Unit): number {
	const total = amount * quantity;
	if (total <= 0) return Number.NaN;
	return (price / total) * unitBase(unit);
}

export function formatYen(value: number, fractionDigits = 1): string {
	if (!Number.isFinite(value)) return "-";
	return `¥${value.toLocaleString("ja-JP", { maximumFractionDigits: fractionDigits })}`;
}

export function formatAmount(amount: number, quantity: number, unit: Unit): string {
	const amountLabel = `${amount.toLocaleString("ja-JP")}${unit}`;
	return quantity > 1 ? `${amountLabel} × ${quantity}` : amountLabel;
}

export function todayIso(): string {
	return new Date().toISOString().slice(0, 10);
}
