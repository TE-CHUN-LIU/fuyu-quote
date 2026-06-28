# 富寓報價系統 SaaS 升級規格

## 現況

- 目前是公開靜態頁：`index.html` + `assets/app.js` + `assets/data.js` + `assets/style.css`。
- 雲端儲存已接 Supabase RPC，但使用「共用密碼」控管，不是會員登入。
- 報價資料可存在 localStorage、JSON 檔與 Supabase `fuyu_quotes`。
- Excel / CSV / 可選文字 PDF 可在前端直接匯入；掃描 PDF / 圖片 / Numbers 已保留 `/api/ai-import` 後端入口，需設定 OpenAI 金鑰才會啟用。

## 權限與訂閱制目標

正式訂閱制版本需要把「報價工具」改成登入後使用：

- `admin`：管理公司、成員、訂閱、全部報價單、AI 用量。
- `owner`：公司帳號擁有者，可管理自己公司的成員與報價單。
- `editor`：可建立、匯入、編輯、輸出報價單。
- `viewer`：只能看報價單與輸出。

登入後才能呼叫：

- 雲端報價單清單、儲存、刪除。
- AI 匯入 PDF / 圖片 / Numbers。
- 訂閱狀態檢查與用量查詢。

## 建議資料表

- `organizations`
  - `id`
  - `name`
  - `slug`
  - `created_at`

- `organization_members`
  - `organization_id`
  - `user_id`
  - `role`
  - `created_at`

- `subscriptions`
  - `organization_id`
  - `status`
  - `plan`
  - `current_period_start`
  - `current_period_end`
  - `provider`
  - `provider_customer_id`
  - `provider_subscription_id`

- `quotes`
  - `id`
  - `organization_id`
  - `customer_name`
  - `project_name`
  - `data`
  - `created_by`
  - `updated_at`

- `ai_import_jobs`
  - `id`
  - `organization_id`
  - `quote_id`
  - `file_name`
  - `status`
  - `model`
  - `input_bytes`
  - `created_by`
  - `created_at`

## 上線切法

1. 保留目前靜態工具，先上統包利潤與智慧匯入入口。
2. 新增 Supabase Auth，取代共用雲端密碼。
3. 把 `fuyu_quotes` 拆成依公司隔離的 `quotes`，用 RLS 限制只能看自己的公司資料。
4. 加 `subscriptions`，API 每次儲存或 AI 匯入前檢查訂閱狀態。
5. 金流 provider 確定後，再串接 checkout、webhook、續訂/停用流程。
6. AI 匯入正式計費：依檔案大小、頁數、模型用量記錄到 `ai_import_jobs`。

## 注意事項

- OpenAI 金鑰只能放 Vercel / 後端環境變數，不能放 `assets/app.js`。
- 前端隱藏按鈕不等於權限控管；真正控管要在 API 與資料庫 RLS。
- 統包報價輸出時不能出現原始單價、原始小計、利潤列；目前已用業主版單價與小計重新輸出。
