// macOS JXA (JavaScript for Automation) テストランナー
function run() {
  // LocalStorage モック
  var store = {};
  var localStorage = {
    getItem: function(k) { return store[k] || null; },
    setItem: function(k, v) { store[k] = String(v); },
    removeItem: function(k) { delete store[k]; },
    clear: function() { store = {}; }
  };

  // グローバル環境設定
  var console = { log: function() {}, error: function() {}, warn: function() {} };
  var window = { localStorage: localStorage, console: console };

  // ソース読み込み
  var currentDir = $.NSFileManager.defaultManager.currentDirectoryPath.js;
  var pettyCashCode = $.NSString.stringWithContentsOfFileEncodingError(currentDir + '/js/petty-cash.js', $.NSUTF8StringEncoding, null).js;
  var cashRegisterCode = $.NSString.stringWithContentsOfFileEncodingError(currentDir + '/js/cash-register.js', $.NSUTF8StringEncoding, null).js;

  var PettyCashManager = eval(pettyCashCode + '; PettyCashManager;');
  var CashRegisterManager = eval(cashRegisterCode + '; CashRegisterManager;');

  var results = [];
  function assert(name, condition, detail) {
    if (condition) {
      results.push("✅ PASS: " + name + (detail ? " (" + detail + ")" : ""));
    } else {
      results.push("❌ FAIL: " + name + (detail ? " (" + detail + ")" : ""));
      throw new Error("Test Failed: " + name);
    }
  }

  try {
    results.push("=== 【フェーズ1: 小口現金管理 テスト】 ===");
    var pManager = new PettyCashManager(localStorage);
    pManager.clearAll();

    // 1. 初期残高0円
    assert("フェーズ1-1: 初期状態の残高が0円であること", pManager.getCurrentBalance() === 0, "現在: " + pManager.getCurrentBalance());

    // 2. 補充 10,000円
    var inc = pManager.addTransaction({
      date: "2026-09-17",
      type: "income",
      category: "小口現金補充",
      amount: 10000,
      memo: "金庫より小口補充"
    });
    assert("フェーズ1-2: 補充データが10,000円で登録されること", inc.amount === 10000);
    assert("フェーズ1-3: 補充後の現在残高が10,000円であること", pManager.getCurrentBalance() === 10000);

    // 3. 出金 1,000円（消耗品費）
    var exp = pManager.addTransaction({
      date: "2026-09-17",
      type: "expense",
      category: "消耗品費",
      amount: 1000,
      memo: "事務用品購入"
    });
    assert("フェーズ1-4: 出金データが1,000円で登録されること", exp.amount === 1000);
    assert("フェーズ1-5: 【憲法検証】残高が暗算通りの9,000円（10,000 - 1,000）であること", pManager.getCurrentBalance() === 9000);

    // 4. サマリー集計
    var pSummary = pManager.getSummary("2026-09");
    assert("フェーズ1-6: 当月補充合計が10,000円であること", pSummary.monthlyIncome === 10000);
    assert("フェーズ1-7: 当月出金合計が1,000円であること", pSummary.monthlyExpense === 1000);
    assert("フェーズ1-8: 当月取引件数が2件であること", pSummary.monthlyCount === 2);

    // 5. 表示一覧・差引残高
    var pList = pManager.getDisplayList();
    assert("フェーズ1-9: 一覧が2件であること", pList.length === 2);
    assert("フェーズ1-10: 最新出金行の残高が9,000円であること", pList[0].balanceAfter === 9000);
    assert("フェーズ1-11: 補充行の残高が10,000円であること", pList[1].balanceAfter === 10000);

    // 6. 永続化（LocalStorageから再読み込み）
    var pReloaded = new PettyCashManager(localStorage);
    assert("フェーズ1-12: 再インスタンス化後も残高9,000円が維持されること", pReloaded.getCurrentBalance() === 9000);
    assert("フェーズ1-13: 再インスタンス化後も2件の取引が保持されること", pReloaded.transactions.length === 2);

    // 7. 削除と再計算
    pReloaded.deleteTransaction(exp.id);
    assert("フェーズ1-14: 出金削除で残高が10,000円に戻ること", pReloaded.getCurrentBalance() === 10000);

    results.push("\n=== 【フェーズ2: レジ現金照合＆クレジット決済 テスト】 ===");
    var rManager = new CashRegisterManager(localStorage);
    rManager.clearAll();

    // 1. 初期状態
    assert("フェーズ2-1: 初期状態の締めレコードが0件であること", rManager.records.length === 0);

    // 2. レジ現金照合: 一致
    var matchCalc = CashRegisterManager.calculateCashDiscrepancy(50000, 10000, 60000);
    assert("フェーズ2-2: あるべき現金が60,000円（つり銭5万+売上1万）であること", matchCalc.expectedCash === 60000);
    assert("フェーズ2-3: 実査6万円で過不足額が0円（一致）であること", matchCalc.discrepancy === 0 && matchCalc.status === "match");

    // 3. 【憲法検証】レジ現金照合: 実査現金200円不足
    var shortageCalc = CashRegisterManager.calculateCashDiscrepancy(50000, 10000, 59800);
    assert("フェーズ2-4: 【憲法検証】実査59,800円で過不足額が -200円（不足）であること", shortageCalc.discrepancy === -200 && shortageCalc.status === "shortage");
    assert("フェーズ2-5: 不足表示ラベルに「不足」と「-200」が含まれること", shortageCalc.statusLabel.indexOf("不足") >= 0 && shortageCalc.statusLabel.indexOf("-200") >= 0);

    // 4. レジ現金照合: 過剰
    var excessCalc = CashRegisterManager.calculateCashDiscrepancy(50000, 10000, 60100);
    assert("フェーズ2-6: 実査60,100円で過不足額が +100円（過剰）であること", excessCalc.discrepancy === 100 && excessCalc.status === "excess");

    // 5. 【憲法検証】クレジット手数料・純入金計算（売上10,000円、手数料率3.24%）
    var creditCalc = CashRegisterManager.calculateCredit(10000, 3.24);
    assert("フェーズ2-7: 【憲法検証】クレジット売上10,000円の手数料が324円であること", creditCalc.feeAmount === 324);
    assert("フェーズ2-8: 【憲法検証】差引入金見込額が9,676円（10,000 - 324）であること", creditCalc.netCreditAmount === 9676);

    // 6. 手数料四捨五入
    var roundDown = CashRegisterManager.calculateCredit(1000, 3.24); // 32.4円 -> 32円
    assert("フェーズ2-9: 32.4円が四捨五入で32円に丸められること", roundDown.feeAmount === 32 && roundDown.netCreditAmount === 968);

    var roundUp = CashRegisterManager.calculateCredit(1500, 3.24); // 48.6円 -> 49円
    assert("フェーズ2-10: 48.6円が四捨五入で49円に丸められること", roundUp.feeAmount === 49 && roundUp.netCreditAmount === 1451);

    // 7. 保存・LocalStorage永続化
    var saved = rManager.saveRecord({
      date: "2026-09-17",
      changeFund: 50000,
      presaleAmount: 10000,
      actualCash: 59800,
      creditSales: 10000,
      feeRate: 3.24,
      memo: "憲法検証データ"
    });
    assert("フェーズ2-11: 保存レコードの過不足が -200円 であること", saved.discrepancy === -200);
    assert("フェーズ2-12: 保存レコードのクレジット手数料が324円であること", saved.feeAmount === 324);
    assert("フェーズ2-13: 保存レコードの純入金見込額が9,676円であること", saved.netCreditAmount === 9676);

    // 8. 再読み込み
    var rReloaded = new CashRegisterManager(localStorage);
    assert("フェーズ2-14: 再読み込み後も1件保持されていること", rReloaded.records.length === 1);
    var fetched = rReloaded.getRecordByDate("2026-09-17");
    assert("フェーズ2-15: 再読み込み後も -200円 不足状態が完全保持されること", fetched && fetched.discrepancy === -200);

    // 9. 同一日付更新
    rReloaded.saveRecord({
      date: "2026-09-17",
      changeFund: 50000,
      presaleAmount: 10000,
      actualCash: 60000,
      creditSales: 10000,
      feeRate: 3.24,
      memo: "修正後"
    });
    assert("フェーズ2-16: 同一日付の上書き更新で件数が1件のままであること", rReloaded.records.length === 1);
    assert("フェーズ2-17: 上書き後の過不足が0円（一致）に更新されること", rReloaded.getRecordByDate("2026-09-17").discrepancy === 0);

    // 10. 憲法テストデータ投入メソッド検証
    rReloaded.loadConstitutionalTestData();
    var constData = rReloaded.getRecordByDate("2026-09-17");
    assert("フェーズ2-18: 憲法検証データ投入で -200円 不足と手数料324円が反映されること", constData.discrepancy === -200 && constData.feeAmount === 324 && constData.netCreditAmount === 9676);

    // 11. 削除
    rReloaded.deleteRecord(constData.id);
    assert("フェーズ2-19: レコード削除で0件に戻ること", rReloaded.records.length === 0);

    results.push("\n=== 【フェーズ3: 1画面日計締めサマリー＆複数日履歴管理 テスト】 ===");
    // 1. フェーズ3検証データ投入（Day 1: 2026-09-17, Day 2: 2026-09-18）
    rReloaded.loadPhase3ConstitutionalTestData(pReloaded);
    assert("フェーズ3-1: 複数日締めデータ投入で締めレコードが2件保持されること", rReloaded.records.length === 2);

    // 2. Day 1 のデータ独立性
    var day1 = rReloaded.getRecordByDate("2026-09-17");
    assert("フェーズ3-2: Day 1（2026-09-17）の締めデータが存在すること", Boolean(day1));
    assert("フェーズ3-3: Day 1 のレセコン売上が10,000円であること", day1.presaleAmount === 10000);
    assert("フェーズ3-4: Day 1 の実査現金が59,800円（過不足 -200円）であること", day1.actualCash === 59800 && day1.discrepancy === -200);
    assert("フェーズ3-5: Day 1 のクレジット売上が10,000円（手数料324円、純入金9,676円）であること", day1.creditSales === 10000 && day1.feeAmount === 324 && day1.netCreditAmount === 9676);
    assert("フェーズ3-6: Day 1 が確定状態（isConfirmed: true）であること", day1.isConfirmed === true);

    // 3. Day 2 のデータ独立性
    var day2 = rReloaded.getRecordByDate("2026-09-18");
    assert("フェーズ3-7: Day 2（2026-09-18）の締めデータが存在すること", Boolean(day2));
    assert("フェーズ3-8: Day 2 のレセコン売上が20,000円であること", day2.presaleAmount === 20000);
    assert("フェーズ3-9: Day 2 の実査現金が70,000円（過不足 0円 一致）であること", day2.actualCash === 70000 && day2.discrepancy === 0 && day2.status === "match");
    assert("フェーズ3-10: Day 2 のクレジット売上が5,000円（手数料162円、純入金4,838円）であること", day2.creditSales === 5000 && day2.feeAmount === 162 && day2.netCreditAmount === 4838);
    assert("フェーズ3-11: Day 2 が確定状態（isConfirmed: true）であること", day2.isConfirmed === true);

    // 4. 小口現金との1画面総合サマリー（Day 1）
    var day1Summary = rReloaded.getComprehensiveSummary("2026-09-17", pReloaded);
    assert("フェーズ3-12: Day 1 本日総売上が20,000円（現金1万＋クレジット1万）であること", day1Summary.totalSales === 20000);
    assert("フェーズ3-13: Day 1 純入金見込計が19,676円（現金1万＋クレジット純入金9,676円）であること", day1Summary.totalNetExpected === 19676);
    assert("フェーズ3-14: Day 1 の小口経費出金が1,000円であること", day1Summary.pettyExpense === 1000);
    assert("フェーズ3-15: Day 1 の小口現金残高が9,000円であること", day1Summary.pettyBalance === 9000);
    assert("フェーズ3-16: Day 1 の店舗手元実査現金計が68,800円（実査59,800＋小口残高9,000）であること", day1Summary.totalPhysicalCash === 68800);
    assert("フェーズ3-17: Day 1 の小口明細が2件（補充1万＋出金1千）取得できること", day1Summary.pettyTransactions.length === 2 && day1Summary.pettyTransactions.some(t => t.category === "消耗品費"));

    // 5. 小口現金との1画面総合サマリー（Day 2）
    var day2Summary = rReloaded.getComprehensiveSummary("2026-09-18", pReloaded);
    assert("フェーズ3-18: Day 2 本日総売上が25,000円（現金2万＋クレジット5千）であること", day2Summary.totalSales === 25000);
    assert("フェーズ3-19: Day 2 純入金見込計が24,838円（現金2万＋クレジット純入金4,838円）であること", day2Summary.totalNetExpected === 24838);
    assert("フェーズ3-20: Day 2 の小口経費出金が0円（当日の小口取引なし）であること", day2Summary.pettyExpense === 0);
    assert("フェーズ3-21: Day 2 の店舗手元実査現金計が79,000円（実査70,000＋小口残高9,000）であること", day2Summary.totalPhysicalCash === 79000);
    assert("フェーズ3-22: Day 2 の小口明細が0件であること", day2Summary.pettyTransactions.length === 0);

    // 6. 永続化（LocalStorageから再インスタンス化後も複数日が独立保持されること）
    var p3Reloaded = new CashRegisterManager(localStorage);
    assert("フェーズ3-23: 別インスタンス再読み込み後も2件の締め履歴が完全保持されること", p3Reloaded.records.length === 2);
    assert("フェーズ3-24: 再読み込み後も Day 1 の過不足 -200円 が保持されていること", p3Reloaded.getRecordByDate("2026-09-17").discrepancy === -200);
    assert("フェーズ3-25: 再読み込み後も Day 2 の過不足 0円 が保持されていること", p3Reloaded.getRecordByDate("2026-09-18").discrepancy === 0);

    results.push("\n==============================================");
    results.push("🎉 フェーズ1（14項目）＋ フェーズ2（19項目）＋ フェーズ3（25項目）全58項目に完全合格！");
    results.push("外部検証基準（1画面日計確定、複数日履歴分離、小口現金総合サマリー連携）を完全達成。");
    results.push("==============================================");
    return results.join("\n");
  } catch (e) {
    return results.join("\n") + "\n\nError: " + e.message;
  }
}
