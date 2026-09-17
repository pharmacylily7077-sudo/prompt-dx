/**
 * 調剤薬局 レジ現金＆クレジット決済管理モジュール (js/cash-register.js)
 * 理念: 守るためのシステム（現金のズレとうやむやを根絶し、適正な抑止力を提供する）
 */

class CashRegisterManager {
  static STORAGE_KEY = 'pharmacy_cash_register_v1';
  static DEFAULT_FEE_RATE = 3.24; // クレジット決済手数料率デフォルト 3.24%

  constructor(customStorage = null) {
    this.customStorage = customStorage;
    this.listeners = [];
    this.records = this.loadFromStorage();
  }

  /**
   * ストレージ取得ヘルパー
   */
  _getStorage() {
    if (this.customStorage) return this.customStorage;
    if (typeof localStorage !== 'undefined') return localStorage;
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
    if (typeof global !== 'undefined' && global.localStorage) return global.localStorage;
    return null;
  }

  /**
   * LocalStorageからデータ取得
   */
  loadFromStorage() {
    try {
      const storage = this._getStorage();
      if (!storage) return [];
      const data = storage.getItem(CashRegisterManager.STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      if (typeof console !== 'undefined' && console.error) console.error('レジ締めLocalStorage読み込み失敗:', e);
      return [];
    }
  }

  /**
   * LocalStorageへ保存
   */
  saveToStorage() {
    try {
      const storage = this._getStorage();
      if (storage) {
        storage.setItem(CashRegisterManager.STORAGE_KEY, JSON.stringify(this.records));
      }
      this.notifyListeners();
    } catch (e) {
      if (typeof console !== 'undefined' && console.error) console.error('レジ締めLocalStorage保存失敗:', e);
      throw new Error('データの保存に失敗しました。ブラウザの容量等をご確認ください。');
    }
  }

  /**
   * リスナー登録（データ変更時に画面再描画）
   */
  subscribe(listener) {
    this.listeners.push(listener);
  }

  notifyListeners() {
    this.listeners.forEach(fn => fn(this.records));
  }

  /**
   * レジ現金の過不足計算（静的メソッド）
   * 過不足額 = 実査現金 - (つり銭準備金 + レセコン窓口売上額)
   * @param {number} changeFund つり銭準備金
   * @param {number} presaleAmount レセコン窓口売上額
   * @param {number} actualCash 実査現金合計額
   */
  static calculateCashDiscrepancy(changeFund, presaleAmount, actualCash) {
    const fund = parseInt(changeFund, 10) || 0;
    const presale = parseInt(presaleAmount, 10) || 0;
    const actual = parseInt(actualCash, 10) || 0;

    const expectedCash = fund + presale;
    const discrepancy = actual - expectedCash;

    let status = 'match';
    let statusLabel = '一致（正常）';

    if (discrepancy > 0) {
      status = 'excess';
      statusLabel = `過剰（+${discrepancy.toLocaleString('ja-JP')}円）`;
    } else if (discrepancy < 0) {
      status = 'shortage';
      statusLabel = `不足（${discrepancy.toLocaleString('ja-JP')}円）`;
    }

    return {
      changeFund: fund,
      presaleAmount: presale,
      actualCash: actual,
      expectedCash,
      discrepancy,
      status,       // 'match' | 'excess' | 'shortage'
      statusLabel
    };
  }

  /**
   * クレジット決済の手数料と入金見込額計算（静的メソッド）
   * 決済手数料 = クレジット売上額 × 手数料率（四捨五入）
   * 差引入金見込額 = クレジット売上額 - 決済手数料
   * @param {number} creditSales クレジット日計売上額
   * @param {number} [feeRate] 手数料率（%）（未指定時は3.24%）
   */
  static calculateCredit(creditSales, feeRate = CashRegisterManager.DEFAULT_FEE_RATE) {
    const sales = parseInt(creditSales, 10) || 0;
    const rate = typeof feeRate === 'number' ? feeRate : parseFloat(feeRate) || CashRegisterManager.DEFAULT_FEE_RATE;

    const feeAmount = Math.round(sales * (rate / 100));
    const netCreditAmount = sales - feeAmount;

    return {
      creditSales: sales,
      feeRate: rate,
      feeAmount,
      netCreditAmount
    };
  }

  /**
   * 日計締めレコード追加または更新
   */
  saveRecord({ date, changeFund, presaleAmount, actualCash, creditSales = 0, feeRate = CashRegisterManager.DEFAULT_FEE_RATE, memo = '' }) {
    if (!date) {
      throw new Error('締め処理を行う日付を選択してください。');
    }

    const cashResult = CashRegisterManager.calculateCashDiscrepancy(changeFund, presaleAmount, actualCash);
    const creditResult = CashRegisterManager.calculateCredit(creditSales, feeRate);

    // 同一日付の既存レコードを検索
    const existingIndex = this.records.findIndex(r => r.date === date);

    const recordData = {
      id: existingIndex >= 0 ? this.records[existingIndex].id : 'closing_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      date,
      // レジ現金
      changeFund: cashResult.changeFund,
      presaleAmount: cashResult.presaleAmount,
      actualCash: cashResult.actualCash,
      expectedCash: cashResult.expectedCash,
      discrepancy: cashResult.discrepancy,
      status: cashResult.status,
      statusLabel: cashResult.statusLabel,
      // クレジット決済
      creditSales: creditResult.creditSales,
      feeRate: creditResult.feeRate,
      feeAmount: creditResult.feeAmount,
      netCreditAmount: creditResult.netCreditAmount,
      // メモ・更新日時
      memo: (memo || '').trim(),
      updatedAt: new Date().toISOString()
    };

    if (existingIndex >= 0) {
      this.records[existingIndex] = recordData;
    } else {
      recordData.createdAt = new Date().toISOString();
      this.records.push(recordData);
    }

    this.sortRecords();
    this.saveToStorage();
    return recordData;
  }

  /**
   * レコード削除
   */
  deleteRecord(id) {
    const index = this.records.findIndex(r => r.id === id);
    if (index === -1) {
      throw new Error('対象の締めデータが見つかりません。');
    }
    const removed = this.records.splice(index, 1)[0];
    this.saveToStorage();
    return removed;
  }

  /**
   * 日付順ソート（日付昇順）
   */
  sortRecords() {
    this.records.sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * 表示用レコード一覧（新しい日付順）
   */
  getDisplayRecords() {
    this.sortRecords();
    return [...this.records].reverse();
  }

  /**
   * 特定日付のレコード取得
   */
  getRecordByDate(date) {
    return this.records.find(r => r.date === date) || null;
  }

  /**
   * 憲法検証用テストデータ投入
   * （実査現金が200円不足「不足 -200円」、クレジット10,000円で手数料324円引き）
   */
  loadConstitutionalTestData() {
    const today = new Date().toISOString().substring(0, 10);
    this.saveRecord({
      date: today,
      changeFund: 50000,
      presaleAmount: 10000,
      actualCash: 59800, // あるべき金額 60,000円 に対し 59,800円 = 不足 -200円
      creditSales: 10000,
      feeRate: 3.24,     // 手数料 324円、純入金 9,676円
      memo: '【憲法検証】実査現金200円不足、クレジット10,000円（手数料324円）'
    });
  }

  /**
   * 全データ消去
   */
  clearAll() {
    this.records = [];
    this.saveToStorage();
  }
}

// グローバル公開（ブラウザ/Node/JXA環境対応）
if (typeof window !== 'undefined') {
  window.CashRegisterManager = CashRegisterManager;
}
if (typeof global !== 'undefined') {
  global.CashRegisterManager = CashRegisterManager;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CashRegisterManager;
}
