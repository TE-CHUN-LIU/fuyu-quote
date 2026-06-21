// 富寓室內裝潢公司報價單 ── Alpine.js 邏輯
// 全部資料用 localStorage 自動暫存，瀏覽器關掉也不掉

const STORAGE_KEY = 'fuyu-quote-v1';

function quoteApp() {
  return {
    // === State ===
    project: {
      name: '',
      location: '',
      contact: '',
      date: new Date().toISOString().slice(0, 10),
    },
    customer: {
      name: '',
      contact: '',
      phone: '',
      fax: '',
      taxId: '',
      invoiceTitle: '',
      address: '',
    },
    items: [],
    bankChoice: 'cathay', // 'cathay' 或 'yuanta'
    needInvoice: false,
    isLocked: false,
    groupMode: 'category', // 'category' 依工程分類 / 'floor' 依樓層分類
    floorFilter: '全部',    // '全部' 或某一樓層（只篩選檢視，不影響總計）
    addForm: {
      category: '木工',
      itemName: '',
      floor: '1F',
    },
    // 欄位定義（顯示/隱藏 + 寬度，順序固定）
    colDefs: [
      { key: 'floor', label: '樓層' },
      { key: 'name', label: '項目及說明' },
      { key: 'unit', label: '單位' },
      { key: 'qty', label: '數量' },
      { key: 'price', label: '單價' },
      { key: 'subtotal', label: '總價' },
      { key: 'note', label: '備註' },
    ],
    cols: {
      floor: { show: true, w: 58 },
      name: { show: true, w: 150 },
      unit: { show: true, w: 52 },
      qty: { show: true, w: 56 },
      price: { show: true, w: 78 },
      subtotal: { show: true, w: 92 },
      note: { show: true, w: 220 },
    },

    // === Data Sources ===
    library: ITEM_LIBRARY,
    floorOptions: FLOOR_OPTIONS,
    unitOptions: UNIT_OPTIONS,
    company: COMPANY_INFO,
    terms: DEFAULT_TERMS,

    get categories() {
      return [...new Set(this.library.map(i => i.category))];
    },
    get filteredItems() {
      return this.library.filter(i => i.category === this.addForm.category);
    },
    get itemsByCategory() {
      const grouped = {};
      for (const item of this.items) {
        if (!grouped[item.category]) grouped[item.category] = [];
        grouped[item.category].push(item);
      }
      return grouped;
    },
    // 樓層篩選後的項目（只影響表格檢視，總計仍以全部項目計算）
    get visibleItems() {
      if (this.floorFilter === '全部') return this.items;
      return this.items.filter(i => i.floor === this.floorFilter);
    },
    // 依目前選擇的分組方式（工程 / 樓層）整理出區塊，並照固定順序排序
    get groups() {
      const map = {};
      for (const item of this.visibleItems) {
        const key = this.groupMode === 'floor' ? item.floor : item.category;
        if (!map[key]) map[key] = [];
        map[key].push(item);
      }
      const orderRef = this.groupMode === 'floor' ? this.floorOptions : this.categories;
      const keys = Object.keys(map).sort((a, b) => {
        const ia = orderRef.indexOf(a), ib = orderRef.indexOf(b);
        return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
      });
      return keys.map(key => {
        const list = map[key];
        const subtotal = list.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.price) || 0), 0);
        const label = this.groupMode === 'floor' ? `${key} 樓層` : `${key} 工程`;
        return { key, label, items: list, subtotal };
      });
    },
    get grandTotal() {
      return this.items.reduce((sum, i) => sum + (Number(i.qty) || 0) * (Number(i.price) || 0), 0);
    },
    get categorySubtotals() {
      const totals = {};
      for (const item of this.items) {
        const sub = (Number(item.qty) || 0) * (Number(item.price) || 0);
        totals[item.category] = (totals[item.category] || 0) + sub;
      }
      return totals;
    },
    get tax() {
      return this.needInvoice ? Math.round(this.grandTotal * 0.05) : 0;
    },
    get finalTotal() {
      return this.grandTotal + this.tax;
    },
    get payments() {
      const t = this.finalTotal;
      return {
        first: Math.round(t * 0.3),
        second: Math.round(t * 0.4),
        third: t - Math.round(t * 0.3) - Math.round(t * 0.4),
      };
    },
    get currentBank() {
      return this.company.banks[this.bankChoice];
    },

    // === Methods ===
    init() {
      this.load();
      // 自動暫存（每次 state 變動）
      this.$watch('project', () => this.save(), { deep: true });
      this.$watch('customer', () => this.save(), { deep: true });
      this.$watch('items', () => this.save(), { deep: true });
      this.$watch('bankChoice', () => this.save());
      this.$watch('needInvoice', () => this.save());
      this.$watch('groupMode', () => this.save());
      this.$watch('floorFilter', () => this.save());
      this.$watch('cols', () => this.save(), { deep: true });
    },

    addItem() {
      if (!this.addForm.itemName) {
        alert('請選擇項目');
        return;
      }
      const libItem = this.library.find(
        i => i.category === this.addForm.category && i.name === this.addForm.itemName
      );
      if (!libItem) return;
      this.items.push({
        id: crypto.randomUUID(),
        floor: this.addForm.floor,
        category: libItem.category,
        name: libItem.name,
        unit: libItem.unit,
        qty: 1,
        price: libItem.defaultPrice,
        note: libItem.note || '',
      });
      this.addForm.itemName = '';
    },

    addCustomItem() {
      const name = prompt('項目名稱：');
      if (!name) return;
      const unit = prompt('單位（尺/坪/式/個...）：', '式') || '式';
      const price = Number(prompt('單價：', '0')) || 0;
      const category = prompt('分類（木工/泥作/油漆/水電/地板/拆除/衛浴/廚具/系統櫃/其他）：', '其他') || '其他';
      this.items.push({
        id: crypto.randomUUID(),
        floor: this.addForm.floor,
        category,
        name,
        unit,
        qty: 1,
        price,
        note: '',
      });
    },

    removeItem(id) {
      this.items = this.items.filter(i => i.id !== id);
    },

    duplicateItem(id) {
      const idx = this.items.findIndex(i => i.id === id);
      if (idx < 0) return;
      const copy = { ...this.items[idx], id: crypto.randomUUID() };
      this.items.splice(idx + 1, 0, copy);
    },

    moveUp(id) {
      const idx = this.items.findIndex(i => i.id === id);
      if (idx <= 0) return;
      [this.items[idx - 1], this.items[idx]] = [this.items[idx], this.items[idx - 1]];
    },

    moveDown(id) {
      const idx = this.items.findIndex(i => i.id === id);
      if (idx < 0 || idx >= this.items.length - 1) return;
      [this.items[idx + 1], this.items[idx]] = [this.items[idx], this.items[idx + 1]];
    },

    subtotal(item) {
      return (Number(item.qty) || 0) * (Number(item.price) || 0);
    },

    formatMoney(n) {
      return new Intl.NumberFormat('zh-TW').format(Math.round(n || 0));
    },

    // 拖拉欄位標題右緣調整寬度
    startResize(key, ev) {
      ev.preventDefault();
      ev.stopPropagation();
      const startX = ev.clientX;
      const startW = this.cols[key].w;
      const onMove = (e) => {
        const dw = e.clientX - startX;
        this.cols[key].w = Math.max(36, Math.round(startW + dw));
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.body.style.cursor = '';
        this.save();
      };
      document.body.style.cursor = 'col-resize';
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },

    // 欄位寬度與顯示還原預設
    resetCols() {
      const def = {
        floor: { show: true, w: 58 }, name: { show: true, w: 150 },
        unit: { show: true, w: 52 }, qty: { show: true, w: 56 },
        price: { show: true, w: 78 }, subtotal: { show: true, w: 92 },
        note: { show: true, w: 220 },
      };
      Object.keys(def).forEach(k => { this.cols[k].show = def[k].show; this.cols[k].w = def[k].w; });
      this.save();
    },

    save() {
      const data = {
        project: this.project,
        customer: this.customer,
        items: this.items,
        bankChoice: this.bankChoice,
        needInvoice: this.needInvoice,
        groupMode: this.groupMode,
        floorFilter: this.floorFilter,
        cols: this.cols,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    },

    load() {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      try {
        const data = JSON.parse(raw);
        Object.assign(this.project, data.project || {});
        Object.assign(this.customer, data.customer || {});
        this.items = data.items || [];
        this.bankChoice = data.bankChoice || 'cathay';
        this.needInvoice = !!data.needInvoice;
        this.groupMode = data.groupMode || 'category';
        this.floorFilter = data.floorFilter || '全部';
        if (data.cols) {
          for (const k of Object.keys(this.cols)) {
            if (data.cols[k]) Object.assign(this.cols[k], data.cols[k]);
          }
        }
      } catch (e) {
        console.error('Load failed', e);
      }
    },

    clearAll() {
      if (!confirm('確定清空所有資料？此動作無法復原。')) return;
      localStorage.removeItem(STORAGE_KEY);
      location.reload();
    },

    exportJson() {
      const data = {
        project: this.project,
        customer: this.customer,
        items: this.items,
        bankChoice: this.bankChoice,
        needInvoice: this.needInvoice,
        exportedAt: new Date().toISOString(),
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const name = `富寓報價單_${this.customer.name || '未命名'}_${this.project.date}.json`;
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    },

    importJson(event) {
      const file = event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target.result);
          if (!confirm('將覆蓋目前所有資料，確定匯入？')) return;
          Object.assign(this.project, data.project || {});
          Object.assign(this.customer, data.customer || {});
          this.items = data.items || [];
          this.bankChoice = data.bankChoice || 'cathay';
          this.needInvoice = !!data.needInvoice;
          alert('匯入成功');
        } catch (err) {
          alert('匯入失敗：' + err.message);
        }
      };
      reader.readAsText(file);
      event.target.value = '';
    },

    toggleLock() {
      this.isLocked = !this.isLocked;
      document.body.classList.toggle('locked', this.isLocked);
    },

    printQuote() {
      const oldTitle = document.title;
      const name = `富寓報價單_${this.customer.name || '未命名'}_${this.project.date}`;
      document.title = name;
      window.print();
      setTimeout(() => { document.title = oldTitle; }, 1000);
    },

    // === Excel 匯出 ===
    saveExcel() {
      const wb = XLSX.utils.book_new();
      const rows = this._buildSpreadsheetRows();
      const ws = XLSX.utils.aoa_to_sheet(rows);
      // 欄寬設定
      ws['!cols'] = [
        { wch: 6 },   // 樓層
        { wch: 30 },  // 項目
        { wch: 6 },   // 單位
        { wch: 8 },   // 數量
        { wch: 10 },  // 單價
        { wch: 12 },  // 總價
        { wch: 20 },  // 備註
      ];
      // 合併儲存格（標題、付款區）會在後面用 merges 追加
      XLSX.utils.book_append_sheet(wb, ws, '報價單');
      const filename = `富寓報價單_${this.customer.name || '未命名'}_${this.project.date}.xlsx`;
      XLSX.writeFile(wb, filename);
    },

    saveCsv() {
      const rows = this._buildSpreadsheetRows();
      const csv = rows.map(r => r.map(cell => {
        if (cell == null) return '';
        const s = String(cell);
        if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
        return s;
      }).join(',')).join('\n');
      // 加 BOM 讓 Excel 開 csv 不亂碼
      const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `富寓報價單_${this.customer.name || '未命名'}_${this.project.date}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    },

    // === PDF / PNG 匯出 ===
    _exportName() {
      return `富寓報價單_${this.customer.name || '未命名'}_${this.project.date}`;
    },

    _esc(s) {
      return (s == null ? '' : String(s)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    },

    // 生成一份乾淨唯讀版面（inline 樣式，避免可編輯表格的截圖問題）
    _buildExportNode() {
      const co = this.company, cu = this.customer, pr = this.project, c = this.cols;
      const m = n => this.formatMoney(n);
      const e = s => this._esc(s);
      const cols = [
        ['floor', '樓層', '58px', 'center'],
        ['name', '項目及說明', '', 'left'],
        ['unit', '單位', '54px', 'center'],
        ['qty', '數量', '58px', 'right'],
        ['price', '單價', '80px', 'right'],
        ['subtotal', '總價', '92px', 'right'],
        ['note', '備註', '200px', 'left'],
      ].filter(x => c[x[0]].show);
      const n = cols.length;

      const th = cols.map(x =>
        `<th style="border:1px solid #ccc;padding:6px 8px;background:#f0f0f0;font-size:12px;${x[2] ? 'width:' + x[2] + ';' : ''}text-align:${x[3]}">${x[1]}</th>`
      ).join('');

      let rows = '';
      for (const g of this.groups) {
        rows += `<tr><td colspan="${n}" style="border:1px solid #ccc;padding:6px 8px;background:#eaf0f6;font-weight:600;font-size:13px;">${e(g.label)}<span style="float:right">小計 $ ${m(g.subtotal)}</span></td></tr>`;
        for (const it of g.items) {
          const v = { floor: it.floor, name: it.name, unit: it.unit, qty: (Number(it.qty) || 0), price: m(it.price), subtotal: m(this.subtotal(it)), note: it.note };
          rows += '<tr>' + cols.map(x =>
            `<td style="border:1px solid #ccc;padding:5px 8px;font-size:12px;text-align:${x[3]};white-space:pre-wrap;word-break:break-word;vertical-align:top;">${e(v[x[0]])}</td>`
          ).join('') + '</tr>';
        }
      }

      const infoRow = (l1, v1, l2, v2) =>
        `<tr><td style="padding:5px 8px;color:#555;width:80px;">${l1}</td><td style="padding:5px 8px;border-bottom:1px solid #eee;">${e(v1)}</td><td style="padding:5px 8px;color:#555;width:80px;">${l2 || ''}</td><td style="padding:5px 8px;border-bottom:1px solid #eee;">${e(v2 || '')}</td></tr>`;
      const taxRow = this.needInvoice ? `<div style="display:flex;justify-content:space-between;padding:4px 0;"><span>營業稅 5%</span><span>$ ${m(this.tax)}</span></div>` : '';
      const termsHtml = this.terms.map(t => `<li style="margin:3px 0;font-size:11px;color:#444;">${e(t)}</li>`).join('');
      const bank = this.currentBank;

      const node = document.createElement('div');
      node.style.cssText = "width:820px;background:#fff;padding:28px 32px;font-family:'PingFang TC','Heiti TC',sans-serif;color:#1a1a1a;box-sizing:border-box;";
      node.innerHTML = `
        <div style="display:flex;align-items:center;gap:16px;border-bottom:2px solid #2e4a6b;padding-bottom:12px;">
          <img src="assets/logo.png" style="width:60px;height:60px;object-fit:contain;">
          <div style="flex:1;text-align:center;">
            <div style="font-size:20px;font-weight:700;">${e(co.name)}</div>
            <div style="font-size:12px;color:#888;">${e(co.englishName)}</div>
            <div style="font-size:12px;color:#666;margin-top:2px;">${e(co.services)}　｜　${e(co.slogan)}</div>
            <div style="font-size:18px;letter-spacing:8px;font-weight:700;margin-top:6px;">報　價　單</div>
          </div>
          <div style="width:60px;"></div>
        </div>
        <table style="width:100%;border-collapse:collapse;margin:12px 0;font-size:13px;">
          ${infoRow('工程名稱', pr.name, '報價日期', pr.date)}
          ${infoRow('工程地點', pr.location, '現場聯絡', pr.contact)}
          ${infoRow('客戶名稱', cu.name, '聯絡電話', cu.phone)}
          ${infoRow('公司統編', cu.taxId, '發票抬頭', cu.invoiceTitle)}
          ${infoRow('客戶地址', cu.address, '', '')}
        </table>
        <table style="width:100%;border-collapse:collapse;margin-top:6px;"><thead><tr>${th}</tr></thead><tbody>${rows}</tbody></table>
        <div style="margin-top:10px;margin-left:auto;width:300px;font-size:13px;">
          <div style="display:flex;justify-content:space-between;padding:4px 0;"><span>工程總額（未稅）</span><span>$ ${m(this.grandTotal)}</span></div>
          ${taxRow}
          <div style="display:flex;justify-content:space-between;padding:6px 0;border-top:2px solid #2e4a6b;font-weight:700;font-size:15px;"><span>${this.needInvoice ? '總計（含稅）' : '總計（未含稅）'}</span><span>$ ${m(this.finalTotal)}</span></div>
        </div>
        <div style="display:flex;gap:10px;margin-top:10px;text-align:center;">
          <div style="flex:1;border:1px solid #ddd;padding:8px;font-size:12px;"><div style="color:#888;">請款一　進場 30%</div><div style="font-weight:700;margin-top:4px;">$ ${m(this.payments.first)}</div></div>
          <div style="flex:1;border:1px solid #ddd;padding:8px;font-size:12px;"><div style="color:#888;">請款二　進度 40%</div><div style="font-weight:700;margin-top:4px;">$ ${m(this.payments.second)}</div></div>
          <div style="flex:1;border:1px solid #ddd;padding:8px;font-size:12px;"><div style="color:#888;">請款三　完工 30%</div><div style="font-weight:700;margin-top:4px;">$ ${m(this.payments.third)}</div></div>
        </div>
        <div style="margin-top:16px;"><strong style="font-size:12px;">備註說明：</strong><ol style="margin:6px 0;padding-left:20px;">${termsHtml}</ol></div>
        <div style="display:flex;gap:16px;margin-top:14px;">
          <div style="flex:1;border:1px solid #ddd;padding:12px;font-size:12px;line-height:1.9;">
            <div style="font-weight:700;border-bottom:1px solid #eee;padding-bottom:6px;margin-bottom:8px;">客戶確認章戳</div>
            <div>客戶名稱：${e(cu.name)}</div><div>聯絡電話：${e(cu.phone)}</div>
            <div>統一編號：${e(cu.taxId)}</div><div>發票抬頭：${e(cu.invoiceTitle)}</div>
            <div>地　　址：${e(cu.address)}</div>
            <div style="margin-top:18px;color:#999;">（請於此處簽名或蓋章）</div>
          </div>
          <div style="flex:1;border:1px solid #ddd;padding:12px;font-size:12px;line-height:1.9;">
            <div style="font-weight:700;border-bottom:1px solid #eee;padding-bottom:6px;margin-bottom:8px;">${e(co.name)}<span style="float:right;font-weight:400;color:#888;">統編 ${e(co.taxId)}</span></div>
            <div>現場聯絡：${e(co.contact)}　${e(co.phone)}</div>
            <div>公司地址：${e(co.address)}</div>
            <div>LINE　　：${e(co.line)}</div>
            <div>付款方式：匯款／轉帳</div>
            <div>銀行名稱：${e(bank.bankName)}（${e(bank.bankCode)}）</div>
            <div>戶　　名：${e(bank.accountName)}</div>
            <div>匯款帳號：${e(bank.accountNo)}</div>
            <div style="margin-top:14px;color:#999;">（公司用印）</div>
          </div>
        </div>
      `;
      return node;
    },

    async _capturePaper() {
      if (typeof html2canvas === 'undefined') {
        alert('截圖元件尚未載入完成，請稍候幾秒或重新整理再試。');
        return null;
      }
      const node = this._buildExportNode();
      const wrap = document.createElement('div');
      wrap.style.cssText = 'position:fixed; left:-10000px; top:0; z-index:-1;';
      wrap.appendChild(node);
      document.body.appendChild(wrap);

      // 等 logo 圖片載入，避免截到一半
      const img = node.querySelector('img');
      if (img && !img.complete) {
        await new Promise(res => { img.onload = res; img.onerror = res; });
      }
      await new Promise(r => setTimeout(r, 50));

      let canvas = null;
      try {
        canvas = await html2canvas(node, {
          scale: 2,
          backgroundColor: '#ffffff',
          useCORS: true,
          windowWidth: node.offsetWidth,
          windowHeight: node.offsetHeight,
        });
      } catch (e) {
        alert('產生影像失敗：' + e.message);
      } finally {
        wrap.remove();
      }
      return canvas;
    },

    async savePng() {
      const canvas = await this._capturePaper();
      if (!canvas) return;
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = this._exportName() + '.png';
      a.click();
    },

    async savePdf() {
      const canvas = await this._capturePaper();
      if (!canvas) return;
      const imgData = canvas.toDataURL('image/png');
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageW = 210, pageH = 297;
      const imgW = pageW;
      const imgH = canvas.height * imgW / canvas.width;
      let heightLeft = imgH;
      let position = 0;
      pdf.addImage(imgData, 'PNG', 0, position, imgW, imgH);
      heightLeft -= pageH;
      while (heightLeft > 0) {
        position -= pageH;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgW, imgH);
        heightLeft -= pageH;
      }
      pdf.save(this._exportName() + '.pdf');
    },

    _buildSpreadsheetRows() {
      const r = [];
      // 標題
      r.push([this.company.name]);
      r.push(['報價單']);
      r.push([]);
      // 工程資訊
      r.push(['工程名稱', this.project.name, '', '', '報價日期', this.project.date]);
      r.push(['工程地點', this.project.location, '', '', '現場聯絡', this.project.contact]);
      r.push([]);
      // 客戶資訊
      r.push(['客戶名稱', this.customer.name, '', '', '聯絡電話', this.customer.phone]);
      r.push(['公司統編', this.customer.taxId, '', '', '發票抬頭', this.customer.invoiceTitle]);
      r.push(['客戶地址', this.customer.address]);
      r.push([]);
      // 項目表標頭
      r.push(['樓層', '項目及說明', '單位', '數量', '單價', '總價', '備註']);
      // 依分類列出
      for (const [cat, list] of Object.entries(this.itemsByCategory)) {
        r.push([`── ${cat} ──`]);
        for (const it of list) {
          r.push([
            it.floor,
            it.name,
            it.unit,
            Number(it.qty) || 0,
            Number(it.price) || 0,
            this.subtotal(it),
            it.note || '',
          ]);
        }
        r.push(['', `${cat}小計`, '', '', '', this.categorySubtotals[cat]]);
      }
      r.push([]);
      // 合計
      r.push(['', '工程總額（未稅）', '', '', '', this.grandTotal]);
      if (this.needInvoice) {
        r.push(['', '營業稅 5%', '', '', '', this.tax]);
      }
      r.push(['', this.needInvoice ? '總計（含稅）' : '總計（未含稅）', '', '', '', this.finalTotal]);
      r.push([]);
      // 三期付款
      r.push(['', '請款一　進場時收 30%', '', '', '', this.payments.first]);
      r.push(['', '請款二　工程進度 40%', '', '', '', this.payments.second]);
      r.push(['', '請款三　完工後 30%', '', '', '', this.payments.third]);
      r.push([]);
      // 備註條款
      r.push(['備註說明：']);
      this.terms.forEach((t, i) => r.push([`${i + 1}.`, t]));
      r.push([]);
      // 公司資訊
      r.push([`${this.company.name}　統編 ${this.company.taxId}`]);
      r.push([`現場聯絡：${this.company.contact}　${this.company.phone}`]);
      r.push([`付款方式：匯款／轉帳`]);
      r.push([`銀行名稱：${this.currentBank.bankName}（${this.currentBank.bankCode}）`]);
      r.push([`戶　　名：${this.currentBank.accountName}`]);
      r.push([`匯款帳號：${this.currentBank.accountNo}`]);
      return r;
    },

  };
}
