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

  // petty-cash.js のソースを読み込んで評価
  var app = Application.currentApplication();
  app.includeStandardAdditions = true;
  var currentDir = $.NSFileManager.defaultManager.currentDirectoryPath.js;
  var pettyCashCode = app.read(Path(currentDir + '/js/petty-cash.js'));

  // PettyCashManager クラスを定義
  var PettyCashManager = eval(pettyCashCode + '; PettyCashManager;');

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
    var manager = new PettyCashManager(localStorage);
    manager.clearAll();

    // 1. 初期残高0円
    assert("初期状態の残高が0円であること", manager.getCurrentBalance() === 0, "現在: " + manager.getCurrentBalance());

    // 2. 補充 10,000円
    var inc = manager.addTransaction({
      date: "2026-09-17",
      type: "income",
      category: "小口現金補充",
      amount: 10000,
      memo: "金庫より小口補充"
    });
    assert("補充データが10,000円で登録されること", inc.amount === 10000);
    assert("補充後の現在残高が10,000円であること", manager.getCurrentBalance() === 10000, "現在: " + manager.getCurrentBalance());

    // 3. 出金 1,000円（消耗品費）
    var exp = manager.addTransaction({
      date: "2026-09-17",
      type: "expense",
      category: "消耗品費",
      amount: 1000,
      memo: "事務用品購入"
    });
    assert("出金データが1,000円で登録されること", exp.amount === 1000);
    assert("【憲法検証】残高が暗算通りの9,000円（10,000 - 1,000）であること", manager.getCurrentBalance() === 9000, "現在: " + manager.getCurrentBalance());

    // 4. サマリー集計
    var summary = manager.getSummary("2026-09");
    assert("当月補充合計が10,000円であること", summary.monthlyIncome === 10000);
    assert("当月出金合計が1,000円であること", summary.monthlyExpense === 1000);
    assert("当月取引件数が2件であること", summary.monthlyCount === 2);

    // 5. 表示一覧・差引残高
    var list = manager.getDisplayList();
    assert("一覧が2件であること", list.length === 2);
    assert("最新出金行の残高が9,000円であること", list[0].balanceAfter === 9000);
    assert("補充行の残高が10,000円であること", list[1].balanceAfter === 10000);

    // 6. 永続化（LocalStorageから再読み込み）
    var reloaded = new PettyCashManager(localStorage);
    assert("再インスタンス化後も残高9,000円が維持されること", reloaded.getCurrentBalance() === 9000);
    assert("再インスタンス化後も2件の取引が保持されること", reloaded.transactions.length === 2);

    // 7. 削除と再計算
    reloaded.deleteTransaction(exp.id);
    assert("出金削除で残高が10,000円に戻ること", reloaded.getCurrentBalance() === 10000);

    results.push("\n==============================================");
    results.push("🎉 全テスト合格！暗算による外部検証基準（10,000円 - 1,000円 = 9,000円）を満たしています。");
    results.push("==============================================");
    return results.join("\n");
  } catch (e) {
    return results.join("\n") + "\n\nError: " + e.message;
  }
}
