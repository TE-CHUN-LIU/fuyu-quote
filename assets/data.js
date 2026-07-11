// 富寓室內裝潢公司報價單 ── 項目目錄
// 來源：蘆竹案實際報價單（27 個項目）+ 木作報價轉錄案（19 項補充）+ 常見裝潢項目補充
// 格式：{ category, name, unit, defaultPrice, note }

const ITEM_LIBRARY = [
  // ===== A. 木工（沿用蘆竹案） =====
  { category: '木工', name: '層板燈', unit: '尺', defaultPrice: 650 },
  { category: '木工', name: '窗簾盒', unit: '尺', defaultPrice: 550 },
  { category: '木工', name: '隱藏門加五金', unit: '樘', defaultPrice: 26000 },
  { category: '木工', name: '雙面隔間', unit: '尺', defaultPrice: 2500 },
  { category: '木工', name: '平釘天花板', unit: '坪', defaultPrice: 3500 },
  { category: '木工', name: '平釘天花板（按尺）', unit: '尺', defaultPrice: 3500 },
  { category: '木工', name: '包樑柱', unit: '尺', defaultPrice: 650 },
  { category: '木工', name: '包樑柱加四分之一圓', unit: '尺', defaultPrice: 1000 },
  { category: '木工', name: '窗簾兩側邊L立柱', unit: '式', defaultPrice: 3500 },
  { category: '木工', name: '窗簾盒L立柱', unit: '式', defaultPrice: 15000 },
  { category: '木工', name: '隱藏門加雙面隔間含五金', unit: '式', defaultPrice: 32000 },
  { category: '木工', name: '次臥平釘天花板', unit: '坪', defaultPrice: 3500 },
  { category: '木工', name: '走廊天花板平釘', unit: '坪', defaultPrice: 3500 },
  { category: '木工', name: '床頭櫃初胚（未含貼皮）', unit: '尺', defaultPrice: 0, note: '皮板型號確認後估價' },
  { category: '木工', name: 'L 懸浮櫃體', unit: '尺', defaultPrice: 0, note: '待估價' },
  { category: '木工', name: '懸浮櫃', unit: '尺', defaultPrice: 0, note: '待估價' },
  { category: '木工', name: '玄關櫃', unit: '尺', defaultPrice: 0, note: '待確認' },
  { category: '木工', name: '電視牆', unit: '式', defaultPrice: 0, note: '立面圖確認後估價' },
  { category: '木工', name: '部分隔間', unit: '式', defaultPrice: 0, note: '立面圖確認後估價' },

  // ===== A2. 木工（木作報價轉錄案補充） =====
  { category: '木工', name: '維修口／活動口', unit: '組', defaultPrice: 1000, note: '依現況開立' },
  { category: '木工', name: '木料及室內除蟲', unit: '坪', defaultPrice: 0, note: '依坪數估價' },
  { category: '木工', name: '造型半高隔間', unit: '處', defaultPrice: 1800 },
  { category: '木工', name: '隔間／屏風結構加強', unit: '處', defaultPrice: 500 },
  { category: '木工', name: '弧形矮隔間（含1/4圓實木條）', unit: '尺', defaultPrice: 1800 },
  { category: '木工', name: '空調底座窗簾盒', unit: '尺', defaultPrice: 600, note: '永新F1角材、木心板、矽酸鈣板' },
  { category: '木工', name: '包樑（深50cm內無圓角）', unit: '尺', defaultPrice: 600 },
  { category: '木工', name: '造型弧形角', unit: '處', defaultPrice: 3000 },
  { category: '木工', name: '木作電視牆（含線路暗管通道）', unit: '尺', defaultPrice: 1800 },
  { category: '木工', name: '電視牆側邊弧形木作（S角）', unit: '座', defaultPrice: 6000 },
  { category: '木工', name: '1/4圓實木收邊條', unit: '支', defaultPrice: 300 },
  { category: '木工', name: '鋁條燈燈溝（8*9mm預埋）', unit: '尺', defaultPrice: 250 },
  { category: '木工', name: '矽膠燈燈溝（10*10mm預埋）', unit: '尺', defaultPrice: 250 },
  { category: '木工', name: '燈盒（10*10cm含燈溝）', unit: '尺', defaultPrice: 500 },
  { category: '木工', name: '吊燈吊掛結構加強', unit: '處', defaultPrice: 500 },
  { category: '木工', name: '儲藏室隔間', unit: '尺', defaultPrice: 1800, note: '永新F1角材、夾板、矽酸鈣板' },
  { category: '木工', name: '外開門片（3.6cm厚含安裝）', unit: '片', defaultPrice: 8000 },
  { category: '木工', name: '隱藏鉸鏈（英國KANSWAY）', unit: '組', defaultPrice: 3500 },
  { category: '木工', name: '門崁把手', unit: '組', defaultPrice: 0, note: '依實際選材計價' },

  // ===== B. 泥作（沿用 + 補充） =====
  { category: '泥作', name: '鐵道磚施作', unit: '式', defaultPrice: 35000 },
  { category: '泥作', name: '廚房粉光貼磚填縫', unit: '式', defaultPrice: 35000 },
  { category: '泥作', name: '壁磚施作', unit: '坪', defaultPrice: 4500 },
  { category: '泥作', name: '地磚施作', unit: '坪', defaultPrice: 4500 },
  { category: '泥作', name: '防水工程', unit: '坪', defaultPrice: 2500 },
  { category: '泥作', name: '水泥粉光', unit: '坪', defaultPrice: 1800 },
  { category: '泥作', name: '磚牆隔間', unit: '坪', defaultPrice: 5500 },

  // ===== C. 油漆 =====
  { category: '油漆', name: '室內乳膠漆（含批土）', unit: '坪', defaultPrice: 1500 },
  { category: '油漆', name: '室內水泥漆（含批土）', unit: '坪', defaultPrice: 1200 },
  { category: '油漆', name: '天花板油漆', unit: '坪', defaultPrice: 1500 },
  { category: '油漆', name: '油漆補土', unit: '式', defaultPrice: 0, note: '視現場狀況' },

  // ===== D. 水電 =====
  { category: '水電', name: '插座配線', unit: '個', defaultPrice: 1200 },
  { category: '水電', name: '開關配線', unit: '個', defaultPrice: 1000 },
  { category: '水電', name: '燈具安裝', unit: '盞', defaultPrice: 500 },
  { category: '水電', name: '吊燈安裝', unit: '盞', defaultPrice: 800 },
  { category: '水電', name: '網路線配置', unit: '處', defaultPrice: 1500 },
  { category: '水電', name: '電視線配置', unit: '處', defaultPrice: 1500 },
  { category: '水電', name: '冷氣配管', unit: '式', defaultPrice: 8000 },

  // ===== E. 地板 =====
  { category: '地板', name: '超耐磨木地板', unit: '坪', defaultPrice: 4500 },
  { category: '地板', name: '海島型木地板', unit: '坪', defaultPrice: 6500 },
  { category: '地板', name: '實木地板', unit: '坪', defaultPrice: 8500 },
  { category: '地板', name: 'SPC 石塑地板', unit: '坪', defaultPrice: 3500 },
  { category: '地板', name: '塑膠地磚', unit: '坪', defaultPrice: 2500 },

  // ===== F. 拆除 =====
  { category: '拆除', name: '磚牆拆除', unit: '坪', defaultPrice: 2500 },
  { category: '拆除', name: '木作拆除', unit: '坪', defaultPrice: 1500 },
  { category: '拆除', name: '地板拆除', unit: '坪', defaultPrice: 1500 },
  { category: '拆除', name: '天花板拆除', unit: '坪', defaultPrice: 1500 },
  { category: '拆除', name: '廢棄物清運', unit: '車', defaultPrice: 6500 },

  // ===== G. 衛浴 =====
  { category: '衛浴', name: '馬桶安裝', unit: '組', defaultPrice: 3500 },
  { category: '衛浴', name: '洗手台安裝', unit: '組', defaultPrice: 4500 },
  { category: '衛浴', name: '淋浴拉門', unit: '組', defaultPrice: 12000 },
  { category: '衛浴', name: '浴缸安裝', unit: '組', defaultPrice: 18000 },

  // ===== H. 廚具 =====
  { category: '廚具', name: '上下廚櫃（連工帶料）', unit: '尺', defaultPrice: 9500 },
  { category: '廚具', name: '人造石檯面', unit: '尺', defaultPrice: 3500 },
  { category: '廚具', name: '石英石檯面', unit: '尺', defaultPrice: 5500 },
  { category: '廚具', name: '不鏽鋼水槽', unit: '組', defaultPrice: 4500 },
  { category: '廚具', name: '排油煙機安裝', unit: '組', defaultPrice: 3500 },

  // ===== I. 系統櫃 =====
  { category: '系統櫃', name: '系統衣櫃', unit: '尺', defaultPrice: 6500 },
  { category: '系統櫃', name: '系統書櫃', unit: '尺', defaultPrice: 5500 },
  { category: '系統櫃', name: '系統玄關鞋櫃', unit: '尺', defaultPrice: 5500 },
  { category: '系統櫃', name: '系統電視櫃', unit: '尺', defaultPrice: 5500 },

  // ===== J. 其他 =====
  { category: '其他', name: '清潔工程', unit: '式', defaultPrice: 8000 },
  { category: '其他', name: '進場保護工程', unit: '式', defaultPrice: 6000 },
  { category: '其他', name: '驗收與點交', unit: '式', defaultPrice: 0 },
];

// 樓層選項
const FLOOR_OPTIONS = ['1F', '2F', '3F', '4F', '5F', '6F', 'B1', '頂樓', '全棟', '室外', '其他'];

// 單位選項（新增項目用）
const UNIT_OPTIONS = ['尺', '坪', '式', '樘', '個', '盞', '組', '處', '座', '支', '車', '片', '公分', '公尺'];

// 公司資訊
const COMPANY_INFO = {
  name: '富寓室內裝潢有限公司',
  englishName: 'FU-YU Turnkey Contractor',
  taxId: '60380943',
  contact: '謝嘉哠',
  phone: '0963-717-213',
  address: '32097 桃園市中壢區執信一街8號',
  line: '@429ngvmi',
  services: '木工 · 水電 · 系統櫃 · 泥作',
  slogan: '整體規劃 x 發包整合',
  banks: {
    cathay: {
      label: '國泰世華 - 南崁分行（個人戶）',
      bankName: '國泰世華銀行（南崁分行）',
      bankCode: '013',
      accountName: '謝嘉哠',
      accountNo: '135-50-003962-3',
    },
    yuanta: {
      label: '元大銀行 - 新壢分行（公司戶）',
      bankName: '元大銀行（新壢分行）',
      bankCode: '806',
      accountName: '富寓室內裝潢有限公司',
      accountNo: '2143-2000-8892-80',
    },
  },
};

// 平台（家群）品牌資訊 ── 登入頁與帳號管理用
const PLATFORM_INFO = {
  brand: '家群',
  brandEn: 'JIACHUN',
  system: '企業報價系統',
  tagline: '整體規劃 × 發包整合 · 報價雲端化',
  provider: '家群企業',
  domain: 'jiachun-mmt.com',
  site: 'https://web.jiachun-mmt.com',
};

// 預設備註條款
const DEFAULT_TERMS = [
  '本報價於開單日起 7 日內有效。確認無議，並煩請簽名蓋章以便日後請款附上。',
  '同意報價請將下方客戶資料欄填妥，以利本公司建檔。',
  '產品為訂製品經簽認後不得取消，如需取消則賠償總金額，不得異議。',
  '工程款依本報價單所列「請款分期」分次收取。',
  '依動產交易法附條件買賣之相關法令規定，買方於款項未付清前，本標的貨品之所有權仍屬賣方，賣方有權將貨品收回，買方不得異議。倘若完工 7 天內無法結清全額款項，此裝潢都屬我方，我方有權收回裝潢。',
  '買賣雙方簽訂報價單、合約書之金額後，不得於賣方請款時議價。',
  '本報價單經簽名或蓋章確認回傳後，視同正式合約，若有收取之訂金，恕不退還。',
];

// 預設保固項目
const DEFAULT_WARRANTY = {
  included: [
    '木作結構鬆動',
    '木作固定不良',
    '收邊脫落',
  ],
  excluded: [
    '漏水、壁癌、潮濕',
    '天災',
    '人為破壞',
    '白蟻蟲害',
    '自然伸縮、色差',
    '後續其他工種造成損壞',
    '電類 LED 燈不提供保固',
    '門類五金不提供保固',
    '玻璃不提供保固',
  ],
};
