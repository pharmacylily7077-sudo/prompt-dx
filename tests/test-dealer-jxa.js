// macOS JXA (JavaScript for Automation) 高級車販売 資金統制・不正根絶システム 精密外部検証スイート
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
  var contractCode = $.NSString.stringWithContentsOfFileEncodingError(currentDir + '/js/dealer-contract.js', $.NSUTF8StringEncoding, null).js;
  var expenseCode = $.NSString.stringWithContentsOfFileEncodingError(currentDir + '/js/dealer-expense.js', $.NSUTF8StringEncoding, null).js;
  var loanCode = $.NSString.stringWithContentsOfFileEncodingError(currentDir + '/js/dealer-loan.js', $.NSUTF8StringEncoding, null).js;
  var auditCode = $.NSString.stringWithContentsOfFileEncodingError(currentDir + '/js/dealer-audit.js', $.NSUTF8StringEncoding, null).js;
  var syncCode = $.NSString.stringWithContentsOfFileEncodingError(currentDir + '/js/dealer-sync.js', $.NSUTF8StringEncoding, null).js;
  var supremeCode = $.NSString.stringWithContentsOfFileEncodingError(currentDir + '/js/dealer-supreme.js', $.NSUTF8StringEncoding, null).js;

  var DealerContractManager = eval(contractCode + '; DealerContractManager;');
  var DealerExpenseManager = eval(expenseCode + '; DealerExpenseManager;');
  var DealerLoanManager = eval(loanCode + '; DealerLoanManager;');
  var DealerAuditManager = eval(auditCode + '; DealerAuditManager;');
  var DealerSyncManager = eval(syncCode + '; DealerSyncManager;');
  var DealerSupremeManager = eval(supremeCode + '; DealerSupremeManager;');

  var results = [];
  var passedCount = 0;
  var failedCount = 0;

  function assert(name, condition, detail) {
    if (condition) {
      passedCount++;
      results.push("✅ PASS: " + name + (detail ? " (" + detail + ")" : ""));
    } else {
      failedCount++;
      results.push("❌ FAIL: " + name + (detail ? " (" + detail + ")" : ""));
      throw new Error("Test Failed: " + name + " - " + detail);
    }
  }

  try {
    results.push("=== 【第1部: 車両別成約締め・個別原価・USS相場突合 検証】 ===");
    var cManager = new DealerContractManager(localStorage);
    cManager.clearAll();

    // 1-1. 個別原価・粗利計算エンジンの数理検証
    var profit = cManager.calculateProfit({
      vehiclePrice: 28500000,
      optionPrice: 2000000,
      expenseMargin: 800000,
      loanKickback: 700000,
      purchaseCost: 24500000,
      repairCost: 650000,
      transportCost: 150000
    });
    assert("1-1: 売上総額が正しく合算されること (2,850万+200万+80万+70万 = 3,200万円)", profit.totalSales === 32000000, "売上: " + profit.totalSales);
    assert("1-2: 個別総原価が正しく合算されること (2,450万+65万+15万 = 2,530万円)", profit.totalCost === 25300000, "原価: " + profit.totalCost);
    assert("1-3: 確定粗利が正しく算出されること (3,200万 - 2,530万 = 670万円)", profit.grossProfit === 6700000, "粗利: " + profit.grossProfit);
    assert("1-4: 粗利率が正しく算出されること (670万 / 3,200万 = 20.9%)", profit.marginRate === 20.9, "粗利率: " + profit.marginRate + "%");

    // 1-5. 成約代金三方突合（契約総額 ＝ 頭金 ＋ ローン ＋ 下取）
    var matchValid = cManager.verifyContractSettlement({
      contractTotal: 32000000,
      downPayment: 5000000,
      loanPrincipal: 22000000,
      tradeInAllowance: 5000000
    });
    assert("1-5: 成約代金三方突合が一致時にisValid:trueを返すこと", matchValid.isValid === true && matchValid.difference === 0);

    var matchInvalid = cManager.verifyContractSettlement({
      contractTotal: 32000000,
      downPayment: 5000000,
      loanPrincipal: 22000000,
      tradeInAllowance: 4500000 // 50万円不足
    });
    assert("1-6: 成約代金不整合時にisValid:falseおよび差額50万円を検知すること", matchInvalid.isValid === false && matchInvalid.difference === 500000);

    // 1-7. 下取車 USSオークション基準相場突合（過小査定・中抜き検知）
    var tradeNormal = cManager.verifyTradeInValuation({
      hasTradeIn: true,
      ussBenchmark: 15000000,
      appraisalValue: 14000000 // 乖離率 6.7% (正常)
    });
    assert("1-7: 相場乖離15%未満の下取査定が正常判定されること", tradeNormal.isUndervalued === false && tradeNormal.requiresOwnerApproval === false);

    var tradeUndervalued = cManager.verifyTradeInValuation({
      hasTradeIn: true,
      ussBenchmark: 16000000,
      appraisalValue: 11000000, // 差額500万、乖離率 31.3% (過小査定！)
      ownerApproved: false
    });
    assert("1-8: 相場乖離31.3%の下取査定でisUndervalued:trueおよびオーナー承認必須を検知すること", 
      tradeUndervalued.isUndervalued === true && tradeUndervalued.requiresOwnerApproval === true && tradeUndervalued.deviationRate === 31.3);

    // 1-9. 不正査定レコード追加時の例外遮断検証
    var blockedByTradeIn = false;
    try {
      cManager.addDeal({
        vin: 'WP0ZZZ99ZTS194821',
        salesRep: '神田 敏幸',
        contractTotal: 32000000,
        downPayment: 5000000,
        loanPrincipal: 22000000,
        tradeInAllowance: 5000000,
        tradeIn: {
          hasTradeIn: true,
          ussBenchmark: 16000000,
          appraisalValue: 11000000,
          ownerApproved: false
        }
      });
    } catch (e) {
      blockedByTradeIn = true;
    }
    assert("1-9: 【厳格に検証】オーナー未承認の過小査定成約が例外スローされ登録遮断されること", blockedByTradeIn === true);


    results.push("\n=== 【第2部: 法定税額自動逆算マスタ ＆ 諸費用三方照合 検証】 ===");
    var eManager = new DealerExpenseManager(localStorage);
    eManager.clearAll();

    // 2-1. ポルシェ911 GT3 (3,996cc, 1,435kg, 9月登録, 36ヶ月新車) の法定税額自動逆算
    var taxP = eManager.calculateStatutoryTaxes({
      displacement: 3996,
      curbWeight: 1435,
      registrationMonth: 9,
      inspectionTermMonths: 36,
      vehiclePrice: 28000000
    });
    // 年額 65,500円 / 9月登録 -> 10〜3月(6ヶ月) = 32,750円
    assert("2-1: 自動車税が排気量4L・9月登録(6ヶ月分)で32,750円と正確に逆算されること", taxP.autoTax === 32750, "税額: " + taxP.autoTax);
    // 重量税 1.5t以下 -> 0.5t×3 = 1.5t / 3年 = 36,900円
    assert("2-2: 重量税が1.5t以下・3年新車で36,900円と正確に逆算されること", taxP.weightTax === 36900, "税額: " + taxP.weightTax);
    // 自賠責 36ヶ月 = 23,690円
    assert("2-3: 自賠責保険料が36ヶ月新車で23,690円と正確に逆算されること", taxP.compulsoryInsurance === 23690);

    // 2-4. ロールスロイス・ゴースト (6,749cc, 2,570kg, 4月登録, 24ヶ月中古) の法定税額自動逆算
    var taxRR = eManager.calculateStatutoryTaxes({
      displacement: 6749,
      curbWeight: 2570,
      registrationMonth: 4,
      inspectionTermMonths: 24,
      vehiclePrice: 42000000
    });
    // 6,000cc超 年額110,000円 / 4月登録 -> 5〜3月(11ヶ月) = 100,833円
    assert("2-4: 自動車税が6L超・4月登録(11ヶ月分)で100,833円と正確に逆算されること", taxRR.autoTax === 100833, "税額: " + taxRR.autoTax);
    // 重量税 3.0t以下 (3.0t / 0.5t * 4,100 * 2年 = 49,200円)
    assert("2-5: 重量税が3.0t以下・2年車検で49,200円と正確に逆算されること", taxRR.weightTax === 49200, "税額: " + taxRR.weightTax);

    // 2-6. 諸費用預り金レコード作成と三方照合
    var expRec = eManager.createRecord({
      contractId: 'CT-2026-TEST',
      vin: 'WP0ZZZ99ZTS194821',
      salesRep: '佐藤 健一',
      depositReceived: 1000000,
      depositMethod: 'wire'
    });
    assert("2-6: 初期預り金受託時に手元残高が1,000,000円であること", eManager.getRemainingDepositBalance(expRec) === 1000000);

    // 2-7. 実費納付と領収証書番号の紐付け
    eManager.recordPaymentItem(expRec.id, 0, 32750, 'TAX-REC-001', '2026-09-10');
    eManager.recordPaymentItem(expRec.id, 1, 36900, 'WGT-REC-002', '2026-09-10');
    var matchPartial = eManager.verifyThreeWayMatch(eManager.getRecordById(expRec.id));
    assert("2-7: 実費69,650円納付後の手元残高が930,350円となること", matchPartial.balance === 930350);
    assert("2-8: 領収書番号があるためmissingReceiptCountが0であること", matchPartial.missingReceiptCount === 0);

    // 2-9. 余剰金の最終精算（店舗代行粗利 + 顧客返金）で残高0円
    eManager.finalizeSettlement(expRec.id, 300000, 630350, 'TR-REF-999');
    var matchFinal = eManager.verifyThreeWayMatch(eManager.getRecordById(expRec.id));
    assert("2-9: 代行売上30万+返還63万0350円で手元残高がピッタリ0円になること", matchFinal.balance === 0 && matchFinal.isBalanced === true);
    assert("2-10: 全領収書紐付かつ残高0円でisFullyReconciled:trueとなること", matchFinal.isFullyReconciled === true);

    // 2-11. 顧客直結バイパス受領証明書の生成
    var notice = eManager.generateCustomerNotice(expRec.id, { model: 'Porsche 911 GT3' });
    assert("2-11: 顧客受領書に公式統制本部ヘッダーおよび差額0円が正しく出力されること", 
      notice.companyOfficialHeader.indexOf('統制本部') !== -1 && notice.balance === 0);


    results.push("\n=== 【第3部: オートローン信販着金消込 ＆ 立替金統制 検証】 ===");
    var lManager = new DealerLoanManager(localStorage);
    lManager.clearAll();

    // 3-1. ローン着金計算の数理突合
    var loanCalc = lManager.calculateSettlement({
      contractPrincipal: 20000000,
      kickbackAmount: 600000,
      handlingFee: 150000,
      actualReceivedAmount: 20450000 // 2,000万 + 60万 - 15万 = 2,045万円
    });
    assert("3-1: ローン着金確定額が計算通り20,450,000円と合致すること", loanCalc.expectedPayout === 20450000 && loanCalc.isMatched === true);

    // 3-2. 1円でも入金ズレがある場合の消込遮断（未特定差額ゼロ原則）
    var loanMismatched = lManager.calculateSettlement({
      contractPrincipal: 20000000,
      kickbackAmount: 600000,
      handlingFee: 150000,
      actualReceivedAmount: 20400000 // 5万円不足
    });
    assert("3-2: 着金額5万円不足時にisMatched:falseおよび差額-50,000円を検知すること", loanMismatched.isMatched === false && loanMismatched.difference === -50000);

    // 3-3. ローンレコード作成と消込実行
    var loanRec = lManager.createLoan({
      contractId: 'CT-2026-TEST',
      vin: 'WP0ZZZ99ZTS194821',
      salesRep: '佐藤 健一',
      loanCompany: 'オリコ オートローン',
      contractPrincipal: 20000000
    });
    assert("3-3: 作成直後のローンレコードステータスがpendingであること", loanRec.status === 'pending');

    lManager.reconcileLoan(loanRec.id, 20450000, 600000, 150000, '2026-09-15', 'BNK-ORC-001');
    var reconciled = lManager.getLoanById(loanRec.id);
    assert("3-4: 正当金額で消込実行後にステータスがreconciledとなること", reconciled.status === 'reconciled' && reconciled.actualReceivedAmount === 20450000);

    // 3-5. 他社残債一括立替金の追跡と回収
    var adv = lManager.addAdvance({
      contractId: 'CT-2026-TEST',
      amount: 4500000,
      payee: '他社信販会社残債返済口',
      salesRep: '佐藤 健一'
    });
    assert("3-5: 立替金登録時にstatus:pendingかつ金額4,500,000円であること", adv.status === 'pending' && adv.amount === 4500000);

    lManager.recoverAdvance(adv.id, 4500000, '2026-09-18', 'REC-ADV-001');
    var recAdv = lManager.getAllAdvances()[0];
    assert("3-6: 立替金が同額回収時にstatus:recoveredとなること", recAdv.status === 'recovered' && recAdv.recoveredAmount === 4500000);


    results.push("\n=== 【第4部: 30年トップ営業マンの欺瞞攻撃シナリオシミュレーション 検証】 ===");
    // シナリオ準備: 歴32年 神田部長の不正案件を投入
    cManager.clearAll();
    eManager.clearAll();
    lManager.clearAll();

    // 4-1. 攻撃シナリオA: 諸費用預り金120万円を現金着服・自転車操業し、未精算のまま納車出庫を強行
    var dealKanda = cManager.addDeal({
      id: 'CT-KANDA-001',
      vin: 'WP0ZZZ99ZTS194821',
      model: 'Porsche 911 GT3',
      salesRep: '神田 敏幸（営業部長・歴32年）',
      contractDate: '2026-08-25',
      deliveryDate: '2026-09-20',
      contractTotal: 30000000,
      downPayment: 10000000,
      loanPrincipal: 20000000,
      tradeInAllowance: 0
    });

    var expKanda = eManager.createRecord({
      contractId: 'CT-KANDA-001',
      vin: 'WP0ZZZ99ZTS194821',
      salesRep: '神田 敏幸（営業部長・歴32年）',
      depositReceived: 1200000, // 120万現金受取
      depositDate: '2026-08-25',
      depositMethod: 'cash'
    });
    // 税金実費のみ584,200円支払、残り615,800円を手元に滞留
    eManager.recordPaymentItem(expKanda.id, 0, 584200, 'TAX-001', '2026-09-01');

    var loanKanda = lManager.createLoan({
      contractId: 'CT-KANDA-001',
      vin: 'WP0ZZZ99ZTS194821',
      salesRep: '神田 敏幸（営業部長・歴32年）',
      loanCompany: 'ジャックス',
      contractPrincipal: 20000000
    }); // ローン未着金のまま！

    // 出庫ゲート審査実行
    var gateResult = cManager.attemptDelivery(dealKanda.id, eManager, lManager);
    assert("4-1: 【不可逆ゲート】預り金滞留およびローン未消込により出庫がブロック(success:false)されること", gateResult.success === false && gateResult.isBlocked === true);
    assert("4-2: 出庫ブロッカーに「預り金残高615,800円滞留」が明示されること", gateResult.blockers[0].indexOf('615800') !== -1);
    assert("4-3: 出庫ブロッカーに「ローンの着金消込未完了」が明示されること", gateResult.blockers.some(function(b) { return b.indexOf('オートローン') !== -1; }));
    assert("4-4: 車両にillegalDelivery:trueの統制違反フラグが刻印されること", cManager.getDealById(dealKanda.id).illegalDelivery === true);

    // 4-5. 攻撃シナリオB: 納車済なのに預り金が滞留している横領トリップワイヤーの即時捕捉
    var aManager = new DealerAuditManager(cManager, eManager, lManager);
    var tripwires = aManager.scanAllTripwires();
    var hasGateBreach = tripwires.some(function(t) { return t.type === 'ILLEGAL_DELIVERY_GATE_BREACH'; });
    assert("4-5: 【トリップワイヤー】出庫ロック突破トリップワイヤーがCRITICALレベルで発報されること", hasGateBreach === true);

    // 4-6. 攻撃シナリオC: 営業マン別フォレンジック行動統計による神田部長の異常値特定
    var scorecard = aManager.getSalesRepForensicScorecard();
    var kandaScore = scorecard.find(function(s) { return s.name.indexOf('神田') !== -1; });
    assert("4-6: 【フォレンジック】神田営業部長のリスク判定が「CRITICAL（横領・中抜きリスク極大）」となること", 
      kandaScore !== undefined && kandaScore.riskLevel === 'CRITICAL' && kandaScore.riskScore >= 70);


    results.push("\n=== 【第5部: オーナー直結クラウド同期 ＆ プライバシー保護 検証】 ===");
    var sManager = new DealerSyncManager(localStorage);
    sManager.clearQueue();

    // 5-1. 設定の永続化
    sManager.saveSettings('https://script.google.com/macros/s/TEST/exec', '麻布ショールーム');
    assert("5-1: クラウド設定が正常に保存されisConfigured:trueとなること", sManager.isConfigured() === true);

    // 5-2. 個人情報非保持ディープスキャン（顧客氏名混入時の同期遮断）
    var scanClean = sManager.scanForPrivacyViolations({ vin: 'WP0ZZZ99ZTS194821', salesRep: '神田 敏幸', contractId: 'CT-001' });
    assert("5-2: VIN・契約番号・営業名のみのデータで安全スキャンが合格すること", scanClean.safe === true);

    var scanDirty = sManager.scanForPrivacyViolations({ vin: 'WP0ZZZ99ZTS194821', customerName: '佐藤 一郎', customerPhone: '090-1234-5678' });
    assert("5-3: 【厳格に検証】顧客氏名・電話番号混入時にプライバシースキャンが不合格(safe:false)となること", scanDirty.safe === false);

    var syncBlocked = false;
    try {
      sManager.prepareSyncPayload('sync_deal', { customerName: '田中 太郎', vin: 'WP0ZZZ99ZTS194821' });
    } catch (e) {
      syncBlocked = true;
    }
    assert("5-4: 個人情報混入時にprepareSyncPayloadが例外をスローして同期を遮断すること", syncBlocked === true);


    results.push("\n=== 【第6部: HTML UIコンポーネント ＆ A4印刷帳票仕様 検証】 ===");
    var dealerHtml = $.NSString.stringWithContentsOfFileEncodingError(currentDir + '/dealer.html', $.NSUTF8StringEncoding, null).js;
    var dealerCss = $.NSString.stringWithContentsOfFileEncodingError(currentDir + '/css/dealer.css', $.NSUTF8StringEncoding, null).js;
    var indexHtml = $.NSString.stringWithContentsOfFileEncodingError(currentDir + '/index.html', $.NSUTF8StringEncoding, null).js;
    var specDoc = $.NSString.stringWithContentsOfFileEncodingError(currentDir + '/docs/CAR_SALES_SPEC.md', $.NSUTF8StringEncoding, null).js;

    assert("6-1: dealer.html に4大タブボタン（tab-contract, tab-expense, tab-loan, tab-audit）が存在すること",
      dealerHtml.indexOf('data-tab="tab-contract"') !== -1 &&
      dealerHtml.indexOf('data-tab="tab-expense"') !== -1 &&
      dealerHtml.indexOf('data-tab="tab-loan"') !== -1 &&
      dealerHtml.indexOf('data-tab="tab-audit"') !== -1);

    assert("6-2: dealer.html に薬局DXへの事業切替リンク(btn-portal-switch)が存在すること",
      dealerHtml.indexOf('btn-portal-switch') !== -1 && dealerHtml.indexOf('index.html') !== -1);

    assert("6-3: index.html に高級車販売DXへの事業切替リンクが存在すること",
      indexHtml.indexOf('dealer.html') !== -1 && indexHtml.indexOf('高級車販売DX') !== -1);

    assert("6-4: dealer.html に納車出庫ゲート審査モーダル(modal-delivery-gate)が存在すること",
      dealerHtml.indexOf('modal-delivery-gate') !== -1);

    assert("6-5: dealer.html に顧客直結公式受領書モーダル(modal-customer-notice)が存在すること",
      dealerHtml.indexOf('modal-customer-notice') !== -1);

    assert("6-6: dealer.html に法定税額シミュレーター(modal-tax-calc)が存在すること",
      dealerHtml.indexOf('modal-tax-calc') !== -1);

    assert("6-7: dealer.html にA4印刷用の3大捺印枠(グループオーナー決裁印、内部統制監査室長印、支店長印)が存在すること",
      dealerHtml.indexOf('グループオーナー 決裁印') !== -1 &&
      dealerHtml.indexOf('内部統制監査室長 印') !== -1 &&
      dealerHtml.indexOf('麻布ショールーム 支店長印') !== -1);

    assert("6-8: css/dealer.css にA4横印刷スタイル(@media print / size: A4 landscape)が定義されていること",
      dealerCss.indexOf('@media print') !== -1 && dealerCss.indexOf('size: A4 landscape') !== -1);

    assert("6-9: docs/CAR_SALES_SPEC.md に30年トップセールスマンの不正手口と6大フォレンジック・トラップが明記されていること",
      specDoc.indexOf('6大フォレンジック・トラップ') !== -1 && specDoc.indexOf('歴30年トップセールスマン') !== -1);

    results.push("\n=== 【第7部: 至高の防護・最終防衛線（行政書士パス・パーツ検収・VIP年次照合状）検証】 ===");
    var supManager = new DealerSupremeManager(cManager, eManager, lManager, localStorage);
    supManager.clearAll();

    // 7-1. 【急所2 書類裏通し遮断】 専属行政書士用 陸運局出庫承認パスの発行拒否（預り金滞留時）
    var passBlocked = false;
    try {
      supManager.generateScrivenerGatePass('CT-KANDA-001', '統制検査員');
    } catch (e) {
      passBlocked = true;
    }
    assert("7-1: 【厳格に検証】諸費用預り金滞留中の車両（神田案件）に対して行政書士出庫パス発行が拒否遮断されること", passBlocked === true);

    // 7-2. クリーン案件に対する行政書士出庫パスの正常発行とセキュリティトークン検証
    var dealClean = cManager.addDeal({
      id: 'CT-CLEAN-001',
      vin: 'W1N4632761X999999',
      model: 'Mercedes-AMG G63',
      salesRep: '佐藤 健一',
      contractDate: '2026-09-01',
      contractTotal: 25000000,
      downPayment: 10000000,
      loanPrincipal: 15000000,
      tradeInAllowance: 0
    });
    var expClean = eManager.createRecord({
      contractId: 'CT-CLEAN-001',
      vin: 'W1N4632761X999999',
      salesRep: '佐藤 健一',
      depositReceived: 800000,
      depositMethod: 'wire'
    });
    eManager.recordPaymentItem(expClean.id, 0, 500000, 'TAX-CLN-01', '2026-09-05');
    eManager.finalizeSettlement(expClean.id, 200000, 100000, 'REF-CLN-01');
    var loanClean = lManager.createLoan({
      contractId: 'CT-CLEAN-001',
      vin: 'W1N4632761X999999',
      salesRep: '佐藤 健一',
      loanCompany: 'オリコ',
      contractPrincipal: 15000000,
      kickbackAmount: 400000,
      handlingFee: 100000
    });
    lManager.reconcileLoan(loanClean.id, 15300000, 400000, 100000, '2026-09-10', 'BNK-CLN-01');

    var passClean = supManager.generateScrivenerGatePass('CT-CLEAN-001', '統制室長 木村');
    assert("7-2: 0円精算済・ローン消込済車両に対して行政書士パスが発行されSecurity Tokenが生成されること", 
      passClean.securityToken.indexOf('AUTH-PASS-') !== -1 && passClean.verifiedDepositBalance === 0);
    assert("7-3: 行政書士パスに法的拘束力のある提携行政書士厳守義務条項が含まれていること",
      passClean.scrivenerMandateClause.indexOf('提携行政書士 厳守義務条項') !== -1);

    // 7-4. 【急所3 パーツ中抜き防止】 担当営業マン自身による自己検収の絶対禁止規約
    var partsBlocked = false;
    try {
      supManager.recordPartsAudit({
        contractId: 'CT-CLEAN-001',
        vin: 'W1N4632761X999999',
        inspectorName: '佐藤 健一'
      });
    } catch (e) {
      partsBlocked = true;
    }
    assert("7-4: 【厳格に検証】担当営業マン自身によるパーツ検収が自己監査禁止規約により例外遮断されること", partsBlocked === true);

    // 7-5. 第三者専任検査員によるパーツ検収アーカイブの正常保存
    var partsRecord = supManager.recordPartsAudit({
      contractId: 'CT-CLEAN-001',
      vin: 'W1N4632761X999999',
      inspectorName: '整備専任主任 渡辺',
      inspectionStage: 'arrival',
      odometerKm: 12500,
      brakeVerified: true,
      wheelVerified: true,
      exhaustVerified: true,
      interiorVerified: true,
      ecuVerified: true,
      photoArchiveCount: 50
    });
    assert("7-5: 第三者検査員によるパーツ検収が50枚写真アーカイブおよび5大アセット確認で正常保存されること",
      partsRecord.photoArchiveCount === 50 && partsRecord.components.brakeSystem.verified === true && partsRecord.inspectorName === '整備専任主任 渡辺');

    // 7-6. 【急所1 闇飛ばし封殺】 オーナー室直属 年次VIP顧客 取引照合状の生成と照合内容
    var vipStatement = supManager.generateVipAnnualAuditStatement('ALL', 2026);
    assert("7-6: 年次VIP照合状にオーナー直通特命監査ホットラインが明記されていること",
      vipStatement.confidentialHotline.indexOf('オーナー直通特命監査ホットライン') !== -1);
    assert("7-7: 年次VIP照合状に闇仲介・手渡し現金を牽制する重要警告条項が含まれていること",
      vipStatement.warningClause.indexOf('社外の専門業者への直接売却の斡旋（闇飛ばし）') !== -1);
    assert("7-8: 年次VIP照合状に公式成約車両リストおよび諸費用精算明細が含まれていること",
      vipStatement.deals.length > 0 && vipStatement.deals[0].expenseRefund !== undefined);

    // 7-9. UIおよび仕様書の至高防護対応検証
    assert("7-9: dealer.html に至高の防護3大モーダル（modal-scrivener-pass, modal-parts-audit, modal-vip-audit）が存在すること",
      dealerHtml.indexOf('modal-scrivener-pass') !== -1 &&
      dealerHtml.indexOf('modal-parts-audit') !== -1 &&
      dealerHtml.indexOf('modal-vip-audit') !== -1);

    assert("7-10: dealer.html に至高の防護ボタン群（btn-open-parts-audit, btn-open-vip-letter）が存在すること",
      dealerHtml.indexOf('btn-open-parts-audit') !== -1 &&
      dealerHtml.indexOf('btn-open-vip-letter') !== -1);

    assert("7-11: css/dealer.css に至高の防護用スタイル（.gate-pass-card, .parts-audit-grid, .vip-statement-card）が定義されていること",
      dealerCss.indexOf('.gate-pass-card') !== -1 &&
      dealerCss.indexOf('.parts-audit-grid') !== -1 &&
      dealerCss.indexOf('.vip-statement-card') !== -1);

    assert("7-12: docs/CAR_SALES_SPEC.md に第5章「至高の防護・最終防衛線3大包囲網」が明記されていること",
      specDoc.indexOf('至高の防護・最終防衛線') !== -1 &&
      specDoc.indexOf('急所1 闇飛ばし封殺') !== -1 &&
      specDoc.indexOf('急所2 書類裏通し遮断') !== -1 &&
      specDoc.indexOf('急所3 パーツ中抜き防止') !== -1);

    return results.join("\n") + "\n\n" +
      "==============================================\n" +
      "🎉 高級車販売 資金統制・不正根絶システム 精密外部検証 全" + passedCount + "項目に完全合格！\n" +
      "【至高の防護・最終防衛線】闇飛ばし・書類裏通し・パーツ中抜きの物理的封殺を確認。\n" +
      "==============================================";

  } catch (e) {
    return results.join("\n") + "\n\n❌ 検証失敗: " + e.message;
  }
}
