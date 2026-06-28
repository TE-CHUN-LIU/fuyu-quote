# Claude Code Handoff - fuyu-quote

## Project

- Repo path: `/Users/ty0220722000gmail.com/Projects/fuyu-quote`
- Git remote: `https://github.com/TE-CHUN-LIU/fuyu-quote.git`
- Branch: `main`
- Latest pushed commit: `1e95d88` - `修正 PDF 估價單匯入解析`
- Production URL: `https://fuyu-quote.vercel.app`
- Stack: static HTML + Alpine.js + browser libraries + Vercel serverless function.

## Current State

The app is a quote editor for 富寓室內裝潢. It supports:

- Local quote editing with localStorage autosave.
- Supabase cloud quote list/save/load/delete through existing RPC.
- JSON import/export.
- Excel / CSV import/export.
- PDF / PNG export.
- Contractor markup mode:
  - Percent or fixed amount profit.
  - When enabled, visible line item unit prices/subtotals and exported PDF/PNG/Excel/CSV use owner-facing prices.
  - Original quote prices are not shown in owner-facing output.
- Smart import:
  - JSON / CSV / Excel parse in browser.
  - Text-based PDF parse in browser via PDF.js.
  - Scanned PDF / image / Numbers fall back to `/api/ai-import`.

## Important Recent Fix

User uploaded an image/scanned quote and saw:

`匯入失敗：AI 匯入尚未啟用：請先在 Vercel 設定 OPENAI_API_KEY`

This is expected for scanned images because there is no selectable text to parse locally. The AI path requires Vercel environment variables:

```text
OPENAI_API_KEY=<real OpenAI API key>
OPENAI_MODEL=gpt-5.5
```

Do not commit the API key. Add it in Vercel Project Settings -> Environment Variables, then redeploy.

## Key Files

- `index.html`
  - UI shell and import/export buttons.
  - Includes XLSX, PDF.js, html2canvas, jsPDF, Supabase, Alpine.
- `assets/app.js`
  - Main Alpine app.
  - Smart import logic starts around `importAny`.
  - PDF parser is `_parsePdfFile`, `_pdfTextItemsToLines`, `_parseImportTextLines`.
  - Contractor markup logic is `contractorMarkup`, `quoteSubtotal`, `quoteUnitPrice`, `quoteGrandTotal`.
- `assets/style.css`
  - Layout, responsive toolbar, contractor markup controls.
- `api/ai-import.js`
  - Vercel serverless endpoint for scanned PDF/image/Numbers AI extraction.
  - Uses OpenAI Responses API with structured JSON schema.
- `docs/saas-subscription-roadmap.md`
  - SaaS/auth/subscription roadmap.
- `supabase-setup.sql`
  - Existing Supabase cloud quote storage setup.

## Verification Already Done

Commands:

```bash
node --check assets/app.js
node --check api/ai-import.js
git diff --check
```

PDF parsing sample counts tested locally using `pdftotext` text rows against the same parser rules:

- `/Users/ty0220722000gmail.com/Desktop/裝潢公司/大巨蛋 米特製造所 估價單 115.03.02.pdf` -> 10 items.
- `/Users/ty0220722000gmail.com/Desktop/裝潢公司/光明18街13號.pdf` -> 18 items.
- `/Users/ty0220722000gmail.com/Desktop/裝潢公司/2026單價表.pdf` -> 23 items.

Browser preview was checked on localhost with no console errors.

## Next Recommended Tasks

1. Add `OPENAI_API_KEY` and `OPENAI_MODEL` to Vercel, then redeploy.
2. Test scanned image import on production.
3. If scanned quote extraction returns wrong columns, improve the prompt/schema in `api/ai-import.js`.
4. Add a visible UI hint for scanned images: "掃描/圖片需啟用 AI 匯入".
5. Begin SaaS conversion:
   - Supabase Auth.
   - Organization/member tables.
   - Subscription status gate before cloud save and AI import.
   - RLS-protected `quotes` table per organization.

## Constraints

- Reply/work in Traditional Chinese Taiwan for this user.
- New non-repo files should go to iCloud Drive, but repo files belong in this repo.
- Do not mix this 富寓/裝潢報價 project with 家群 MMT or client clinic/salon branches.
- Do not commit API keys or private passwords.
- Direct push to `main` is the user's normal workflow when they say `commit push`.
