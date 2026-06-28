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
          unit: { type: 'string' },
          qty: { type: 'number' },
          price: { type: 'number' },
          note: { type: 'string' },
        },
        required: ['floor', 'category', 'name', 'unit', 'qty', 'price', 'note'],
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
                  '請從檔案辨識報價項目並輸出 JSON。',
                  '欄位含義：floor=樓層或施做區域；category=工程分類；name=項目名稱；unit=單位；qty=數量；price=單價；note=材質說明或備註。',
                  '若只有小計沒有單價，請用小計除以數量推算單價；若沒有數量，數量用 1。',
                  '不要輸出合計、總計、營業稅、備註條款、付款方式作為 items。',
                  'category 只使用：木工、泥作、油漆、水電、地板、拆除、衛浴、廚具、系統櫃、其他。',
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
