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
   * 金種別かんたん計算アシスト（電卓不要・枚数から金額集計）
   * @param {Object} counts - { 10000: 5, 5000: 1, 1000: 4, 500: 1, 100: 3, ... }
   * @returns {Object} { total: number, breakdown: Array<{ value: number, count: number, subtotal: number }> }
   */
  static calculateDenominations(counts = {}) {
    const DENOMINATIONS = [10000, 5000, 2000, 1000, 500, 100, 50, 10, 5, 1];
    let total = 0;
    const breakdown = DENOMINATIONS.map(val => {
      const count = Math.max(0, parseInt(counts[val], 10) || 0);
      const subtotal = val * count;
      total += subtotal;
      return { value: val, count, subtotal };
    });
    return { total, breakdown };
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
      isConfirmed: true,
      totalSales: cashResult.presaleAmount + creditResult.creditSales,
      totalNetExpected: cashResult.presaleAmount + creditResult.netCreditAmount,
      updatedAt: new Date().toISOString()
    };

    if (existingIndex >= 0) {
      recordData.createdAt = this.records[existingIndex].createdAt || new Date().toISOString();
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
   * 日付ごとの店舗総合サマリー取得（小口現金との統合）
   * @param {string} date YYYY-MM-DD
   * @param {Object} [pettyCashManager] 小口現金マネージャー
   */
  getComprehensiveSummary(date, pettyCashManager = null) {
    const record = this.getRecordByDate(date);
    
    // 小口現金データの抽出
    let pettyExpense = 0;
    let pettyIncome = 0;
    let pettyBalance = 0;
    let pettyTransactions = [];

    if (pettyCashManager && pettyCashManager.transactions) {
      pettyBalance = pettyCashManager.getCurrentBalance();
      pettyTransactions = pettyCashManager.transactions.filter(t => t.date === date);
      for (const tx of pettyTransactions) {
        if (tx.type === 'expense') {
          pettyExpense += tx.amount;
        } else if (tx.type === 'income') {
          pettyIncome += tx.amount;
        }
      }
    }

    if (!record) {
      return {
        date,
        hasRecord: false,
        isConfirmed: false,
        presaleAmount: 0,
        actualCash: 0,
        changeFund: 50000,
        discrepancy: 0,
        status: 'match',
        creditSales: 0,
        feeAmount: 0,
        netCreditAmount: 0,
        totalSales: 0,
        totalNetExpected: 0,
        pettyExpense,
        pettyIncome,
        pettyBalance,
        totalPhysicalCash: pettyBalance,
        pettyTransactions,
        memo: ''
      };
    }

    return {
      date,
      hasRecord: true,
      id: record.id,
      isConfirmed: Boolean(record.isConfirmed),
      presaleAmount: record.presaleAmount,
      actualCash: record.actualCash,
      changeFund: record.changeFund,
      expectedCash: record.expectedCash,
      discrepancy: record.discrepancy,
      status: record.status,
      statusLabel: record.statusLabel,
      creditSales: record.creditSales,
      feeRate: record.feeRate,
      feeAmount: record.feeAmount,
      netCreditAmount: record.netCreditAmount,
      totalSales: record.totalSales || (record.presaleAmount + record.creditSales),
      totalNetExpected: record.totalNetExpected || (record.presaleAmount + record.netCreditAmount),
      pettyExpense,
      pettyIncome,
      pettyBalance,
      totalPhysicalCash: record.actualCash + pettyBalance,
      pettyTransactions,
      memo: record.memo || '',
      updatedAt: record.updatedAt
    };
  }

  /**
   * 憲法検証用テストデータ投入（フェーズ2互換）
   */
  loadConstitutionalTestData() {
    const today = new Date().toISOString().substring(0, 10);
    this.saveRecord({
      date: today,
      changeFund: 50000,
      presaleAmount: 10000,
      actualCash: 59800, // 不足 -200円
      creditSales: 10000,
      feeRate: 3.24,     // 手数料 324円、純入金 9,676円
      memo: '【憲法検証】実査現金200円不足、クレジット10,000円（手数料324円）'
    });
  }

  /**
   * フェーズ3 外部検証用テストデータ投入（複数日：Day 1 & Day 2）
   * @param {Object} [pettyCashManager]
   */
  loadPhase3ConstitutionalTestData(pettyCashManager = null) {
    // 小口現金の検証データをセット
    if (pettyCashManager) {
      pettyCashManager.clearAll();
      pettyCashManager.addTransaction({
        date: '2026-09-17',
        type: 'income',
        category: '小口現金補充',
        amount: 10000,
        memo: '金庫より小口補充'
      });
      pettyCashManager.addTransaction({
        date: '2026-09-17',
        type: 'expense',
        category: '消耗品費',
        amount: 1000,
        memo: '事務用品購入'
      });
    }

    // レジ締めデータの投入
    this.clearAll();

    // Day 1: 2026-09-17
    this.saveRecord({
      date: '2026-09-17',
      changeFund: 50000,
      presaleAmount: 10000,
      actualCash: 59800, // 不足 -200円
      creditSales: 10000,
      feeRate: 3.24,     // 手数料 324円、純入金 9,676円
      memo: '【憲法検証 Day1】実査200円不足、消耗品費1,000円出金'
    });

    // Day 2: 2026-09-18
    this.saveRecord({
      date: '2026-09-18',
      changeFund: 50000,
      presaleAmount: 20000,
      actualCash: 70000, // 一致 ±0円
      creditSales: 5000,
      feeRate: 3.24,     // 手数料 162円、純入金 4,838円
      memo: '【憲法検証 Day2】レジ現金完全一致、クレジット5,000円'
    });
  }

  /**
   * 月次横断集計レポートの生成
   * @param {string} yearMonth "YYYY-MM"
   * @param {Object} [pettyCashManager] 小口現金マネージャー
   * @param {Object} [reconciliationManager] 調剤報酬消込マネージャー
   * @returns {Object} 月次集計結果
   */
  getMonthlyReport(yearMonth, pettyCashManager = null, reconciliationManager = null) {
    if (!yearMonth || !yearMonth.match(/^\d{4}-\d{2}$/)) {
      const now = new Date();
      yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }

    // 1. 対象月の日計締めレコード抽出（日付昇順）
    this.sortRecords();
    const daysInMonth = this.records.filter(r => r.date && r.date.startsWith(yearMonth + '-'));

    let totalPresaleAmount = 0;
    let totalActualCash = 0;
    let totalExpectedCash = 0;
    let totalDiscrepancy = 0;
    let totalCreditSales = 0;
    let totalFeeAmount = 0;
    let totalNetCreditAmount = 0;
    let matchDaysCount = 0;
    let shortageDaysCount = 0;
    let excessDaysCount = 0;
    const discrepancyRecords = [];

    daysInMonth.forEach(r => {
      totalPresaleAmount += (r.presaleAmount || 0);
      totalActualCash += (r.actualCash || 0);
      totalExpectedCash += (r.expectedCash || 0);
      totalDiscrepancy += (r.discrepancy || 0);
      totalCreditSales += (r.creditSales || 0);
      totalFeeAmount += (r.feeAmount || 0);
      totalNetCreditAmount += (r.netCreditAmount || 0);

      if (r.discrepancy === 0) {
        matchDaysCount += 1;
      } else if (r.discrepancy < 0) {
        shortageDaysCount += 1;
        discrepancyRecords.push({
          date: r.date,
          discrepancy: r.discrepancy,
          status: 'shortage',
          memo: r.memo || ''
        });
      } else {
        excessDaysCount += 1;
        discrepancyRecords.push({
          date: r.date,
          discrepancy: r.discrepancy,
          status: 'excess',
          memo: r.memo || ''
        });
      }
    });

    const grandTotalSales = totalPresaleAmount + totalCreditSales;
    const grandTotalNetExpected = totalPresaleAmount + totalNetCreditAmount;

    // 2. 小口現金の集計
    let pettyCashData = {
      startBalance: 0,
      monthlyIncome: 0,
      monthlyExpense: 0,
      endBalance: 0,
      transactions: [],
      expenseByCategory: {},
      count: 0
    };

    if (pettyCashManager && Array.isArray(pettyCashManager.transactions)) {
      const allTx = pettyCashManager.transactions;
      let startBalance = 0;
      let monthlyIncome = 0;
      let monthlyExpense = 0;
      const monthlyTx = [];
      const expenseByCategory = {};

      allTx.forEach(tx => {
        if (tx.date < yearMonth + '-01') {
          // 月初前
          if (tx.type === 'income') startBalance += tx.amount;
          else if (tx.type === 'expense') startBalance -= tx.amount;
        } else if (tx.date.startsWith(yearMonth + '-')) {
          // 当月中
          monthlyTx.push(tx);
          if (tx.type === 'income') {
            monthlyIncome += tx.amount;
          } else if (tx.type === 'expense') {
            monthlyExpense += tx.amount;
            expenseByCategory[tx.category] = (expenseByCategory[tx.category] || 0) + tx.amount;
          }
        }
      });

      pettyCashData = {
        startBalance,
        monthlyIncome,
        monthlyExpense,
        endBalance: startBalance + monthlyIncome - monthlyExpense,
        transactions: monthlyTx,
        expenseByCategory,
        count: monthlyTx.length
      };
    }

    // 3. 調剤報酬消込の集計
    let reconciliationData = {
      depositMonthRecords: [],      // 当月入金対象（2ヶ月前請求分等）
      billingMonthRecords: [],      // 当月請求分
      totalBilledAmount: 0,
      totalPaidAmount: 0,
      totalDiscrepancy: 0,
      unaccountedDiscrepancy: 0,
      totalRemandAmount: 0,
      unhandledRemandAmount: 0,
      rebillingRemandAmount: 0,
      resolvedRemandAmount: 0,
      hasData: false
    };

    if (reconciliationManager) {
      const records = reconciliationManager.monthlyRecords || [];
      const remandItems = reconciliationManager.remandItems || [];

      // 当月が入金月（depositMonth === yearMonth）のレコード
      const depositRecords = records.filter(r => r.depositMonth === yearMonth);
      // 当月が請求月（billingMonth === yearMonth）のレコード
      const billingRecords = records.filter(r => r.billingMonth === yearMonth);

      if (depositRecords.length > 0) {
        reconciliationData.hasData = true;
        reconciliationData.depositMonthRecords = depositRecords;
        depositRecords.forEach(rec => {
          reconciliationData.totalBilledAmount += (rec.billedAmount || 0);
          reconciliationData.totalPaidAmount += (rec.paidAmount || 0);
          reconciliationData.totalDiscrepancy += (rec.discrepancy || 0);

          // 関連する返戻明細
          const relItems = remandItems.filter(item => item.billingMonth === rec.billingMonth);
          relItems.forEach(item => {
            reconciliationData.totalRemandAmount += item.amount;
            if (item.status === 'unhandled') {
              reconciliationData.unhandledRemandAmount += item.amount;
            } else if (item.status === 'rebilling') {
              reconciliationData.rebillingRemandAmount += item.amount;
            } else if (item.status === 'resolved') {
              reconciliationData.resolvedRemandAmount += item.amount;
            }
          });
        });

        const shortage = Math.max(0, reconciliationData.totalBilledAmount - reconciliationData.totalPaidAmount);
        reconciliationData.unaccountedDiscrepancy = Math.max(0, shortage - reconciliationData.totalRemandAmount);
      } else if (billingRecords.length > 0) {
        // 参考表示用
        reconciliationData.hasData = true;
      }
      reconciliationData.billingMonthRecords = billingRecords;
    }

    return {
      yearMonth,
      closingDaysCount: daysInMonth.length,
      daysInMonth,
      // レジ現金
      totalPresaleAmount,
      totalActualCash,
      totalExpectedCash,
      totalDiscrepancy,
      matchDaysCount,
      shortageDaysCount,
      excessDaysCount,
      discrepancyRecords,
      // クレジット
      totalCreditSales,
      totalFeeAmount,
      totalNetCreditAmount,
      // 総売上 & 純入金
      grandTotalSales,
      grandTotalNetExpected,
      // 小口
      pettyCash: pettyCashData,
      // 調剤報酬
      reconciliation: reconciliationData
    };
  }

  /**
   * フェーズ6 月次集計 憲法検証用テストデータ投入
   * （暗算検証可能なデータ: 窓口3万+クレジット1.5万=総売上4.5万、過不足累計-200円、小口経費1,000円、調剤報酬差額-5万円）
   * @param {Object} [pettyCashManager]
   * @param {Object} [reconciliationManager]
   */
  loadMonthlyConstitutionalTestData(pettyCashManager = null, reconciliationManager = null) {
    // 1. 日計締め（フェーズ3の複数日データと同一基準）
    this.loadPhase3ConstitutionalTestData(pettyCashManager);

    // 2. 調剤報酬消込（2026-07請求分、入金予定月: 2026-09）
    if (reconciliationManager) {
      reconciliationManager.clearAll();
      reconciliationManager.saveMonthlyRecord({
        billingMonth: '2026-07',
        depositMonth: '2026-09',
        billedAmount: 1000000,
        paidAmount: 950000,
        memo: '【憲法検証】7月調剤分レセプト請求（9月入金差額-5万円）'
      });
      reconciliationManager.addRemandItem({
        billingMonth: '2026-07',
        patientChartId: 'A001',
        amount: 50000,
        reason: '保険証資格喪失・無効（期限切れ・転職等）',
        status: 'unhandled',
        handlingNote: '【憲法検証】7/12受診時保険証失効。新保険証確認中'
      });
    }
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
