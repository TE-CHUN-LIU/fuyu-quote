const MAX_DATA_URL_CHARS = 18_000_000;

const quoteSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    project: {
      type: 'object',
      additionalProperties: false,
      properties: {
        name: { type: 'string' },
        location: { type: 'string' },
        date: { type: 'string' },
        contact: { type: 'string' },
      },
      required: ['name', 'location', 'date', 'contact'],
    },
    customer: {
      type: 'object',
      additionalProperties: false,
      properties: {
        name: { type: 'string' },
        phone: { type: 'string' },
        taxId: { type: 'string' },
        invoiceTitle: { type: 'string' },
        address: { type: 'string' },
      },
      required: ['name', 'phone', 'taxId', 'invoiceTitle', 'address'],
    },
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          floor: { type: 'string' },
          category: { type: 'string' },
          name: { type: 'string' },
          spec: { type: 'string' },
          unit: { type: 'string' },
          qty: { type: 'number' },
          price: { type: 'number' },
          note: { type: 'string' },
        },
        required: ['floor', 'category', 'name', 'spec', 'unit', 'qty', 'price', 'note'],
      },
    },
    notes: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  required: ['project', 'customer', 'items', 'notes'],
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(501).json({ message: 'AI 匯入尚未啟用：請先在 Vercel 設定 OPENAI_API_KEY' });
  }

  // [SECURITY 2026-07] 需登入才可使用（否則任何匿名者可用本站當代理狂燒 OpenAI 額度）。
  {
    const SUPA_URL = process.env.SUPABASE_URL || 'https://ulaumiqgrazbpdpykgsw.supabase.co';
    const SUPA_ANON = process.env.SUPABASE_ANON_KEY || 'sb_publishable_hqupVgCRCxuMKb6UJXLglg_cEB-rifP';
    const authz = req.headers.authorization || req.headers.Authorization || '';
    const m = /^Bearer\s+(.+)$/i.exec(authz);
    if (!m) return res.status(401).json({ message: '請先登入再使用 AI 匯入' });
    try {
      const ur = await fetch(`${SUPA_URL}/auth/v1/user`, {
        headers: { Authorization: `Bearer ${m[1]}`, apikey: SUPA_ANON },
      });
      if (!ur.ok) return res.status(401).json({ message: '登入已失效，請重新登入' });
      const u = await ur.json();
      if (!u || !u.id) return res.status(401).json({ message: '登入已失效，請重新登入' });
    } catch {
      return res.status(503).json({ message: '驗證服務暫時無法使用，請稍後再試' });
    }
  }

  try {
    const body = await readJson(req);
    const fileName = String(body.fileName || 'quote-file');
    const mimeType = String(body.mimeType || 'application/octet-stream');
    const dataUrl = String(body.dataUrl || '');

    if (!dataUrl.startsWith('data:')) {
      return res.status(400).json({ message: '檔案格式不正確' });
    }
    if (dataUrl.length > MAX_DATA_URL_CHARS) {
      return res.status(413).json({ message: '檔案太大，請先壓縮或拆成較小檔案' });
    }

    const isImage = mimeType.startsWith('image/');
    const filePart = isImage
      ? { type: 'input_image', image_url: dataUrl }
      : { type: 'input_file', filename: fileName, file_data: dataUrl };

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-5.5',
        input: [
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: [
                  '你是台灣室內裝潢報價單資料抽取助手。',
                  '請從檔案辨識報價項目並輸出 JSON，項目順序需與原始報價單一致。',
                  'project 欄位：name=案名/工程名稱；location=地點；date=報價日期；contact=現場聯絡人電話（沒有就空字串，不要把材料或公司名塞進來）。',
                  'project.contact 只放聯絡人/電話；承辦公司名稱、署名不要當成客戶或聯絡人。',
                  '逐項欄位：floor=樓層或施做區域（如 1F、2F、全室、主臥；沒寫就留空字串）；category=工程分類；name=項目名稱；spec=材料/材質（如「安盛美耐板」「日本矽酸鈣板」，沒有就空字串）；unit=單位；qty=數量；price=單價；note=施工/收邊/工法等備註。',
                  '務必把來源中獨立「材料」「材質」欄的內容放進 spec，不要併進 name；name 只放品項名稱。',
                  'price 一律填「單價」欄，不要填「複價／小計／金額／總價」欄。若報價單同時有單價與複價兩欄，price 取單價欄。',
                  '若只有小計（複價）沒有單價，請用小計除以數量推算單價；若沒有數量，數量用 1。',
                  '【務必逐列完整抽取】表格每一資料列都要輸出成一個獨立 item，不可合併相鄰列、不可摘要、不可略過任何一列；即使有 30、50 列也要全部輸出，順序與原表一致。',
                  '【備註要完整保留】沒有獨立材料欄時，備註欄中的材料與工法文字要原文完整放進 note，不可省略或簡化；有獨立材料欄時，材料放 spec、工法與施工說明放 note。',
                  '【空白單價填 0】若單價欄空白、且沒有可推算的小計/複價，price 一律填 0，不要自行編造或估算價格。',
                  '同一「工程類型」連續多列時，每一列仍各自輸出成獨立 item，category 沿用該分類，不要把多列併成一筆。',
                  'qty 與 price 必須是純數字：去掉逗號、貨幣符號與單位字（例如「2 式」的 qty 填 2、單位填「式」；「$1,200」的 price 填 1200）。',
                  '不要輸出合計、總計、小計列、營業稅、折讓、備註條款、付款方式、頁尾簽名作為 items。',
                  'category 只使用：木工、泥作、油漆、水電、地板、拆除、衛浴、廚具、系統櫃、其他。',
                  '分類同義詞請對應：木作/木工程→木工；泥作工程/砌磚/粉光→泥作；油漆工程/塗裝→油漆；水電工程/電氣/給排水→水電；地坪/鋪面→地板；拆除工程/打除→拆除；衛浴設備→衛浴；廚房設備→廚具；系統傢俱/系統櫃體→系統櫃；無法歸類的→其他。',
                  '報價單分類標題列（只有分類名沒有數量單價的整行）不要當成 item，但其下的項目要沿用該分類。',
                ].join('\n'),
              },
              filePart,
            ],
          },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'fuyu_quote_import',
            schema: quoteSchema,
            strict: true,
          },
        },
      }),
    });

    const result = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ message: result.error?.message || 'OpenAI 解析失敗' });
    }

    const text = extractOutputText(result);
    const parsed = JSON.parse(text);
    parsed.items = Array.isArray(parsed.items) ? parsed.items.filter(item => item.name && item.unit) : [];
    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ message: err?.message || 'AI 匯入失敗' });
  }
}

function extractOutputText(result) {
  if (typeof result.output_text === 'string' && result.output_text.trim()) return result.output_text;
  const chunks = [];
  for (const item of result.output || []) {
    for (const content of item.content || []) {
      if (content.type === 'output_text' && content.text) chunks.push(content.text);
    }
  }
  const text = chunks.join('\n').trim();
  if (!text) throw new Error('AI 未回傳可解析的資料');
  return text;
}

async function readJson(req) {
  if (req.body) {
    return typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
