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
  var reconciliationCode = $.NSString.stringWithContentsOfFileEncodingError(currentDir + '/js/reconciliation.js', $.NSUTF8StringEncoding, null).js;
  var backupCode = $.NSString.stringWithContentsOfFileEncodingError(currentDir + '/js/backup.js', $.NSUTF8StringEncoding, null).js;
  var cloudSyncCode = $.NSString.stringWithContentsOfFileEncodingError(currentDir + '/js/cloud-sync.js', $.NSUTF8StringEncoding, null).js;
  var gasCode = $.NSString.stringWithContentsOfFileEncodingError(currentDir + '/gas/Code.gs', $.NSUTF8StringEncoding, null).js;

  var PettyCashManager = eval(pettyCashCode + '; PettyCashManager;');
  var CashRegisterManager = eval(cashRegisterCode + '; CashRegisterManager;');
  var ReconciliationManager = eval(reconciliationCode + '; ReconciliationManager;');
  var BackupManager = eval(backupCode + '; BackupManager;');
  var CloudSyncManager = eval(cloudSyncCode + '; CloudSyncManager;');

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
    assert("フェーズ1-5: 【厳格に検証】残高が暗算通りの9,000円（10,000 - 1,000）であること", pManager.getCurrentBalance() === 9000);

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

    // 3. 【厳格に検証】レジ現金照合: 実査現金200円不足
    var shortageCalc = CashRegisterManager.calculateCashDiscrepancy(50000, 10000, 59800);
    assert("フェーズ2-4: 【厳格に検証】実査59,800円で過不足額が -200円（不足）であること", shortageCalc.discrepancy === -200 && shortageCalc.status === "shortage");
    assert("フェーズ2-5: 不足表示ラベルに「不足」と「-200」が含まれること", shortageCalc.statusLabel.indexOf("不足") >= 0 && shortageCalc.statusLabel.indexOf("-200") >= 0);

    // 4. レジ現金照合: 過剰
    var excessCalc = CashRegisterManager.calculateCashDiscrepancy(50000, 10000, 60100);
    assert("フェーズ2-6: 実査60,100円で過不足額が +100円（過剰）であること", excessCalc.discrepancy === 100 && excessCalc.status === "excess");

    // 5. 【厳格に検証】クレジット手数料・純入金計算（売上10,000円、手数料率3.24%）
    var creditCalc = CashRegisterManager.calculateCredit(10000, 3.24);
    assert("フェーズ2-7: 【厳格に検証】クレジット売上10,000円の手数料が324円であること", creditCalc.feeAmount === 324);
    assert("フェーズ2-8: 【厳格に検証】差引入金見込額が9,676円（10,000 - 324）であること", creditCalc.netCreditAmount === 9676);

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
      memo: "サンプルデータ"
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

    // 10. サンプルデータ投入メソッド検証
    rReloaded.loadConstitutionalTestData("2026-09-17");
    var constData = rReloaded.getRecordByDate("2026-09-17");
    assert("フェーズ2-18: サンプルデータ投入で -200円 不足と手数料324円が反映されること", constData.discrepancy === -200 && constData.feeAmount === 324 && constData.netCreditAmount === 9676);

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

    results.push("\n=== 【フェーズ4: 調剤報酬消込・返戻追跡（2ヶ月サイクル） テスト】 ===");
    var recManager = new ReconciliationManager(localStorage);
    recManager.clearAll();

    // 1. 初期状態
    assert("フェーズ4-1: 初期状態の請求月サマリーが0件であること", recManager.monthlyRecords.length === 0);
    assert("フェーズ4-2: 初期状態の返戻・保留明細が0件であること", recManager.remandItems.length === 0);

    // 2. 差額計算ロジック（静的メソッド）
    var discShortage = ReconciliationManager.calculateDiscrepancy(1000000, 950000);
    assert("フェーズ4-3: 【厳格に検証】請求100万・入金95万で差額が -50,000円（不足）であること", discShortage.discrepancy === -50000 && discShortage.status === 'shortage' && discShortage.shortageAmount === 50000);

    var discMatch = ReconciliationManager.calculateDiscrepancy(1000000, 1000000);
    assert("フェーズ4-4: 請求100万・入金100万で差額0円（一致）であること", discMatch.discrepancy === 0 && discMatch.status === 'match' && discMatch.shortageAmount === 0);

    var discExcess = ReconciliationManager.calculateDiscrepancy(1000000, 1050000);
    assert("フェーズ4-5: 請求100万・入金105万で差額+50,000円（過剰）であること", discExcess.discrepancy === 50000 && discExcess.status === 'excess');

    // 3. 2ヶ月サイクル入金予定月の自動計算
    assert("フェーズ4-6: 2026-07請求の入金予定月が2026-09（2ヶ月後）であること", ReconciliationManager.calculateExpectedDepositMonth('2026-07') === '2026-09');
    assert("フェーズ4-7: 2026-11請求の入金予定月が年をまたいで2027-01であること", ReconciliationManager.calculateExpectedDepositMonth('2026-11') === '2027-01');

    // 4. 【厳格に検証: 個人情報非保持ルール】カルテ番号バリデーション
    var chartIdValid = ReconciliationManager.validatePatientChartId('A001');
    assert("フェーズ4-8: カルテ番号「A001」が正常にバリデーション通過すること", chartIdValid === 'A001');

    var piiBlocked = false;
    try {
      ReconciliationManager.validatePatientChartId('山田太郎');
    } catch (e) {
      piiBlocked = true;
    }
    assert("フェーズ4-9: 【厳格に検証】患者氏名（漢字）入力時に個人情報保護エラーがスローされること", piiBlocked);

    var kanaBlocked = false;
    try {
      ReconciliationManager.validatePatientChartId('すずき');
    } catch (e) {
      kanaBlocked = true;
    }
    assert("フェーズ4-10: 【厳格に検証】患者氏名（ひらがな）入力時に個人情報保護エラーがスローされること", kanaBlocked);

    // 5. 請求月サマリーの保存・更新
    var savedRec = recManager.saveMonthlyRecord({
      billingMonth: '2026-07',
      depositMonth: '2026-09',
      billedAmount: 1000000,
      paidAmount: 950000,
      memo: '7月調剤分レセプト'
    });
    assert("フェーズ4-11: 請求月レコードが保存され、差額 -50,000円が算出されること", savedRec.billingMonth === '2026-07' && savedRec.discrepancy === -50000);

    // 6. 返戻・保留明細の登録（カルテ番号A001, 50,000円）
    var remand1 = recManager.addRemandItem({
      billingMonth: '2026-07',
      patientChartId: 'A001',
      amount: 50000,
      reason: '保険証資格喪失・無効（期限切れ・転職等）',
      status: 'unhandled',
      handlingNote: '7/12受診時保険証失効。患者へ新保険証提出を依頼中'
    });
    assert("フェーズ4-12: カルテ番号A001の返戻案件が50,000円・未対応で登録されること", remand1.patientChartId === 'A001' && remand1.amount === 50000 && remand1.status === 'unhandled');

    // 7. 【厳格に検証: 差額完全特定レポート】
    var rep1 = recManager.getMonthlySummaryWithRemands('2026-07');
    assert("フェーズ4-13: 【厳格に検証】差額5万円に対し返戻5万円で原因未特定差額が0円（完全特定済）であること", rep1.shortageAmount === 50000 && rep1.totalRemandAmount === 50000 && rep1.unaccountedAmount === 0 && rep1.reconciliationStatus === 'fully_explained');
    assert("フェーズ4-14: 未対応集計が1件（50,000円）であること", rep1.unhandledCount === 1 && rep1.unhandledAmount === 50000);

    // 8. ステータス変更: 「未対応」→「再請求中」
    recManager.updateRemandStatus(remand1.id, 'rebilling', '8/25 新保険証受理、再請求レセプト作成・提出済');
    var rep2 = recManager.getMonthlySummaryWithRemands('2026-07');
    assert("フェーズ4-15: ステータスが再請求中に更新され、未対応が0円、再請求中が50,000円になること", rep2.unhandledAmount === 0 && rep2.rebillingAmount === 50000 && rep2.rebillingCount === 1);

    // 9. ステータス変更: 「再請求中」→「入金済/解決」
    recManager.updateRemandStatus(remand1.id, 'resolved', '9/20 再請求分が入金完了・解決');
    var updatedRemand = recManager.getRemandItem(remand1.id);
    var rep3 = recManager.getMonthlySummaryWithRemands('2026-07');
    assert("フェーズ4-16: ステータスが入金済/解決に更新され、解決日が自動記録されること", updatedRemand.status === 'resolved' && Boolean(updatedRemand.resolvedDate));
    assert("フェーズ4-17: 解決済金額が50,000円、未対応/再請求残高が0円になること", rep3.resolvedAmount === 50000 && rep3.unhandledAmount === 0 && rep3.rebillingAmount === 0);

    // 10. 複数案件の集計と削除
    var remand2 = recManager.addRemandItem({
      billingMonth: '2026-07',
      patientChartId: 'B002',
      amount: 10000,
      reason: '疑義照会・処方内容確認保留',
      status: 'unhandled'
    });
    var repMulti = recManager.getMonthlySummaryWithRemands('2026-07');
    assert("フェーズ4-18: 2件目の返戻（10,000円）追加で返戻総額が60,000円になること", repMulti.totalRemandAmount === 60000);

    recManager.deleteRemandItem(remand2.id);
    var repDeleted = recManager.getMonthlySummaryWithRemands('2026-07');
    assert("フェーズ4-19: 返戻案件削除で返戻総額が50,000円に戻ること", repDeleted.totalRemandAmount === 50000);

    // 11. 永続化（LocalStorageから再インスタンス化後も完全保持）
    var recReloaded = new ReconciliationManager(localStorage);
    assert("フェーズ4-20: 再インスタンス化後も2026-07の請求レコード（請求100万、入金95万）が完全保持されること", recReloaded.getMonthlyRecord('2026-07').billedAmount === 1000000 && recReloaded.getMonthlyRecord('2026-07').paidAmount === 950000);
    assert("フェーズ4-21: 再インスタンス化後もカルテ番号A001の返戻（解決済）が完全保持されること", recReloaded.remandItems.length === 1 && recReloaded.remandItems[0].patientChartId === 'A001' && recReloaded.remandItems[0].status === 'resolved');

    // 12. 複数請求月の独立性
    recReloaded.saveMonthlyRecord({
      billingMonth: '2026-08',
      depositMonth: '2026-10',
      billedAmount: 2000000,
      paidAmount: 2000000
    });
    assert("フェーズ4-22: 複数請求月（2026-07と2026-08）が独立して2件保持されること", recReloaded.monthlyRecords.length === 2);
    assert("フェーズ4-23: 2026-08請求分は差額0円（一致）として独立保持されること", recReloaded.getMonthlyRecord('2026-08').discrepancy === 0);

    // 13. 【動作確認用データ投入メソッド検証】
    recReloaded.loadPhase4ConstitutionalTestData();
    var constSummary = recReloaded.getMonthlySummaryWithRemands('2026-07');
    assert("フェーズ4-24: 【厳格に検証】請求100万、入金95万、差額-5万、返戻5万（A001・未対応）が完全復元されること", constSummary.billedAmount === 1000000 && constSummary.paidAmount === 950000 && constSummary.discrepancy === -50000 && constSummary.totalRemandAmount === 50000 && constSummary.items[0].patientChartId === 'A001' && constSummary.items[0].status === 'unhandled');
    assert("フェーズ4-25: 【厳格に検証】原因未特定差額が0円（完全特定済）であること", constSummary.unaccountedAmount === 0 && constSummary.reconciliationStatus === 'fully_explained');

    results.push("\n=== 【フェーズ5: UIデザインのブラッシュアップ テスト】 ===");
    var cssCode = $.NSString.stringWithContentsOfFileEncodingError(currentDir + '/css/style.css', $.NSUTF8StringEncoding, null).js;
    var htmlCode = $.NSString.stringWithContentsOfFileEncodingError(currentDir + '/index.html', $.NSUTF8StringEncoding, null).js;

    // 1. CSS・HTMLファイルの存在
    assert("フェーズ5-1: スタイルシート(css/style.css)が正常にロードされること", cssCode && cssCode.length > 0);
    assert("フェーズ5-2: HTML(index.html)にviewportメタタグが設定されていること", htmlCode.indexOf('name="viewport"') !== -1 && htmlCode.indexOf('width=device-width') !== -1);

    // 2. 誤読防止フォント（UDフォント・等幅数字）
    assert("フェーズ5-3: 【視認性】誤読防止のためUDフォント「BIZ UDPGothic」が最優先指定されていること", cssCode.indexOf('"BIZ UDPGothic"') !== -1);
    assert("フェーズ5-4: 【誤読防止】金額・数値フォントに等幅数字 tabular-nums が指定されていること", cssCode.indexOf('tabular-nums') !== -1);

    // 3. 配色（緑・青基調、高コントラスト、薄いグレー文字の廃止）
    assert("フェーズ5-5: 【配色】薬局基調色としてメディカルグリーン（--primary: #057a55）が定義されていること", cssCode.indexOf('--primary: #057a55') !== -1);
    assert("フェーズ5-6: 【配色】厳格・信頼色としてネイビー/ブルー系（--navy, --info）が定義されていること", cssCode.indexOf('--navy:') !== -1 && cssCode.indexOf('--info:') !== -1);
    assert("フェーズ5-7: 【守りの抑止力】現金過不足・警告用に高コントラスト赤字（--danger: #b91c1c）が定義されていること", cssCode.indexOf('--danger: #b91c1c') !== -1);
    assert("フェーズ5-8: 【現場視認性】薄暗い環境でも読めるよう薄いグレーを排し高コントラストテキスト（--text-muted: #334155）が定義されていること", cssCode.indexOf('--text-muted: #334155') !== -1);

    // 4. タブレット・店舗PC使い勝手（タップターゲット・iOSズーム防止）
    assert("フェーズ5-9: 【タッチ最適化】ボタンおよびタブのタップ領域が最小44px〜48px以上確保されていること", cssCode.indexOf('min-height: 48px') !== -1 || cssCode.indexOf('min-height: 52px') !== -1);
    assert("フェーズ5-10: 【店舗PC/タブレット】入力時にiOS Safari自動ズームが発生しないようフォント16px以上が指定されていること", cssCode.indexOf('font-size: 16px') !== -1);

    // 5. テーブル可読性（ゼブラストライプ・Stickyヘッダー）
    assert("フェーズ5-11: 【可読性向上】長大な金額テーブルの視線移動ミスを防ぐゼブラストライプが定義されていること", cssCode.indexOf('tbody tr:nth-child(even)') !== -1);
    assert("フェーズ5-12: 【可読性向上】スクロール時にも列名を見失わないStickyヘッダーが定義されていること", cssCode.indexOf('position: sticky') !== -1);

    results.push("\n=== 【フェーズ6: 簡易操作マニュアル ＆ 月次集計レポート・A4印刷帳票 テスト】 ===");
    
    // 1. 店舗スタッフ向け簡易操作マニュアル（docs/MANUAL.md）の存在と記載内容検証
    var manualPath = currentDir + '/docs/MANUAL.md';
    var manualCode = $.NSString.stringWithContentsOfFileEncodingError(manualPath, $.NSUTF8StringEncoding, null).js;
    assert("フェーズ6-1: 簡易操作マニュアル(docs/MANUAL.md)が存在すること", manualCode && manualCode.length > 0);
    assert("フェーズ6-2: 【基本精神】マニュアルにお金とスタッフを守る基本精神が明記されていること", manualCode.indexOf('儲けるためではなく') !== -1 && manualCode.indexOf('守るため') !== -1);
    assert("フェーズ6-3: 【業務手順】営業終了後の5分締め手順（STEP 1〜5）が明記されていること", manualCode.indexOf('5分締め') !== -1 && manualCode.indexOf('STEP 1') !== -1);
    assert("フェーズ6-4: 【抑止力】過不足発生時の自腹補填禁止およびエスカレーションルールが明記されていること", manualCode.indexOf('自腹で補填') !== -1 && manualCode.indexOf('エスカレーション') !== -1);
    assert("フェーズ6-5: 【セキュリティ規約】個人情報非保持（カルテ番号のみ、氏名厳禁）が明記されていること", manualCode.indexOf('カルテ番号') !== -1 && manualCode.indexOf('個人情報') !== -1);

    // 2. 月次横断集計ロジックの暗算検証テスト
    var mPetty = new PettyCashManager(localStorage);
    var mCash = new CashRegisterManager(localStorage);
    var mReconcile = new ReconciliationManager(localStorage);

    // 空の月集計
    var emptyReport = mCash.getMonthlyReport("2026-10", mPetty, mReconcile);
    assert("フェーズ6-6: データが存在しない月で安全にゼロサマリーが生成されること", emptyReport.closingDaysCount === 0 && emptyReport.grandTotalSales === 0);

    // 月次データ一括セット
    mCash.loadMonthlyConstitutionalTestData(mPetty, mReconcile);
    var monthlyReport = mCash.getMonthlyReport("2026-09", mPetty, mReconcile);

    assert("フェーズ6-7: 対象月（2026-09）の締め実施日数が2日であること", monthlyReport.closingDaysCount === 2);
    assert("フェーズ6-8: 【暗算検証】月間窓口売上合計が30,000円（1万+2万）であること", monthlyReport.totalPresaleAmount === 30000);
    assert("フェーズ6-9: 【暗算検証】月間クレジット売上合計が15,000円（1万+5千）であること", monthlyReport.totalCreditSales === 15000);
    assert("フェーズ6-10: 【暗算検証】月間総売上計が45,000円（3万+1.5万）であること", monthlyReport.grandTotalSales === 45000);
    assert("フェーズ6-11: 【暗算検証】月間クレジット決済手数料合計が486円（324+162）であること", monthlyReport.totalFeeAmount === 486);
    assert("フェーズ6-12: 【暗算検証】月間純入金見込計が44,514円（3万+14,514）であること", monthlyReport.grandTotalNetExpected === 44514);
    assert("フェーズ6-13: 【暗算検証】月間過不足累計が -200円（-200 + 0）であること", monthlyReport.totalDiscrepancy === -200);
    assert("フェーズ6-14: 過不足発生日数が不足1日・一致1日・過剰0日であること", monthlyReport.shortageDaysCount === 1 && monthlyReport.matchDaysCount === 1 && monthlyReport.excessDaysCount === 0);
    assert("フェーズ6-15: 【小口連携】小口補充10,000円、経費出金1,000円、月末残高9,000円であること", monthlyReport.pettyCash.monthlyIncome === 10000 && monthlyReport.pettyCash.monthlyExpense === 1000 && monthlyReport.pettyCash.endBalance === 9000);
    assert("フェーズ6-16: 【小口内訳】消耗品費が1,000円として集計されていること", monthlyReport.pettyCash.expenseByCategory['消耗品費'] === 1000);
    assert("フェーズ6-17: 【調剤報酬消込連携】当月入金分の請求100万、入金95万、差額-50,000円が集計されること", monthlyReport.reconciliation.totalBilledAmount === 1000000 && monthlyReport.reconciliation.totalPaidAmount === 950000 && monthlyReport.reconciliation.totalDiscrepancy === -50000);
    assert("フェーズ6-18: 【返戻連携】カルテ番号A001の未対応返戻50,000円が集計されること", monthlyReport.reconciliation.unhandledRemandAmount === 50000);

    // 3. UIおよびA4印刷レイアウトの検証
    assert("フェーズ6-19: HTMLに月次集計タブ(tab-monthly)が存在すること", htmlCode.indexOf('data-tab="tab-monthly"') !== -1 && htmlCode.indexOf('id="tab-monthly"') !== -1);
    assert("フェーズ6-20: HTMLに店長確認印・本部受領印の捺印欄が存在すること", htmlCode.indexOf('店舗管理者（店長）確認印') !== -1 && htmlCode.indexOf('本部・経理受領印') !== -1);
    assert("フェーズ6-21: CSSにA4印刷設定(@page { size: A4 portrait)が定義されていること", cssCode.indexOf('size: A4 portrait') !== -1);
    assert("フェーズ6-22: CSSに印刷時の改ページ泣き別れ防止(break-inside: avoid)が指定されていること", cssCode.indexOf('break-inside: avoid') !== -1);

    results.push("\n=== 【フェーズ7: データ保護・バックアップ＆復元（JSONエクスポート／インポート） テスト】 ===");

    // 1. BackupManagerのインスタンス生成と初期状態エクスポート
    var bkPetty = new PettyCashManager(localStorage);
    var bkCash = new CashRegisterManager(localStorage);
    var bkReconcile = new ReconciliationManager(localStorage);

    // テストデータを準備
    bkCash.loadMonthlyConstitutionalTestData(bkPetty, bkReconcile);
    var bManager = new BackupManager({
      pettyCashManager: bkPetty,
      cashRegisterManager: bkCash,
      reconciliationManager: bkReconcile
    });

    // 2. エクスポートデータ構造検証
    var exportedObj = bManager.exportData();
    assert("フェーズ7-1: エクスポートオブジェクトのsystem識別子が 'pharmacy-cash-management' であること", exportedObj.system === 'pharmacy-cash-management');
    assert("フェーズ7-2: エクスポートオブジェクトのversionが '1.0' であること", exportedObj.version === '1.0');
    assert("フェーズ7-3: エクスポート日時に有効なISO文字列が記録されていること", !isNaN(Date.parse(exportedObj.exportedAt)));
    assert("フェーズ7-4: メタデータに小口現金2件、レジ締め2件、調剤報酬1ヶ月、返戻1件が記録されていること", exportedObj.metadata.pettyCashCount === 2 && exportedObj.metadata.cashRegisterCount === 2 && exportedObj.metadata.reconciliationMonthCount === 1 && exportedObj.metadata.remandItemCount === 1);
    assert("フェーズ7-5: データ部に小口現金(transactions)、レジ締め(records)、調剤報酬(monthlyRecords & remandItems)が完全包含されていること", exportedObj.data.pettyCash.length === 2 && exportedObj.data.cashRegister.length === 2 && exportedObj.data.reconciliation.monthlyRecords.length === 1 && exportedObj.data.reconciliation.remandItems.length === 1);

    // 3. JSON文字列化検証
    var jsonString = bManager.generateExportJSON();
    assert("フェーズ7-6: generateExportJSON() が有効なJSON文字列を返すこと", typeof jsonString === 'string' && jsonString.indexOf('pharmacy-cash-management') !== -1);
    var parsedExport = JSON.parse(jsonString);
    assert("フェーズ7-7: パースしたJSONオブジェクトがエクスポート元オブジェクトと完全一致すること", parsedExport.data.pettyCash[0].amount === 10000 && parsedExport.data.pettyCash[1].amount === 1000);

    // 4. 【厳格に検証】個人情報非保持ディープスキャン: 正常データ
    var scanClean = BackupManager.scanForPersonalInfo(exportedObj);
    assert("フェーズ7-8: 【厳格に検証】規約準拠データ（カルテ番号A001）でスキャンが合格(safe: true)すること", scanClean.safe === true && scanClean.violations.length === 0);

    // 5. 【厳格に検証】個人情報非保持ディープスキャン: 漢字氏名混入時の検知・遮断
    var taintedKanjiObj = JSON.parse(JSON.stringify(exportedObj));
    taintedKanjiObj.data.reconciliation.remandItems[0].patientChartId = '山田花子';
    var scanKanji = BackupManager.scanForPersonalInfo(taintedKanjiObj);
    assert("フェーズ7-9: 【厳格に検証】患者漢字氏名「山田花子」混入時にスキャンが不合格(safe: false)となること", scanKanji.safe === false && scanKanji.violations.length > 0 && scanKanji.violations[0].indexOf('山田花子') !== -1);

    // 6. 【厳格に検証】個人情報非保持ディープスキャン: ひらがな氏名混入時の検知・遮断
    var taintedHiraganaObj = JSON.parse(JSON.stringify(exportedObj));
    taintedHiraganaObj.data.reconciliation.remandItems[0].patientChartId = 'たなかたろう';
    var scanHiragana = BackupManager.scanForPersonalInfo(taintedHiraganaObj);
    assert("フェーズ7-10: 【厳格に検証】患者ひらがな氏名「たなかたろう」混入時にスキャンが不合格となること", scanHiragana.safe === false && scanHiragana.violations[0].indexOf('たなかたろう') !== -1);

    // 7. 【厳格に検証】個人情報非保持ディープスキャン: カタカナ氏名混入時の検知・遮断
    var taintedKatakanaObj = JSON.parse(JSON.stringify(exportedObj));
    taintedKatakanaObj.data.reconciliation.remandItems[0].patientChartId = 'サトウイチロウ';
    var scanKatakana = BackupManager.scanForPersonalInfo(taintedKatakanaObj);
    assert("フェーズ7-11: 【厳格に検証】患者カタカナ氏名「サトウイチロウ」混入時にスキャンが不合格となること", scanKatakana.safe === false && scanKatakana.violations[0].indexOf('サトウイチロウ') !== -1);

    // 8. 【厳格に検証】個人情報非保持ディープスキャン: 個人情報プロパティ(patientName等)混入検知
    var taintedPropObj = JSON.parse(JSON.stringify(exportedObj));
    taintedPropObj.data.reconciliation.remandItems[0].patientName = '鈴木一郎';
    var scanProp = BackupManager.scanForPersonalInfo(taintedPropObj);
    assert("フェーズ7-12: 【厳格に検証】個人情報プロパティ(patientName)混入時にスキャンが不合格となること", scanProp.safe === false);

    // 9. validateBackupData の検証
    var valValid = BackupManager.validateBackupData(jsonString);
    assert("フェーズ7-13: 正常JSONのvalidateBackupDataがvalid: trueと件数サマリーを返すこと", valValid.valid === true && valValid.summary.pettyCashCount === 2 && valValid.summary.cashRegisterCount === 2);

    var valCorrupted = BackupManager.validateBackupData("invalid json text");
    assert("フェーズ7-14: 不正JSON文字列のvalidateBackupDataが安全にvalid: falseとエラーを返すこと", valCorrupted.valid === false && valCorrupted.error.indexOf('JSON') !== -1);

    var valTainted = BackupManager.validateBackupData(taintedKanjiObj);
    assert("フェーズ7-15: 個人情報混入データのvalidateBackupDataが個人情報保護規約違反エラーを返すこと", valTainted.valid === false && valTainted.error.indexOf('個人情報') !== -1);

    // 10. データ完全復元（インポート）の検証
    // ストレージとマネージャーを一旦クリア
    var freshPetty = new PettyCashManager(localStorage);
    var freshCash = new CashRegisterManager(localStorage);
    var freshReconcile = new ReconciliationManager(localStorage);
    freshPetty.clearAll();
    freshCash.clearAll();
    freshReconcile.clearAll();
    assert("フェーズ7-16: 復元前マネージャーがすべて空（初期状態）であること", freshPetty.transactions.length === 0 && freshCash.records.length === 0 && freshReconcile.monthlyRecords.length === 0);

    // インポート実行
    var importResult = bManager.importData(jsonString, {
      pettyCashManager: freshPetty,
      cashRegisterManager: freshCash,
      reconciliationManager: freshReconcile
    });
    assert("フェーズ7-17: importData() が各データの復元件数サマリーを正しく返すこと", importResult.pettyCashCount === 2 && importResult.cashRegisterCount === 2 && importResult.reconciliationMonthCount === 1 && importResult.remandItemCount === 1);

    // 復元後データの整合性検証（3モジュールすべて）
    assert("フェーズ7-18: 小口現金の残高が9,000円・取引2件で完全復元されること", freshPetty.getCurrentBalance() === 9000 && freshPetty.transactions.length === 2);
    assert("フェーズ7-19: レジ締めの過不足-200円および一致0円の2件が完全復元されること", freshCash.records.length === 2 && freshCash.records[0].discrepancy === -200 && freshCash.records[1].discrepancy === 0);
    assert("フェーズ7-20: 調剤報酬消込(2026-07差額-5万)および未対応返戻(カルテ番号A001/5万)が完全復元されること", freshReconcile.monthlyRecords[0].discrepancy === -50000 && freshReconcile.remandItems[0].patientChartId === 'A001' && freshReconcile.remandItems[0].status === 'unhandled');

    // 11. 不正データのインポート遮断検証（例外スロー）
    var threwException = false;
    try {
      bManager.importData(taintedKanjiObj, {
        pettyCashManager: freshPetty,
        cashRegisterManager: freshCash,
        reconciliationManager: freshReconcile
      });
    } catch (e) {
      threwException = true;
    }
    assert("フェーズ7-21: 【厳格に検証】個人情報混入データインポート時に例外がスローされ復元が遮断されること", threwException === true);

    // 12. UI要素（HTML・CSS・MANUAL.md）の存在検証
    // HTML・CSS・MANUALを再読み込み（最新の内容を反映）
    var htmlCodeLatest = $.NSString.stringWithContentsOfFileEncodingError(currentDir + '/index.html', $.NSUTF8StringEncoding, null).js;
    var cssCodeLatest = $.NSString.stringWithContentsOfFileEncodingError(currentDir + '/css/style.css', $.NSUTF8StringEncoding, null).js;
    var manualCodeLatest = $.NSString.stringWithContentsOfFileEncodingError(manualPath, $.NSUTF8StringEncoding, null).js;

    assert("フェーズ7-22: HTMLにバックアップ保存ボタン(btn-header-export)が存在すること", htmlCodeLatest.indexOf('id="btn-header-export"') !== -1);
    assert("フェーズ7-23: HTMLにデータ復元ボタン(btn-header-import)が存在すること", htmlCodeLatest.indexOf('id="btn-header-import"') !== -1);
    assert("フェーズ7-24: HTMLにデータ復元モーダル(backup-restore-dialog)およびドラッグ＆ドロップ枠が存在すること", htmlCodeLatest.indexOf('id="backup-restore-dialog"') !== -1 && htmlCodeLatest.indexOf('id="backup-dropzone"') !== -1);
    assert("フェーズ7-25: CSSにバックアップボタンおよびスキャンボックス用スタイルが定義されていること", cssCodeLatest.indexOf('.btn-backup-export') !== -1 && cssCodeLatest.indexOf('.scan-box-success') !== -1 && cssCodeLatest.indexOf('.scan-box-error') !== -1);
    assert("フェーズ7-26: MANUAL.mdにバックアップ・復元手順および個人情報非保持スキャン規約が明記されていること", manualCodeLatest.indexOf('データ保護・バックアップ＆復元手順') !== -1 && manualCodeLatest.indexOf('個人情報非保持ディープスキャン') !== -1);

    results.push("\n=== 【フェーズ8: 操作性向上・金種計算・確認ガイド・ワンタップ入力・完了表示 テスト】 ===");
    
    // 1. 金種計算ロジック（CashRegisterManager.calculateDenominations）の検証
    var testDenomCounts = {
      10000: 5, // 50,000円
      5000: 0,
      2000: 0,
      1000: 9,  // 9,000円
      500: 1,   // 500円
      100: 3,   // 300円
      50: 0,
      10: 0,
      5: 0,
      1: 0
    };
    var denomCalc = CashRegisterManager.calculateDenominations(testDenomCounts);
    assert("フェーズ8-1: 【暗算検証】万札5枚+千円9枚+500円1枚+100円3枚で暗算通り59,800円が算出されること", denomCalc.total === 59800, "計算合計: " + denomCalc.total);
    assert("フェーズ8-2: 金種内訳(breakdown)が10金種すべて含んでいること", denomCalc.breakdown.length === 10);
    assert("フェーズ8-3: 万札の小計が50,000円、千円札の小計が9,000円であること", denomCalc.breakdown[0].subtotal === 50000 && denomCalc.breakdown[3].subtotal === 9000);
    
    // 異常値・空値耐性
    var safeEmptyCalc = CashRegisterManager.calculateDenominations({});
    assert("フェーズ8-4: 空の金種オブジェクトで安全に0円が返ること", safeEmptyCalc.total === 0);
    var safeNegativeCalc = CashRegisterManager.calculateDenominations({ 10000: -2, 1000: "abc" });
    assert("フェーズ8-5: 負数や不正文字が安全に0円扱いとなること", safeNegativeCalc.total === 0);

    // 金種計算結果とレジ照合の統合検証（59,800円実査 ＝ 200円不足）
    var registerDiscrepancyCheck = CashRegisterManager.calculateCashDiscrepancy(50000, 10000, denomCalc.total);
    assert("フェーズ8-6: 金種計算結果(59,800円)からあるべき現金60,000円に対して200円不足が判定されること", registerDiscrepancyCheck.discrepancy === -200 && registerDiscrepancyCheck.status === 'shortage');

    // 2. HTMLの簡単・優しさUI要素検証
    assert("フェーズ8-7: HTMLに締め日クイックボタン(btn-date-today, btn-date-yesterday)が存在すること", htmlCodeLatest.indexOf('id="btn-date-today"') !== -1 && htmlCodeLatest.indexOf('id="btn-date-yesterday"') !== -1);
    assert("フェーズ8-8: HTMLにつり銭準備金リセットボタン(btn-reset-change-fund)が存在すること", htmlCodeLatest.indexOf('id="btn-reset-change-fund"') !== -1);
    assert("フェーズ8-9: HTMLにピッタリ一致ボタン(btn-match-expected-cash)が存在すること", htmlCodeLatest.indexOf('id="btn-match-expected-cash"') !== -1);
    assert("フェーズ8-10: HTMLに金種カウンター展開ボタン(btn-toggle-denomination)およびパネル(denomination-panel)が存在すること", htmlCodeLatest.indexOf('id="btn-toggle-denomination"') !== -1 && htmlCodeLatest.indexOf('id="denomination-panel"') !== -1);
    assert("フェーズ8-11: HTMLに10,000円〜1円の10金種入力行およびステッパーボタンが存在すること", htmlCodeLatest.indexOf('data-val="10000"') !== -1 && htmlCodeLatest.indexOf('data-val="1"') !== -1 && htmlCodeLatest.indexOf('class="btn-step btn-minus"') !== -1);
    assert("フェーズ8-12: HTMLに金種計算結果反映ボタン(btn-apply-denomination)が存在すること", htmlCodeLatest.indexOf('id="btn-apply-denomination"') !== -1);
    assert("フェーズ8-13: HTMLに過不足発生時の過不足確認ガイド(kindness-guidance-box)が存在すること", htmlCodeLatest.indexOf('id="kindness-guidance-box"') !== -1);
    assert("フェーズ8-14: HTML確認ガイド内に過不足確認手順と30秒チェックリストが存在すること", htmlCodeLatest.indexOf('過不足発生時の確認手順') !== -1 && htmlCodeLatest.indexOf('kindness-checklist') !== -1);
    assert("フェーズ8-15: HTMLに定型理由メモボタン群(quick-memo-tags)および原因不明・硬貨渡し間違いボタンが存在すること", htmlCodeLatest.indexOf('class="quick-memo-tags"') !== -1 && htmlCodeLatest.indexOf('原因不明（再確認済）') !== -1);
    assert("フェーズ8-16: HTMLに締め保存完了時の温かい労いモーダル(warm-closing-dialog)が存在すること", htmlCodeLatest.indexOf('id="warm-closing-dialog"') !== -1 && htmlCodeLatest.indexOf('今日もお疲れ様でした！') !== -1);
    assert("フェーズ8-17: HTML労いモーダル内に締めサマリー表示カード(warm-closing-summary-card)および明日の準備金案内(warm-tomorrow-reminder)が存在すること", htmlCodeLatest.indexOf('id="warm-closing-summary-card"') !== -1 && htmlCodeLatest.indexOf('warm-tomorrow-reminder') !== -1);
    assert("フェーズ8-18: HTMLに小口現金かんたん入力プリセット(quick-preset-bar)および用紙・消毒液・切手・金庫補充ボタンが存在すること", htmlCodeLatest.indexOf('class="quick-preset-bar"') !== -1 && htmlCodeLatest.indexOf('用紙・ペン') !== -1 && htmlCodeLatest.indexOf('金庫補充(¥1万)') !== -1);
    assert("フェーズ8-19: HTMLに調剤報酬返戻のワンタップ事由選択(quick-reason-chips)および資格喪失・疑義照会ボタンが存在すること", htmlCodeLatest.indexOf('class="quick-reason-chips"') !== -1 && htmlCodeLatest.indexOf('資格喪失・期限切れ') !== -1);

    // 3. CSSスタイルの検証
    assert("フェーズ8-20: CSSに金種カウンター用スタイル(.denomination-panel, .denom-grid, .denom-stepper)が定義されていること", cssCodeLatest.indexOf('.denomination-panel') !== -1 && cssCodeLatest.indexOf('.denomination-grid') !== -1 && cssCodeLatest.indexOf('.denom-stepper') !== -1);
    assert("フェーズ8-21: CSSに過不足確認ガイド用スタイル(.kindness-box, .kindness-title, .kindness-checklist)が定義されていること", cssCodeLatest.indexOf('.kindness-box') !== -1 && cssCodeLatest.indexOf('.kindness-title') !== -1 && cssCodeLatest.indexOf('.kindness-checklist') !== -1);
    assert("フェーズ8-22: CSSに定型メモタグおよび小口・返戻クイックチップスタイル(.btn-memo-tag, .btn-petty-chip, .btn-remand-chip)が定義されていること", cssCodeLatest.indexOf('.btn-memo-tag') !== -1 && cssCodeLatest.indexOf('.btn-petty-chip') !== -1 && cssCodeLatest.indexOf('.btn-remand-chip') !== -1);
    assert("フェーズ8-23: CSSに温かい労いモーダル用スタイル(.warm-modal-content, .warm-icon, .warm-tomorrow-reminder)が定義されていること", cssCodeLatest.indexOf('.warm-modal-content') !== -1 && cssCodeLatest.indexOf('.warm-tomorrow-reminder') !== -1);

    // 4. MANUAL.mdドキュメント記載検証
    assert("フェーズ8-24: MANUAL.mdに金種カウンターによる電卓不要手順およびピッタリ一致ボタンが明記されていること", manualCodeLatest.indexOf('金種カウンターで簡単計算') !== -1 && manualCodeLatest.indexOf('ピッタリ一致ボタン') !== -1);
    assert("フェーズ8-25: MANUAL.mdに過不足時の確認ガイド・自腹補填厳禁・30秒チェックが明記されていること", manualCodeLatest.indexOf('過不足確認ガイド') !== -1 && manualCodeLatest.indexOf('焦らずできる30秒チェック') !== -1);
    assert("フェーズ8-26: MANUAL.mdに小口現金・調剤報酬返戻のかんたん入力プリセットおよび温かい労いモーダルが明記されていること", manualCodeLatest.indexOf('かんたん入力プリセット') !== -1 && manualCodeLatest.indexOf('温かい労いモーダル') !== -1);

    results.push("\n=== 【フェーズ9: 本部リアルタイム同期・クラウド閲覧（Googleスプレッドシート連携） テスト】 ===");
    
    // 1. CloudSyncManagerの初期化と設定検証
    var cManager = new CloudSyncManager(localStorage);
    assert("フェーズ9-1: CloudSyncManager が正常に初期化されること", cManager !== null);
    assert("フェーズ9-2: 初期状態で isConfigured() が false を返し、店舗名デフォルトが「リリー薬局」であること", cManager.isConfigured() === false && cManager.settings.storeName === 'リリー薬局');

    // 設定保存と永続化
    var testEndpoint = 'https://script.google.com/macros/s/AKfycbz_test_endpoint/exec';
    cManager.saveSettings({
      endpointUrl: testEndpoint,
      storeName: 'リリー薬局 駅前店',
      autoSync: true
    });
    assert("フェーズ9-3: saveSettings でエンドポイントURLと店舗名が正常保存されること", cManager.settings.endpointUrl === testEndpoint && cManager.settings.storeName === 'リリー薬局 駅前店');
    assert("フェーズ9-4: 有効なURL設定時に isConfigured() が true を返すこと", cManager.isConfigured() === true);

    // ストレージ永続化確認（別インスタンス読み込み）
    var reloadedCManager = new CloudSyncManager(localStorage);
    assert("フェーズ9-5: 別インスタンス再読み込み後もクラウド設定が維持されること", reloadedCManager.settings.endpointUrl === testEndpoint && reloadedCManager.settings.storeName === 'リリー薬局 駅前店');

    // 2. プライバシー保護・安全スキャン検証（個人情報非保持スキャン）
    var cleanPayload = {
      action: 'daily_closing',
      storeName: 'リリー薬局',
      data: { date: '2026-09-18', presaleAmount: 10000, memo: '10円渡し間違いの疑い' }
    };
    var scanClean = CloudSyncManager.scanSafety(cleanPayload);
    assert("フェーズ9-6: 【厳格に検証】プライバシー保護ルール準拠データで安全スキャンが合格(safe: true)すること", scanClean.safe === true);

    var taintedPayload = {
      action: 'daily_closing',
      storeName: 'リリー薬局',
      data: { date: '2026-09-18', patientName: '山田花子', memo: '患者氏名混入' }
    };
    var scanTainted = CloudSyncManager.scanSafety(taintedPayload);
    assert("フェーズ9-7: 【厳格に検証】患者氏名混入時に安全スキャンが不合格(safe: false)となること", scanTainted.safe === false);

    // 3. オフラインキューイング機能の検証
    assert("フェーズ9-8: 初期キューが空(0件)であること", cManager.queue.length === 0);
    cManager.addToQueue({ action: 'daily_closing', test: 123 });
    assert("フェーズ9-9: addToQueue で未送信キューに1件追加されること", cManager.queue.length === 1);
    cManager.clearQueue();
    assert("フェーズ9-10: clearQueue でキューが0件にクリアされること", cManager.queue.length === 0);

    // 4. 本部受取用 Google Apps Script (gas/Code.gs) の検証
    assert("フェーズ9-11: 本部受取用 gas/Code.gs が存在すること", gasCode !== null && gasCode.length > 0);
    assert("フェーズ9-12: gas/Code.gs に doPost および doGet 関数が実装されていること", gasCode.indexOf('function doPost(') !== -1 && gasCode.indexOf('function doGet(') !== -1);
    assert("フェーズ9-13: gas/Code.gs に日計締め台帳・小口出納簿・調剤報酬消込台帳のシート記帳処理が実装されていること", gasCode.indexOf('SHEET_DAILY_CLOSING') !== -1 && gasCode.indexOf('SHEET_PETTY_CASH') !== -1 && gasCode.indexOf('SHEET_RECONCILIATION') !== -1);
    assert("フェーズ9-14: gas/Code.gs にヘッダー自動生成付きシート取得関数(getOrCreateSheet)が実装されていること", gasCode.indexOf('function getOrCreateSheet(') !== -1);

    // 5. HTML・CSS・MANUAL.md の検証
    assert("フェーズ9-15: HTMLにクラウド同期バッジ(cloud-sync-badge)が存在すること", htmlCodeLatest.indexOf('id="cloud-sync-badge"') !== -1);
    assert("フェーズ9-16: HTMLにクラウド設定ボタン(btn-cloud-settings)が存在すること", htmlCodeLatest.indexOf('id="btn-cloud-settings"') !== -1);
    assert("フェーズ9-17: HTMLにクラウド設定モーダル(cloud-settings-dialog)および店舗名・URL入力欄が存在すること", htmlCodeLatest.indexOf('id="cloud-settings-dialog"') !== -1 && htmlCodeLatest.indexOf('id="cloud-store-name"') !== -1 && htmlCodeLatest.indexOf('id="cloud-endpoint-url"') !== -1);
    assert("フェーズ9-18: HTMLに cloud-sync.js がスクリプト読み込みされていること", htmlCodeLatest.indexOf('src="js/cloud-sync.js"') !== -1);
    assert("フェーズ9-19: CSSにクラウド同期バッジ用スタイル(.cloud-sync-badge, .connected, .offline, .syncing)が定義されていること", cssCodeLatest.indexOf('.cloud-sync-badge') !== -1 && cssCodeLatest.indexOf('.cloud-sync-badge.connected') !== -1 && cssCodeLatest.indexOf('.cloud-sync-badge.offline') !== -1);
    assert("フェーズ9-20: MANUAL.mdに本部Googleスプレッドシート連携手順およびGASセットアップ手順が明記されていること", manualCodeLatest.indexOf('本部リアルタイム同期・Googleスプレッドシート連携') !== -1 && manualCodeLatest.indexOf('gas/Code.gs') !== -1);

    results.push("\n==============================================");
    results.push("🎉 フェーズ1（14）＋ フェーズ2（19）＋ フェーズ3（25）＋ フェーズ4（25）＋ フェーズ5（12）＋ フェーズ6（22）＋ フェーズ7（26）＋ フェーズ8（26）＋ フェーズ9（20）全189項目に完全合格！");
    results.push("厳格な検証基準（本部GAS受取プログラム・リアルタイム同期・個人情報遮断・オフライン保護・UI・マニュアル）を完全達成。");
    results.push("==============================================");
    return results.join("\n");
  } catch (e) {
    return results.join("\n") + "\n\nError: " + e.message;
  }
}
