import { notFound } from "next/navigation";
import { deleteProduct } from "@/app/actions/products";
import { deleteRecord } from "@/app/actions/records";
import { RecordForm } from "@/components/record-form";
import { ConfirmForm, DangerButton, LinkButton } from "@/components/ui";
import { getDb } from "@/db";
import { getProduct, listRecords, listStores } from "@/db/queries";
import { requireUser } from "@/lib/auth";
import { imageUrl } from "@/lib/images";
import { formatAmount, formatYen, unitBaseLabel, unitPrice } from "@/lib/price";
import { isSafeExternalUrl, linkHostname } from "@/lib/url";

/** リンクがあれば店舗名を外部リンクにする。危険な形式は素のテキストに落とす */
function StoreLabel({ store, url }: { store: string; url: string | null }) {
	if (!isSafeExternalUrl(url)) return <>{store}</>;
	return (
		<a
			href={url as string}
			target="_blank"
			rel="noopener noreferrer nofollow"
			title={linkHostname(url) ?? undefined}
			className="inline-flex items-center gap-1 text-emerald-700 underline underline-offset-2 hover:text-emerald-900 dark:text-emerald-400 dark:hover:text-emerald-300"
		>
			{store}
			<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
				<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
				<path d="M15 3h6v6M10 14 21 3" />
			</svg>
		</a>
	);
}

function parseId(raw: string): number | null {
	const n = Number(raw);
	return Number.isInteger(n) && n > 0 ? n : null;
}

export default async function ProductPage({ params }: PageProps<"/products/[id]">) {
	await requireUser();
	const id = parseId((await params).id);
	if (id === null) notFound();

	const db = await getDb();
	const product = await getProduct(db, id);
	if (!product) notFound();
	const [records, stores] = await Promise.all([listRecords(db, id), listStores(db)]);
	const best = records[0];

	return (
		<div className="space-y-8">
			<section className="flex flex-col gap-4 sm:flex-row">
				<div className="h-48 w-48 flex-none overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-800">
					{product.imageKey ? (
						<img src={imageUrl(product.imageKey)} alt={product.name} className="h-full w-full object-cover" />
					) : (
						<div className="flex h-full w-full items-center justify-center text-5xl text-zinc-400">📦</div>
					)}
				</div>
				<div className="flex-1 space-y-2">
					<p className="text-sm text-zinc-500">{product.categoryName ?? "未分類"}</p>
					<h1 className="text-2xl font-bold">{product.name}</h1>
					{best ? (
						<div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900 dark:bg-emerald-950">
							<p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">最安値</p>
							<p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">
								{formatYen(unitPrice(best.price, best.amount, best.quantity, product.unit))}
								<span className="ml-1 text-sm font-normal">/ {unitBaseLabel(product.unit)}</span>
							</p>
							<p className="text-sm text-emerald-800 dark:text-emerald-200">
								<StoreLabel store={best.store} url={best.url} /> ・ {formatYen(best.price, 0)}（
								{formatAmount(best.amount, best.quantity, product.unit)}）・ {best.recordedAt}
							</p>
						</div>
					) : (
						<p className="text-sm text-zinc-400">価格はまだ記録されていません</p>
					)}
					{product.memo && <p className="whitespace-pre-wrap text-sm text-zinc-600 dark:text-zinc-400">{product.memo}</p>}
					<div className="flex flex-wrap gap-2 pt-2">
						<LinkButton href={`/products/${product.id}/edit`}>編集</LinkButton>
						<ConfirmForm action={deleteProduct} message={`「${product.name}」と価格記録をすべて削除しますか？`}>
							<input type="hidden" name="id" value={product.id} />
							<DangerButton>商品を削除</DangerButton>
						</ConfirmForm>
					</div>
				</div>
			</section>

			<section className="space-y-3 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
				<h2 className="font-semibold">価格を記録</h2>
				<RecordForm productId={product.id} unit={product.unit} stores={stores} />
			</section>

			<section className="space-y-3">
				<h2 className="font-semibold">価格記録（単価が安い順）</h2>
				{records.length === 0 ? (
					<p className="text-sm text-zinc-500">まだ記録がありません</p>
				) : (
					<div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
						<table className="w-full text-sm">
							<thead className="bg-zinc-50 text-left text-xs text-zinc-500 dark:bg-zinc-900">
								<tr>
									<th className="px-3 py-2">単価 / {unitBaseLabel(product.unit)}</th>
									<th className="px-3 py-2">店舗</th>
									<th className="px-3 py-2">価格</th>
									<th className="px-3 py-2">容量</th>
									<th className="px-3 py-2">日付</th>
									<th className="px-3 py-2">写真</th>
									<th className="px-3 py-2">メモ</th>
									<th className="px-3 py-2"></th>
								</tr>
							</thead>
							<tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
								{records.map((r, i) => (
									<tr key={r.id} className={i === 0 ? "bg-emerald-50/60 dark:bg-emerald-950/40" : undefined}>
										<td className="px-3 py-2 font-semibold">{formatYen(unitPrice(r.price, r.amount, r.quantity, product.unit))}</td>
										<td className="px-3 py-2">
											<StoreLabel store={r.store} url={r.url} />
										</td>
										<td className="px-3 py-2">{formatYen(r.price, 0)}</td>
										<td className="px-3 py-2">{formatAmount(r.amount, r.quantity, product.unit)}</td>
										<td className="px-3 py-2 whitespace-nowrap">{r.recordedAt}</td>
										<td className="px-3 py-2">
											{r.imageKey && (
												<a href={imageUrl(r.imageKey)} target="_blank" rel="noopener noreferrer" title="拡大して表示">
													<img
														src={imageUrl(r.imageKey)}
														alt=""
														loading="lazy"
														className="h-10 w-10 rounded border border-zinc-200 object-cover dark:border-zinc-700"
													/>
												</a>
											)}
										</td>
										<td className="px-3 py-2 text-zinc-500">{r.memo}</td>
										<td className="px-3 py-2 text-right">
											<ConfirmForm action={deleteRecord} message="この価格記録を削除しますか？">
												<input type="hidden" name="id" value={r.id} />
												<input type="hidden" name="productId" value={product.id} />
												<button type="submit" className="text-xs text-red-600 hover:underline">
													削除
												</button>
											</ConfirmForm>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</section>
		</div>
	);
}
