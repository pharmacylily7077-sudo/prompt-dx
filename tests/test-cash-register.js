/**
 * レジ現金＆クレジット決済機能 自動テストスクリプト (tests/test-cash-register.js)
 * 厳格に検証: 実査現金200円不足（「不足 -200円」）およびクレジット10,000円の手数料324円引きを検証
 */

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

require('../js/cash-register.js');

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ テスト失敗: ${message}`);
    process.exit(1);
  }
  console.log(`✅ ${message}`);
}

console.log('==============================================');
console.log('調剤薬局システム フェーズ2: レジ現金＆クレジット決済 自動テスト');
console.log('==============================================\n');

// 1. 初期状態
const manager = new global.CashRegisterManager();
manager.clearAll();
assert(manager.records.length === 0, '初期状態の締めデータ件数が0件であること');

// 2. レジ現金照合: 一致パターン
console.log('\n--- ステップ1: レジ現金照合（一致パターン） ---');
const matchCalc = global.CashRegisterManager.calculateCashDiscrepancy(50000, 10000, 60000);
assert(matchCalc.expectedCash === 60000, 'つり銭5万+売上1万であるべき現金が60,000円であること');
assert(matchCalc.discrepancy === 0, '実査6万で過不足額が0円であること');
assert(matchCalc.status === 'match', 'ステータスが "match" であること');

// 3. レジ現金照合: 厳格検証（200円不足パターン）
console.log('\n--- ステップ2: 【厳格検証】レジ現金照合（200円不足パターン） ---');
const shortageCalc = global.CashRegisterManager.calculateCashDiscrepancy(50000, 10000, 59800);
assert(shortageCalc.discrepancy === -200, '【厳格検証】実査59,800円で過不足額が -200円 であること');
assert(shortageCalc.status === 'shortage', 'ステータスが "shortage"（不足）であること');
assert(shortageCalc.statusLabel.includes('不足') && shortageCalc.statusLabel.includes('-200'), '表示ラベルに「不足」と「-200」が含まれること');

// 4. レジ現金照合: 過剰パターン
console.log('\n--- ステップ3: レジ現金照合（過剰パターン） ---');
const excessCalc = global.CashRegisterManager.calculateCashDiscrepancy(50000, 10000, 60100);
assert(excessCalc.discrepancy === 100, '実査60,100円で過不足額が +100円 であること');
assert(excessCalc.status === 'excess', 'ステータスが "excess"（過剰）であること');

// 5. クレジット決済: 厳格検証（売上10,000円・手数料率3.24%）
console.log('\n--- ステップ4: 【厳格検証】クレジット手数料・純入金計算 ---');
const creditCalc = global.CashRegisterManager.calculateCredit(10000, 3.24);
assert(creditCalc.feeAmount === 324, '【厳格検証】売上10,000円の手数料が324円（10,000 × 0.0324）であること');
assert(creditCalc.netCreditAmount === 9676, '【厳格検証】差引入金見込額が9,676円（10,000 - 324）であること');

// 6. クレジット決済: 四捨五入検証
console.log('\n--- ステップ5: クレジット手数料の四捨五入検証 ---');
// 1,000円 × 3.24% = 32.4円 → 32円
const roundDownCalc = global.CashRegisterManager.calculateCredit(1000, 3.24);
assert(roundDownCalc.feeAmount === 32, '32.4円が四捨五入で32円に丸められること');
assert(roundDownCalc.netCreditAmount === 968, '差引入金見込額が968円であること');

// 1,500円 × 3.24% = 48.6円 → 49円
const roundUpCalc = global.CashRegisterManager.calculateCredit(1500, 3.24);
assert(roundUpCalc.feeAmount === 49, '48.6円が四捨五入で49円に丸められること');
assert(roundUpCalc.netCreditAmount === 1451, '差引入金見込額が1,451円であること');

// 7. 保存と永続化
console.log('\n--- ステップ6: レコード保存と永続化の検証 ---');
const savedRecord = manager.saveRecord({
  date: '2026-09-17',
  changeFund: 50000,
  presaleAmount: 10000,
  actualCash: 59800,
  creditSales: 10000,
  feeRate: 3.24,
  memo: 'サンプルデータ'
});
assert(savedRecord.discrepancy === -200, '保存された過不足額が -200円 であること');
assert(savedRecord.feeAmount === 324, '保存された手数料が 324円 であること');
assert(savedRecord.netCreditAmount === 9676, '保存された純入金見込額が 9,676円 であること');

// 再インスタンス化
const reloaded = new global.CashRegisterManager();
assert(reloaded.records.length === 1, '別インスタンスで1件保持されていること');
const found = reloaded.getRecordByDate('2026-09-17');
assert(found && found.discrepancy === -200, '再読み込み後も -200円 不足が保持されていること');

// 8. 同一日付更新テスト
console.log('\n--- ステップ7: 同一日付の上書き更新検証 ---');
reloaded.saveRecord({
  date: '2026-09-17',
  changeFund: 50000,
  presaleAmount: 10000,
  actualCash: 60000, // 不足解消
  creditSales: 10000,
  feeRate: 3.24,
  memo: '更新後'
});
assert(reloaded.records.length === 1, '同一日付更新で件数が1件のままであること');
assert(reloaded.getRecordByDate('2026-09-17').discrepancy === 0, '更新後の過不足額が0円であること');

// 9. 削除テスト
console.log('\n--- ステップ8: 削除の検証 ---');
reloaded.deleteRecord(found.id);
assert(reloaded.records.length === 0, '削除後に0件になること');

console.log('\n==============================================');
console.log('🎉 フェーズ2 自動テストに完全合格しました！');
console.log('==============================================\n');
