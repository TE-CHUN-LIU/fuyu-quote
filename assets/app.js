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
      // 列印前先把 document.title 設成有意義的檔名（瀏覽器存 PDF 預設用這個）
      const oldTitle = document.title;
      const name = `富寓報價單_${this.customer.name || '未命名'}_${this.project.date}`;
      document.title = name;
      window.print();
      setTimeout(() => { document.title = oldTitle; }, 1000);
    },
  };
}
