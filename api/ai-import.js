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
        quoteNo: { type: 'string' },
        location: { type: 'string' },
        date: { type: 'string' },
        contact: { type: 'string' },
        material: { type: 'string' },
      },
      required: ['name', 'quoteNo', 'location', 'date', 'contact', 'material'],
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
                  'project 欄位：name=案名/工程名稱；quoteNo=估價編號/報價編號（如 AS-241214-01，沒有就空字串）；location=地點；date=報價日期；contact=現場聯絡人電話（沒有就空字串，不要把材質或公司名塞進來）；material=材質/主要建材（如「安盛美耐板（連工帶料）」，沒有就空字串）。',
                  'project.contact 只放聯絡人/電話；承辦公司名稱、署名不要當成客戶或聯絡人。',
                  '逐項欄位：floor=樓層或施做區域（如 1F、2F、全室、主臥；沒寫就留空字串）；category=工程分類；name=項目名稱；spec=規格/尺寸（如「248×115cm ×2面」「90×84cm」，沒有就空字串）；unit=單位；qty=數量；price=單價；note=施工/收邊等備註。',
                  '務必把「規格/尺寸」欄的內容放進 spec，不要併進 name；name 只放品項名稱。',
                  'price 一律填「單價」欄，不要填「複價／小計／金額／總價」欄。若報價單同時有單價與複價兩欄，price 取單價欄。',
                  '若只有小計（複價）沒有單價，請用小計除以數量推算單價；若沒有數量，數量用 1。',
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
