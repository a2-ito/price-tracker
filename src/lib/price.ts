import type { Unit } from "@/db/schema";

/** 単価を表示する基準量。g / ml は 100 あたり、それ以外は 1 あたり */
export function unitBase(unit: Unit): number {
	return unit === "g" || unit === "ml" ? 100 : 1;
}

export function unitBaseLabel(unit: Unit): string {
	return `${unitBase(unit)}${unit}`;
}

/** 商品 1 パッケージの合計容量。1 個あたりの容量 × 入数 */
export function packageAmount(amount: number, count: number): number {
	return amount * count;
}

type PriceInput = {
	price: number;
	/** 1 個あたりの容量 */
	amount: number;
	/** 1 パッケージの入数 */
	count?: number;
	/** 購入したパッケージ数 */
	quantity?: number;
	unit: Unit;
};

/** 基準量あたりの単価（円） */
export function unitPrice({ price, amount, count = 1, quantity = 1, unit }: PriceInput): number {
	const total = packageAmount(amount, count) * quantity;
	if (total <= 0) return Number.NaN;
	return (price / total) * unitBase(unit);
}

/**
 * 商品の荷姿を表す文字列。入数は常に示す。
 * 入数が 2 以上のときだけ合計を添える。
 * 入数の単位は付けない。容量の単位が「個」などの場合に重複して読みにくくなるため。
 */
export function formatPackage(amount: number, count: number, unit: Unit): string {
	const each = `${amount.toLocaleString("ja-JP")}${unit}`;
	const times = Math.max(1, count);
	if (times <= 1) return `${each} × 1`;
	const total = packageAmount(amount, times).toLocaleString("ja-JP");
	return `${each} × ${times} = ${total}${unit}`;
}

export function formatYen(value: number, fractionDigits = 1): string {
	if (!Number.isFinite(value)) return "-";
	return `¥${value.toLocaleString("ja-JP", { maximumFractionDigits: fractionDigits })}`;
}

/** 購入量の表示。合計容量に購入パッケージ数を掛けた形 */
export function formatAmount(amount: number, quantity: number, unit: Unit): string {
	const amountLabel = `${amount.toLocaleString("ja-JP")}${unit}`;
	return quantity > 1 ? `${amountLabel} × ${quantity}` : amountLabel;
}

export function todayIso(): string {
	return new Date().toISOString().slice(0, 10);
}
