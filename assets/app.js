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
    pdfBusy: false,
    addForm: {
      category: '木工',
      itemName: '',
      floor: '1F',
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

    save() {
      const data = {
        project: this.project,
        customer: this.customer,
        items: this.items,
        bankChoice: this.bankChoice,
        needInvoice: this.needInvoice,
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

    async savePdf() {
      if (this.pdfBusy) return;
      this.pdfBusy = true;
      // 切到列印樣式（隱藏 toolbar、no-print 元素、收緊版型）
      document.body.classList.add('printing');
      // 給一個 frame 讓樣式生效再 render
      await new Promise(r => setTimeout(r, 50));
      try {
        const paper = document.querySelector('.paper');
        const filename = `富寓報價單_${this.customer.name || '未命名'}_${this.project.date}.pdf`;
        const opt = {
          margin:       [10, 12, 10, 12], // mm: top, left, bottom, right
          filename:     filename,
          image:        { type: 'jpeg', quality: 0.98 },
          html2canvas:  {
            scale: 2,
            useCORS: true,
            letterRendering: true,
            backgroundColor: '#ffffff',
          },
          jsPDF:        {
            unit: 'mm',
            format: 'a4',
            orientation: 'portrait',
            compress: true,
          },
          pagebreak: { mode: ['css', 'legacy'], avoid: ['tr', '.section-title', '.summary', '.signature-area'] },
        };
        await html2pdf().set(opt).from(paper).save();
      } catch (err) {
        alert('產生 PDF 失敗：' + err.message);
        console.error(err);
      } finally {
        document.body.classList.remove('printing');
        this.pdfBusy = false;
      }
    },
  };
}
