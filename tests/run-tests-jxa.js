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

  var PettyCashManager = eval(pettyCashCode + '; PettyCashManager;');
  var CashRegisterManager = eval(cashRegisterCode + '; CashRegisterManager;');
  var ReconciliationManager = eval(reconciliationCode + '; ReconciliationManager;');

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

    results.push("\n=== 【フェーズ4: 調剤報酬消込・返戻追跡（2ヶ月サイクル） テスト】 ===");
    var recManager = new ReconciliationManager(localStorage);
    recManager.clearAll();

    // 1. 初期状態
    assert("フェーズ4-1: 初期状態の請求月サマリーが0件であること", recManager.monthlyRecords.length === 0);
    assert("フェーズ4-2: 初期状態の返戻・保留明細が0件であること", recManager.remandItems.length === 0);

    // 2. 差額計算ロジック（静的メソッド）
    var discShortage = ReconciliationManager.calculateDiscrepancy(1000000, 950000);
    assert("フェーズ4-3: 【憲法検証】請求100万・入金95万で差額が -50,000円（不足）であること", discShortage.discrepancy === -50000 && discShortage.status === 'shortage' && discShortage.shortageAmount === 50000);

    var discMatch = ReconciliationManager.calculateDiscrepancy(1000000, 1000000);
    assert("フェーズ4-4: 請求100万・入金100万で差額0円（一致）であること", discMatch.discrepancy === 0 && discMatch.status === 'match' && discMatch.shortageAmount === 0);

    var discExcess = ReconciliationManager.calculateDiscrepancy(1000000, 1050000);
    assert("フェーズ4-5: 請求100万・入金105万で差額+50,000円（過剰）であること", discExcess.discrepancy === 50000 && discExcess.status === 'excess');

    // 3. 2ヶ月サイクル入金予定月の自動計算
    assert("フェーズ4-6: 2026-07請求の入金予定月が2026-09（2ヶ月後）であること", ReconciliationManager.calculateExpectedDepositMonth('2026-07') === '2026-09');
    assert("フェーズ4-7: 2026-11請求の入金予定月が年をまたいで2027-01であること", ReconciliationManager.calculateExpectedDepositMonth('2026-11') === '2027-01');

    // 4. 【憲法検証: 個人情報非保持規約】カルテ番号バリデーション
    var chartIdValid = ReconciliationManager.validatePatientChartId('A001');
    assert("フェーズ4-8: カルテ番号「A001」が正常にバリデーション通過すること", chartIdValid === 'A001');

    var piiBlocked = false;
    try {
      ReconciliationManager.validatePatientChartId('山田太郎');
    } catch (e) {
      piiBlocked = true;
    }
    assert("フェーズ4-9: 【憲法規約】患者氏名（漢字）入力時に個人情報保護エラーがスローされること", piiBlocked);

    var kanaBlocked = false;
    try {
      ReconciliationManager.validatePatientChartId('すずき');
    } catch (e) {
      kanaBlocked = true;
    }
    assert("フェーズ4-10: 【憲法規約】患者氏名（ひらがな）入力時に個人情報保護エラーがスローされること", kanaBlocked);

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

    // 7. 【憲法検証: 差額完全特定レポート】
    var rep1 = recManager.getMonthlySummaryWithRemands('2026-07');
    assert("フェーズ4-13: 【憲法検証】差額5万円に対し返戻5万円で原因未特定差額が0円（完全特定済）であること", rep1.shortageAmount === 50000 && rep1.totalRemandAmount === 50000 && rep1.unaccountedAmount === 0 && rep1.reconciliationStatus === 'fully_explained');
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

    // 13. 【憲法外部検証データ投入メソッド検証】
    recReloaded.loadPhase4ConstitutionalTestData();
    var constSummary = recReloaded.getMonthlySummaryWithRemands('2026-07');
    assert("フェーズ4-24: 【憲法検証一括投入】請求100万、入金95万、差額-5万、返戻5万（A001・未対応）が完全復元されること", constSummary.billedAmount === 1000000 && constSummary.paidAmount === 950000 && constSummary.discrepancy === -50000 && constSummary.totalRemandAmount === 50000 && constSummary.items[0].patientChartId === 'A001' && constSummary.items[0].status === 'unhandled');
    assert("フェーズ4-25: 【憲法検証一括投入】原因未特定差額が0円（完全特定済）であること", constSummary.unaccountedAmount === 0 && constSummary.reconciliationStatus === 'fully_explained');

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
    assert("フェーズ6-2: 【憲法思想】マニュアルにお金とスタッフを守る基本精神が明記されていること", manualCode.indexOf('儲けるためではなく') !== -1 && manualCode.indexOf('守るため') !== -1);
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

    // 憲法月次データ一括セット
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

    results.push("\n==============================================");
    results.push("🎉 フェーズ1（14）＋ フェーズ2（19）＋ フェーズ3（25）＋ フェーズ4（25）＋ フェーズ5（12）＋ フェーズ6（22）全117項目に完全合格！");
    results.push("外部検証基準（簡易操作マニュアル・月次横断集計・店長/本部捺印欄・A4印刷レイアウト）を完全達成。");
    results.push("==============================================");
    return results.join("\n");
  } catch (e) {
    return results.join("\n") + "\n\nError: " + e.message;
  }
}
