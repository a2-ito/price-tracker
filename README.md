# 最安値メモ (price-tracker)

商品ごとに店舗別の価格を記録し、容量あたりの単価で最安値を比較する個人用 Web アプリ。

- Next.js 16 (App Router) + [@opennextjs/cloudflare](https://opennext.js.org/cloudflare) → Cloudflare Workers
- D1 (Drizzle ORM) / R2（商品画像）
- Auth.js v5 + Google ログイン。`ALLOWED_EMAILS` に載せたアカウントだけ利用可

## 機能

- 商品の登録・編集・削除（画像・カテゴリ・容量の単位）
- カテゴリの追加・変更・削除
- 店舗ごとの価格記録（価格・容量・個数・日付・メモ）
- 単価（g / ml は 100 あたり、それ以外は 1 あたり）で最安値を自動判定して一覧表示
- カテゴリ絞り込み・商品名検索
- 配色の切り替え（ライト / ダーク / システム追従）。選択は端末に保存し、描画前に適用するのでリロード時もちらつかない
- 画像はブラウザ側で長辺 1200px に縮小してから R2 に保存

## CI / CD

Pull Request を作ると GitHub Actions で lint・型チェック・テスト・ビルドが走る。

自動マージは PR ごとに有効にする。

```sh
gh pr merge --auto --squash <PR 番号>
```

ワークフローから有効にすると bot がマージしたことになり、後続のデプロイが
起動しないため、自分の認証で有効にする。

main に入ると Cloudflare Workers へ自動デプロイされる。
デプロイに必要な値はリポジトリの Secrets に登録する。

| Secret | 内容 |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Workers / D1 / R2 の編集権限を持つ API トークン |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare のアカウント ID |
| `D1_DATABASE_ID` | D1 データベースの ID |
| `APP_HOSTNAME` | 公開ホスト名 |

`wrangler.jsonc` は追跡していないため、デプロイ時に雛形のプレースホルダを
Secrets の値で埋めて組み立てる。

スキーマ変更は自動適用しない。`npm run db:migrate:remote` を手で流してからマージする。

## セットアップ

### 1. Google OAuth クライアントの作成

[Google Cloud Console](https://console.cloud.google.com/apis/credentials) で OAuth 2.0 クライアント ID（ウェブアプリケーション）を作成し、承認済みリダイレクト URI に以下を登録する。

- `http://localhost:3000/api/auth/callback/google`（ローカル開発）
- `https://<公開ホスト名>/api/auth/callback/google`（本番）

### 2. ローカル環境変数

```sh
cp wrangler.jsonc.example wrangler.jsonc   # __D1_DATABASE_ID__ と __APP_HOSTNAME__ を書き換える
cp .dev.vars.example .dev.vars
openssl rand -base64 32   # AUTH_SECRET に貼る
```

`.dev.vars` に `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` / `ALLOWED_EMAILS` を記入する。

### 3. ローカル DB のマイグレーション

```sh
npm run db:migrate:local
```

### 4. 開発サーバ

```sh
npm run dev        # next dev（bindings は miniflare 経由で利用可）
npm run preview    # Workers ランタイムで実行して確認
```

## テスト

```sh
npm test             # Vitest 一括実行
npm run test:watch
npm run typecheck    # next typegen + tsc
npm run lint
```

DB / R2 を使うテストは Miniflare（workerd）上の本物の D1 / R2 を起動し、`drizzle/` のマイグレーション SQL をそのまま適用する。
サーバーアクションは認証・Cloudflare コンテキスト・`revalidatePath` / `redirect` だけをモックして実行する。

## デプロイ

```sh
# 初回のみ: Secrets を登録（値はリポジトリに含めない）
npx wrangler secret put AUTH_SECRET          # openssl rand -base64 32 で生成
npx wrangler secret put AUTH_GOOGLE_ID
npx wrangler secret put AUTH_GOOGLE_SECRET
npx wrangler secret put ALLOWED_EMAILS       # 許可するメールをカンマ区切りで

npm run db:migrate:remote
npm run deploy
```

## スキーマ変更

`src/db/schema.ts` を編集して以下を実行する。

```sh
npm run db:generate          # drizzle/ に SQL を生成
npm run db:migrate:local
npm run db:migrate:remote
```

## リソース

| 種別 | 名前 |
| --- | --- |
| Worker | `price-tracker` |
| D1 | `price-tracker-db` |
| R2 | `price-tracker-images` |

ログインを許可するアカウントを増やすときは、`ALLOWED_EMAILS` の Secret を
カンマ区切りで登録し直してから再デプロイする。

```sh
npx wrangler secret put ALLOWED_EMAILS
npm run deploy
```
