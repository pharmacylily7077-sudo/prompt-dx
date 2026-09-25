/**
 * 小口現金機能 自動テストスクリプト (tests/test-petty-cash.js)
 * 厳格に検証: 暗算できるキリの良い数字（10,000円補充 → 1,000円出金 → 残高9,000円）を検証
 */

// LocalStorageモック
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => { store[key] = value.toString(); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { store = {}; }
  };
})();

global.localStorage = localStorageMock;
global.window = global;

// petty-cash.js を読み込む
require('../js/petty-cash.js');

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ テスト失敗: ${message}`);
    process.exit(1);
  }
  console.log(`✅ ${message}`);
}

console.log('==============================================');
console.log('調剤薬局システム フェーズ1: 小口現金 自動検証テスト');
console.log('==============================================\n');

// 1. 初期化テスト
const manager = new global.PettyCashManager();
manager.clearAll();
assert(manager.getCurrentBalance() === 0, '初期状態の残高が0円であること');

// 2. 動作確認シナリオ: 10,000円補充
console.log('\n--- ステップ1: 10,000円の小口補充 ---');
const incomeTx = manager.addTransaction({
  date: '2026-09-17',
  type: 'income',
  category: '小口現金補充',
  amount: 10000,
  memo: '金庫より小口補充'
});
assert(incomeTx.amount === 10000, '登録された補充額が10,000円であること');
assert(manager.getCurrentBalance() === 10000, '現在残高が10,000円であること');

// 3. 動作確認シナリオ: 1,000円消耗品費出金
console.log('\n--- ステップ2: 1,000円の消耗品費出金 ---');
const expenseTx = manager.addTransaction({
  date: '2026-09-17',
  type: 'expense',
  category: '消耗品費',
  amount: 1000,
  memo: 'ボールペン購入'
});
assert(expenseTx.amount === 1000, '登録された出金額が1,000円であること');
assert(manager.getCurrentBalance() === 9000, '現在残高が9,000円（10,000 - 1,000）であること');

// 4. サマリー集計テスト
console.log('\n--- ステップ3: サマリー集計の検証 ---');
const summary = manager.getSummary('2026-09');
assert(summary.currentBalance === 9000, 'サマリーの現在残高が9,000円であること');
assert(summary.monthlyIncome === 10000, '当月補充合計が10,000円であること');
assert(summary.monthlyExpense === 1000, '当月出金合計が1,000円であること');
assert(summary.monthlyCount === 2, '当月件数が2件であること');

// 5. 表示用リスト（時系列累積残高）テスト
console.log('\n--- ステップ4: 表示一覧（時系列累積残高）の検証 ---');
const displayList = manager.getDisplayList();
assert(displayList.length === 2, '表示リストが2件であること');
// displayListは新しい順（降順）
assert(displayList[0].id === expenseTx.id, '最新の取引が出金取引であること');
assert(displayList[0].balanceAfter === 9000, '出金後の累積残高が9,000円であること');
assert(displayList[1].id === incomeTx.id, '古い方の取引が補充取引であること');
assert(displayList[1].balanceAfter === 10000, '補充直後の累積残高が10,000円であること');

// 6. LocalStorage再読み込み（永続化）テスト
console.log('\n--- ステップ5: LocalStorage再読み込み（永続化）の検証 ---');
const newManagerInstance = new global.PettyCashManager();
assert(newManagerInstance.getCurrentBalance() === 9000, '再インスタンス化後も残高9,000円が維持されること');
assert(newManagerInstance.transactions.length === 2, '再インスタンス化後も2件の取引が保持されること');

// 7. 削除と再計算テスト
console.log('\n--- ステップ6: 取引削除と残高再計算の検証 ---');
newManagerInstance.deleteTransaction(expenseTx.id);
assert(newManagerInstance.getCurrentBalance() === 10000, '出金取引を削除すると残高が10,000円に戻ること');

console.log('\n==============================================');
console.log('🎉 すべての自動テストに完全合格しました！');
console.log('==============================================\n');
