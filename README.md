# 富寓室內裝潢公司報價單

純前端（HTML + Tailwind 風格 CSS + Alpine.js）報價單編輯器，可線上填寫、自動暫存、列印、輸出 PDF。

## 功能

- **項目下拉選單**：60+ 項預設裝潢項目（木工、泥作、油漆、水電、地板、拆除、衛浴、廚具、系統櫃、其他），選了自動帶入單位與預設單價
- **自訂項目**：可手動新增不在目錄裡的項目
- **自動計算**：數量 × 單價 → 小計 → 分類加總 → 三期付款（30/40/30）
- **發票切換**：勾選後自動加 5% 營業稅
- **匯款帳戶**：可在「國泰世華（個人戶）」與「元大銀行（公司戶）」之間切換
- **自動暫存**：所有資料存 localStorage，關閉瀏覽器資料不丟
- **匯出／匯入 JSON**：方便備份與在不同設備間轉移
- **列印優化**：CSS `@media print` 控制版型，直接列印或存 PDF

## 使用方式

### 本機開啟

```bash
open index.html
```

或用任何靜態檔伺服器：

```bash
python3 -m http.server 8000
# 然後瀏覽器開 http://localhost:8000
```

### GitHub Pages 部署（private repo 需 GitHub Pro 或改用 Vercel）

1. Settings → Pages → Source = `main` branch / `/` (root)
2. 推送後等 1-2 分鐘
3. 開 https://<USER>.github.io/fuyu-quote/

### 輸出 PDF

點右上「🖨 列印 / 存 PDF」 → 在列印對話框選擇「另存為 PDF」。檔名會自動帶客戶名 + 日期。

## 資料結構

主要設定都在 `assets/data.js`：

- `ITEM_LIBRARY` — 預設項目目錄，可自行增刪
- `COMPANY_INFO` — 公司基本資料、匯款帳戶
- `DEFAULT_TERMS` — 報價單下方備註條款
- `FLOOR_OPTIONS` — 樓層下拉選項
- `UNIT_OPTIONS` — 單位下拉選項

修改後 reload 頁面即生效。

## 來源

項目價格參考 2025/5 蘆竹案實際報價單，後續可依市場調整。
