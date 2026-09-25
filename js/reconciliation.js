/**
 * 調剤薬局 調剤報酬消込・返戻追跡モジュール (js/reconciliation.js)
 * 理念: 守るためのシステム（2ヶ月先振込の差額を可視化し、請求放置・返戻取りこぼしを撲滅する）
 * プライバシー保護厳守: 個人情報（氏名・処方等）は一切保持せず、カルテ番号のみで管理する。
 */

class ReconciliationManager {
  static STORAGE_KEY = 'pharmacy_reconciliation_v1';

  // 返戻・保留のステータス定数
  static STATUS = {
    UNHANDLED: 'unhandled',   // 未対応
    REBILLING: 'rebilling',   // 再請求中
    RESOLVED: 'resolved'      // 入金済/解決
  };

  // ステータス表示情報
  static STATUS_MAP = {
    unhandled: { label: '未対応', badgeClass: 'badge-status-unhandled', icon: '⚠️' },
    rebilling: { label: '再請求中', badgeClass: 'badge-status-rebilling', icon: '🔄' },
    resolved: { label: '入金済/解決', badgeClass: 'badge-status-resolved', icon: '✅' }
  };

  // 代表的な事由カテゴリ
  static REASON_CATEGORIES = [
    '保険証資格喪失・無効（期限切れ・転職等）',
    '疑義照会・処方内容確認保留',
    '保険者番号・記号番号誤り',
    '公費受給者番号不整合',
    '患者負担割合不整合',
    '特定器材・薬剤適応外審査',
    'その他'
  ];

  constructor(customStorage = null) {
    this.customStorage = customStorage;
    this.listeners = [];
    const loaded = this.loadFromStorage();
    this.monthlyRecords = loaded.monthlyRecords || [];
    this.remandItems = loaded.remandItems || [];
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
      if (!storage) return { monthlyRecords: [], remandItems: [] };
      const data = storage.getItem(ReconciliationManager.STORAGE_KEY);
      if (!data) return { monthlyRecords: [], remandItems: [] };
      const parsed = JSON.parse(data);
      return {
        monthlyRecords: Array.isArray(parsed.monthlyRecords) ? parsed.monthlyRecords : [],
        remandItems: Array.isArray(parsed.remandItems) ? parsed.remandItems : []
      };
    } catch (e) {
      if (typeof console !== 'undefined' && console.error) console.error('調剤報酬消込LocalStorage読み込み失敗:', e);
      return { monthlyRecords: [], remandItems: [] };
    }
  }

  /**
   * LocalStorageへ保存
   */
  saveToStorage() {
    try {
      const storage = this._getStorage();
      if (storage) {
        storage.setItem(ReconciliationManager.STORAGE_KEY, JSON.stringify({
          monthlyRecords: this.monthlyRecords,
          remandItems: this.remandItems
        }));
      }
      this.notifyListeners();
    } catch (e) {
      if (typeof console !== 'undefined' && console.error) console.error('調剤報酬消込LocalStorage保存失敗:', e);
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
    this.listeners.forEach(fn => fn({
      monthlyRecords: this.monthlyRecords,
      remandItems: this.remandItems
    }));
  }

  // ==========================================
  // 計算ロジック（静的メソッド）
  // ==========================================

  /**
   * 請求と入金の差額計算
   * @param {number} billedAmount 請求総額（円）
   * @param {number} paidAmount 入金総額（円）
   * @returns {Object} 差額計算結果
   */
  static calculateDiscrepancy(billedAmount, paidAmount) {
    const billed = Math.max(0, parseInt(billedAmount, 10) || 0);
    const paid = Math.max(0, parseInt(paidAmount, 10) || 0);
    const discrepancy = paid - billed; // 入金 - 請求
    const shortageAmount = Math.max(0, billed - paid); // 不足分

    let status = 'match';
    let statusLabel = '請求・入金一致（±0円）';

    if (discrepancy < 0) {
      status = 'shortage';
      statusLabel = `入金不足（差額 -¥${Math.abs(discrepancy).toLocaleString('ja-JP')}）`;
    } else if (discrepancy > 0) {
      status = 'excess';
      statusLabel = `入金過剰（差額 +¥${discrepancy.toLocaleString('ja-JP')}）`;
    }

    return {
      billedAmount: billed,
      paidAmount: paid,
      discrepancy,
      shortageAmount,
      status,
      statusLabel
    };
  }

  /**
   * 請求月の2ヶ月後（入金予定月）を計算
   * @param {string} billingMonth "YYYY-MM"
   * @returns {string} "YYYY-MM"
   */
  static calculateExpectedDepositMonth(billingMonth) {
    if (!billingMonth || !billingMonth.match(/^\d{4}-\d{2}$/)) return '';
    const [yearStr, monthStr] = billingMonth.split('-');
    let year = parseInt(yearStr, 10);
    let month = parseInt(monthStr, 10) + 2;
    if (month > 12) {
      month -= 12;
      year += 1;
    }
    return `${year}-${String(month).padStart(2, '0')}`;
  }

  /**
   * 個人情報非保持バリデーション
   * 氏名（漢字・ひらがな・カタカナ等）がカルテ番号に含まれていないか厳格チェック
   */
  static validatePatientChartId(chartId) {
    if (!chartId || typeof chartId !== 'string') {
      throw new Error('カルテ番号は必須項目です。');
    }
    const trimmed = chartId.trim();
    if (trimmed.length === 0) {
      throw new Error('カルテ番号を入力してください。');
    }
    // 日本語（漢字・ひらがな・カタカナ）が含まれている場合は個人情報保護のためエラー
    const containsJapanese = /[\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\uFF00-\uFFEF\u4E00-\u9FAF]/;
    if (containsJapanese.test(trimmed)) {
      throw new Error('【個人情報保護ルール】患者氏名・個人情報は入力できません。カルテ番号（半角英数・記号）のみを入力してください。');
    }
    return trimmed;
  }

  // ==========================================
  // 請求月サマリー CRUD
  // ==========================================

  /**
   * 請求月サマリーレコードの取得
   * @param {string} billingMonth "YYYY-MM"
   */
  getMonthlyRecord(billingMonth) {
    return this.monthlyRecords.find(r => r.billingMonth === billingMonth) || null;
  }

  /**
   * 請求月サマリーレコードの保存・更新
   */
  saveMonthlyRecord(data) {
    if (!data.billingMonth || !data.billingMonth.match(/^\d{4}-\d{2}$/)) {
      throw new Error('請求年月（YYYY-MM形式）を正しく指定してください。');
    }

    const billedAmount = Math.max(0, parseInt(data.billedAmount, 10) || 0);
    const paidAmount = Math.max(0, parseInt(data.paidAmount, 10) || 0);
    const calc = ReconciliationManager.calculateDiscrepancy(billedAmount, paidAmount);

    const depositMonth = data.depositMonth || ReconciliationManager.calculateExpectedDepositMonth(data.billingMonth);

    const record = {
      id: data.id || 'rec_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      billingMonth: data.billingMonth,
      depositMonth: depositMonth,
      billedAmount: billedAmount,
      paidAmount: paidAmount,
      discrepancy: calc.discrepancy,
      shortageAmount: calc.shortageAmount,
      status: calc.status,
      memo: (data.memo || '').trim(),
      updatedAt: new Date().toISOString()
    };

    const existingIndex = this.monthlyRecords.findIndex(r => r.billingMonth === data.billingMonth);
    if (existingIndex >= 0) {
      record.id = this.monthlyRecords[existingIndex].id;
      record.createdAt = this.monthlyRecords[existingIndex].createdAt || record.updatedAt;
      this.monthlyRecords[existingIndex] = record;
    } else {
      record.createdAt = record.updatedAt;
      this.monthlyRecords.push(record);
    }

    // 請求月の降順でソート
    this.monthlyRecords.sort((a, b) => b.billingMonth.localeCompare(a.billingMonth));
    this.saveToStorage();
    return record;
  }

  /**
   * 請求月サマリーレコードの削除
   */
  deleteMonthlyRecord(billingMonth) {
    this.monthlyRecords = this.monthlyRecords.filter(r => r.billingMonth !== billingMonth);
    this.saveToStorage();
  }

  // ==========================================
  // 返戻・保留明細 CRUD
  // ==========================================

  /**
   * 返戻・保留案件の追加
   */
  addRemandItem(data) {
    if (!data.billingMonth || !data.billingMonth.match(/^\d{4}-\d{2}$/)) {
      throw new Error('対象請求月を指定してください。');
    }

    const patientChartId = ReconciliationManager.validatePatientChartId(data.patientChartId);
    const amount = parseInt(data.amount, 10);
    if (isNaN(amount) || amount <= 0) {
      throw new Error('返戻・保留金額は1円以上の正の整数を入力してください。');
    }

    const reason = (data.reason || 'その他').trim();
    const status = Object.values(ReconciliationManager.STATUS).includes(data.status)
      ? data.status
      : ReconciliationManager.STATUS.UNHANDLED;

    const item = {
      id: 'rem_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      billingMonth: data.billingMonth,
      patientChartId: patientChartId,
      amount: amount,
      reason: reason,
      status: status,
      handlingNote: (data.handlingNote || '').trim(),
      resolvedDate: status === ReconciliationManager.STATUS.RESOLVED ? (data.resolvedDate || new Date().toISOString().substring(0, 10)) : null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.remandItems.unshift(item);
    this.saveToStorage();
    return item;
  }

  /**
   * 返戻・保留アイテムの取得（ID指定）
   */
  getRemandItem(itemId) {
    return this.remandItems.find(item => item.id === itemId) || null;
  }

  /**
   * 返戻・保留ステータスの変更
   * 「未対応」→「再請求中」→「入金済/解決」
   */
  updateRemandStatus(itemId, newStatus, handlingNote = null) {
    const item = this.getRemandItem(itemId);
    if (!item) {
      throw new Error('対象の返戻案件が見つかりません。');
    }
    if (!Object.values(ReconciliationManager.STATUS).includes(newStatus)) {
      throw new Error('無効なステータスです。');
    }

    item.status = newStatus;
    item.updatedAt = new Date().toISOString();

    if (handlingNote !== null) {
      item.handlingNote = handlingNote.trim();
    }

    if (newStatus === ReconciliationManager.STATUS.RESOLVED) {
      item.resolvedDate = new Date().toISOString().substring(0, 10);
    } else {
      item.resolvedDate = null;
    }

    this.saveToStorage();
    return item;
  }

  /**
   * 返戻・保留アイテムの更新（全項目）
   */
  updateRemandItem(itemId, data) {
    const item = this.getRemandItem(itemId);
    if (!item) {
      throw new Error('対象の返戻案件が見つかりません。');
    }

    if (data.patientChartId) {
      item.patientChartId = ReconciliationManager.validatePatientChartId(data.patientChartId);
    }
    if (data.amount !== undefined) {
      const amt = parseInt(data.amount, 10);
      if (isNaN(amt) || amt <= 0) throw new Error('返戻金額は1円以上を入力してください。');
      item.amount = amt;
    }
    if (data.reason) {
      item.reason = data.reason.trim();
    }
    if (data.handlingNote !== undefined) {
      item.handlingNote = data.handlingNote.trim();
    }
    if (data.status && Object.values(ReconciliationManager.STATUS).includes(data.status)) {
      item.status = data.status;
      if (data.status === ReconciliationManager.STATUS.RESOLVED && !item.resolvedDate) {
        item.resolvedDate = new Date().toISOString().substring(0, 10);
      } else if (data.status !== ReconciliationManager.STATUS.RESOLVED) {
        item.resolvedDate = null;
      }
    }

    item.updatedAt = new Date().toISOString();
    this.saveToStorage();
    return item;
  }

  /**
   * 返戻・保留アイテムの削除
   */
  deleteRemandItem(itemId) {
    this.remandItems = this.remandItems.filter(item => item.id !== itemId);
    this.saveToStorage();
  }

  // ==========================================
  // 集計・消込突合レポート
  // ==========================================

  /**
   * 指定請求月の総合消込サマリー
   * @param {string} billingMonth "YYYY-MM"
   */
  getMonthlySummaryWithRemands(billingMonth) {
    const monthly = this.getMonthlyRecord(billingMonth) || {
      billingMonth: billingMonth,
      depositMonth: ReconciliationManager.calculateExpectedDepositMonth(billingMonth),
      billedAmount: 0,
      paidAmount: 0,
      discrepancy: 0,
      shortageAmount: 0,
      status: 'match',
      memo: ''
    };

    const items = this.remandItems.filter(item => item.billingMonth === billingMonth);

    // 返戻金額の集計
    let totalRemandAmount = 0;
    let unhandledCount = 0;
    let unhandledAmount = 0;
    let rebillingCount = 0;
    let rebillingAmount = 0;
    let resolvedCount = 0;
    let resolvedAmount = 0;

    items.forEach(item => {
      totalRemandAmount += item.amount;
      if (item.status === ReconciliationManager.STATUS.UNHANDLED) {
        unhandledCount += 1;
        unhandledAmount += item.amount;
      } else if (item.status === ReconciliationManager.STATUS.REBILLING) {
        rebillingCount += 1;
        rebillingAmount += item.amount;
      } else if (item.status === ReconciliationManager.STATUS.RESOLVED) {
        resolvedCount += 1;
        resolvedAmount += item.amount;
      }
    });

    // 差額との突合判定
    // 請求不足額（billedAmount - paidAmount）に対して、返戻明細がどれだけ特定できているか
    const shortage = monthly.shortageAmount;
    const unaccountedAmount = shortage - totalRemandAmount;

    let reconciliationStatus = 'none'; // 差額なし
    let reconciliationMessage = '差額なし（入金一致）';

    if (shortage > 0) {
      if (unaccountedAmount === 0) {
        reconciliationStatus = 'fully_explained';
        reconciliationMessage = `差額 ¥${shortage.toLocaleString('ja-JP')} は返戻・保留明細（計¥${totalRemandAmount.toLocaleString('ja-JP')}）と完全一致・特定済`;
      } else if (unaccountedAmount > 0) {
        reconciliationStatus = 'partially_explained';
        reconciliationMessage = `差額 ¥${shortage.toLocaleString('ja-JP')} のうち、¥${unaccountedAmount.toLocaleString('ja-JP')} が原因未特定（要調査）`;
      } else {
        reconciliationStatus = 'remand_exceeds';
        reconciliationMessage = `登録返戻額（¥${totalRemandAmount.toLocaleString('ja-JP')}）が差額（¥${shortage.toLocaleString('ja-JP')}）を超過しています`;
      }
    }

    return {
      billingMonth,
      depositMonth: monthly.depositMonth,
      billedAmount: monthly.billedAmount,
      paidAmount: monthly.paidAmount,
      discrepancy: monthly.discrepancy,
      shortageAmount: monthly.shortageAmount,
      memo: monthly.memo,
      items,
      totalRemandCount: items.length,
      totalRemandAmount,
      unhandledCount,
      unhandledAmount,
      rebillingCount,
      rebillingAmount,
      resolvedCount,
      resolvedAmount,
      unaccountedAmount,
      reconciliationStatus,
      reconciliationMessage
    };
  }

  // ==========================================
  // フェーズ4 動作確認サンプルデータ投入
  // ==========================================

  /**
   * 動作確認用サンプルデータ投入
   * 請求1,000,000円、入金950,000円（差額 -50,000円）
   * 返戻50,000円（カルテ番号: A001, 事由: 保険証無効, 初期ステータス: 未対応）
   */
  loadPhase4ConstitutionalTestData() {
    this.clearAll();

    // 1. 2026-07 請求分サマリー（9月入金）
    this.saveMonthlyRecord({
      billingMonth: '2026-07',
      depositMonth: '2026-09',
      billedAmount: 1000000,
      paidAmount: 950000,
      memo: '【サンプル】7月調剤分レセプト請求（9月入金差額-5万円）'
    });

    // 2. 返戻明細 A001
    this.addRemandItem({
      billingMonth: '2026-07',
      patientChartId: 'A001',
      amount: 50000,
      reason: '保険証資格喪失・無効（期限切れ・転職等）',
      status: ReconciliationManager.STATUS.UNHANDLED,
      handlingNote: '【サンプル】7/12受診時保険証失効。新保険証確認中'
    });
  }

  /**
   * 全データ消去
   */
  clearAll() {
    this.monthlyRecords = [];
    this.remandItems = [];
    this.saveToStorage();
  }
}

// グローバル公開（ブラウザ/Node/JXA環境対応）
if (typeof window !== 'undefined') {
  window.ReconciliationManager = ReconciliationManager;
}
if (typeof global !== 'undefined') {
  global.ReconciliationManager = ReconciliationManager;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ReconciliationManager;
}
