-- 容量を価格記録から商品へ移す。
-- 荷姿（容量）が複数ある商品は、荷姿ごとに別の商品へ分割する。

-- 1. 各商品の代表容量を決める。記録数が最も多いもの、同数なら小さい方を採用する
UPDATE products SET amount = (
  SELECT r.amount
  FROM price_records r
  WHERE r.product_id = products.id
  GROUP BY r.amount
  ORDER BY COUNT(*) DESC, r.amount ASC
  LIMIT 1
)
WHERE EXISTS (SELECT 1 FROM price_records WHERE product_id = products.id);
--> statement-breakpoint

-- 2. 代表容量と異なる荷姿について、新しい商品を作る。
--    名前の末尾に容量を付け、整数なら小数点以下を落とす
INSERT INTO products (name, maker, category_id, unit, amount, image_key, memo)
SELECT
  p.name || ' ' ||
    CASE WHEN r.amount = CAST(r.amount AS INTEGER)
      THEN CAST(CAST(r.amount AS INTEGER) AS TEXT)
      ELSE CAST(r.amount AS TEXT) END
    || p.unit,
  p.maker, p.category_id, p.unit, r.amount, p.image_key, p.memo
FROM price_records r
JOIN products p ON p.id = r.product_id
WHERE r.amount <> p.amount
GROUP BY p.id, r.amount;
--> statement-breakpoint

-- 3. 記録を、容量が一致する商品へ付け替える
UPDATE price_records
SET product_id = (
  SELECT np.id
  FROM products np
  JOIN products op ON op.id = price_records.product_id
  WHERE np.amount = price_records.amount
    AND np.unit = op.unit
    AND (np.name = op.name
         OR np.name = op.name || ' ' ||
              CASE WHEN price_records.amount = CAST(price_records.amount AS INTEGER)
                THEN CAST(CAST(price_records.amount AS INTEGER) AS TEXT)
                ELSE CAST(price_records.amount AS TEXT) END
              || op.unit)
  ORDER BY np.id
  LIMIT 1
)
WHERE amount <> (SELECT amount FROM products WHERE id = price_records.product_id);
--> statement-breakpoint

-- 4. 分割元にも容量を付記して、荷姿違いが並んだときに見分けられるようにする。
--    LIKE は D1 でパターンが複雑すぎると弾かれるため、名前を組み立てて等値で判定する
UPDATE products
SET name = name || ' ' ||
  CASE WHEN amount = CAST(amount AS INTEGER)
    THEN CAST(CAST(amount AS INTEGER) AS TEXT)
    ELSE CAST(amount AS TEXT) END
  || unit
WHERE EXISTS (
  SELECT 1 FROM products np
  WHERE np.id <> products.id
    AND np.unit = products.unit
    AND np.name = products.name || ' ' ||
        CASE WHEN np.amount = CAST(np.amount AS INTEGER)
          THEN CAST(CAST(np.amount AS INTEGER) AS TEXT)
          ELSE CAST(np.amount AS TEXT) END
        || products.unit
);
