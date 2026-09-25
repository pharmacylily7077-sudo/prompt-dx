/**
 * 調剤薬局 小口現金管理モジュール (js/petty-cash.js)
 * 理念: 守るためのシステム（現金のズレと使途不明金を根絶する）
 */

class PettyCashManager {
  static STORAGE_KEY = 'pharmacy_petty_cash_v1';

  constructor(customStorage = null) {
    this.customStorage = customStorage;
    this.listeners = [];
    this.transactions = this.loadFromStorage();
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
      const data = storage.getItem(PettyCashManager.STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      if (typeof console !== 'undefined' && console.error) console.error('LocalStorage読み込み失敗:', e);
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
        storage.setItem(PettyCashManager.STORAGE_KEY, JSON.stringify(this.transactions));
      }
      this.notifyListeners();
    } catch (e) {
      if (typeof console !== 'undefined' && console.error) console.error('LocalStorage保存失敗:', e);
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
    const summary = this.getSummary();
    this.listeners.forEach(fn => fn(this.transactions, summary));
  }

  /**
   * 取引追加
   * @param {Object} tx
   * @param {string} tx.date YYYY-MM-DD
   * @param {'expense'|'income'} tx.type
   * @param {string} tx.category
   * @param {number} tx.amount
   * @param {string} tx.memo
   */
  addTransaction({ date, type, category, amount, memo }) {
    // バリデーション
    const numAmount = parseInt(amount, 10);
    if (isNaN(numAmount) || numAmount <= 0) {
      throw new Error('金額は1円以上の整数を入力してください。');
    }
    if (!date) {
      throw new Error('日付を選択してください。');
    }
    if (!category) {
      throw new Error('科目を選択してください。');
    }

    const newTx = {
      id: 'tx_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      date,
      type, // 'income' or 'expense'
      category: category.trim(),
      amount: numAmount,
      memo: (memo || '').trim(),
      createdAt: new Date().toISOString()
    };

    this.transactions.push(newTx);
    // 日付順（古い順）にソートして保存
    this.sortTransactions();
    this.saveToStorage();
    return newTx;
  }

  /**
   * 取引削除
   */
  deleteTransaction(id) {
    const index = this.transactions.findIndex(t => t.id === id);
    if (index === -1) {
      throw new Error('対象の取引が見つかりません。');
    }
    const removed = this.transactions.splice(index, 1)[0];
    this.saveToStorage();
    return removed;
  }

  /**
   * 日付順ソート（日付昇順、同一日は登録順）
   */
  sortTransactions() {
    this.transactions.sort((a, b) => {
      if (a.date !== b.date) {
        return a.date.localeCompare(b.date);
      }
      return (a.createdAt || '').localeCompare(b.createdAt || '');
    });
  }

  /**
   * 現在の全体残高を計算
   * 現在残高 = 総入金額 - 総出金額
   */
  getCurrentBalance() {
    let balance = 0;
    for (const tx of this.transactions) {
      if (tx.type === 'income') {
        balance += tx.amount;
      } else if (tx.type === 'expense') {
        balance -= tx.amount;
      }
    }
    return balance;
  }

  /**
   * 集計サマリー（現在残高、当月入金合計、当月出金合計、件数）
   * @param {string} [yearMonth] YYYY-MM 形式（指定なしなら今月）
   */
  getSummary(yearMonth) {
    const targetMonth = yearMonth || new Date().toISOString().substring(0, 7);
    let currentBalance = this.getCurrentBalance();
    let monthlyIncome = 0;
    let monthlyExpense = 0;
    let monthlyCount = 0;

    for (const tx of this.transactions) {
      if (tx.date && tx.date.startsWith(targetMonth)) {
        monthlyCount++;
        if (tx.type === 'income') {
          monthlyIncome += tx.amount;
        } else if (tx.type === 'expense') {
          monthlyExpense += tx.amount;
        }
      }
    }

    return {
      currentBalance,
      monthlyIncome,
      monthlyExpense,
      monthlyCount,
      targetMonth
    };
  }

  /**
   * 取引一覧（表示用: 各行にその時点での差引残高を付与し、最新日付順で返す）
   */
  getDisplayList() {
    this.sortTransactions();
    let runningBalance = 0;

    // 古い順に累積残高を計算
    const listWithBalance = this.transactions.map(tx => {
      if (tx.type === 'income') {
        runningBalance += tx.amount;
      } else if (tx.type === 'expense') {
        runningBalance -= tx.amount;
      }
      return {
        ...tx,
        balanceAfter: runningBalance
      };
    });

    // 表示用には新しい順（降順）に並べ替えて返す
    return listWithBalance.reverse();
  }

  /**
   * 動作確認用サンプルデータ投入
   * （10,000円補充 → 1,000円消耗品費出金 → 残高9,000円）
   */
  loadConstitutionalTestData() {
    this.transactions = [];
    const today = new Date().toISOString().substring(0, 10);
    
    // 1. 補充 10,000円
    this.transactions.push({
      id: 'tx_test_init',
      date: today,
      type: 'income',
      category: '小口現金補充',
      amount: 10000,
      memo: '【サンプル】初期補充金',
      createdAt: new Date(Date.now() - 60000).toISOString()
    });

    // 2. 出金 1,000円（消耗品費）
    this.transactions.push({
      id: 'tx_test_expense',
      date: today,
      type: 'expense',
      category: '消耗品費',
      amount: 1000,
      memo: '【サンプル】事務用品（ボールペン等）購入',
      createdAt: new Date().toISOString()
    });

    this.saveToStorage();
  }

  /**
   * データ全消去
   */
  clearAll() {
    this.transactions = [];
    this.saveToStorage();
  }
}

// グローバル公開（ブラウザ/Node/JXA環境対応）
if (typeof window !== 'undefined') {
  window.PettyCashManager = PettyCashManager;
}
if (typeof global !== 'undefined') {
  global.PettyCashManager = PettyCashManager;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PettyCashManager;
}
