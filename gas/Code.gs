/**
 * ==============================================================================
 * 調剤薬局 本部リアルタイム同期 Google Apps Script (gas/Code.gs)
 * 理念: 会社もスタッフも変に疑わない。事実をリアルタイムに共有し、双方を守る。
 * 
 * 【本部での使い方（所要時間1分）】
 * 1. Googleスプレッドシートを新規作成（名前: 例「薬局本部_日計締め・売上管理台帳」）
 * 2. メニュー「拡張機能」→「Apps Script」を開く
 * 3. このファイル（Code.gs）の内容をすべて貼り付けて保存
 * 4. 右上の「デプロイ」→「新しいデプロイ」をクリック
 *    - 種類の選択:「ウェブアプリ」
 *    - 次のユーザーとして実行:「自分」
 *    - アクセスできるユーザー:「全員（Anyone）」
 * 5. 発行された「ウェブアプリのURL」をコピーし、店舗画面の「⚙️ クラウド設定」に貼り付けるだけ！
 * ==============================================================================
 */

// シート名の定義（調剤薬局DX）
const SHEET_DAILY_CLOSING = '日計締め台帳';
const SHEET_PETTY_CASH = '小口出納簿';
const SHEET_RECONCILIATION = '調剤報酬消込台帳';

// シート名の定義（高級車販売DX・資金統制）
const SHEET_DEALER_CONTRACT = '高級車成約粗利台帳';
const SHEET_DEALER_EXPENSE = '諸費用預り金出納簿';
const SHEET_DEALER_LOAN = '信販ローン消込台帳';
const SHEET_DEALER_AUDIT = '統制監査アラート台帳';

/**
 * 接続テスト・ステータス確認用 (GET)
 */
function doGet(e) {
  const result = {
    status: 'success',
    system: 'pharmacy-cash-management-cloud',
    version: '1.0',
    message: '薬局本部クラウド同期エンドポイントは正常に稼働しています。',
    timestamp: new Date().toISOString()
  };
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * 店舗からのデータ受取・スプレッドシート記帳 (POST)
 */
function doPost(e) {
  try {
    let payload = {};
    if (e && e.postData && e.postData.contents) {
      payload = JSON.parse(e.postData.contents);
    } else if (e && e.parameter) {
      payload = e.parameter;
    }

    const action = payload.action;
    const storeName = payload.storeName || '未指定店舗';
    const timestamp = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // 1. 日計締めデータの受信
    if (action === 'daily_closing') {
      const data = payload.data || {};
      const sheet = getOrCreateSheet(ss, SHEET_DAILY_CLOSING, [
        '記録日時', '店舗名', '締め日', '窓口現金売上', 'つり銭準備金', 
        '実査現金', 'あるべき現金', '過不足額', '照合判定', 
        'クレジット売上', '決済手数料', '純入金見込', '過不足理由・引継ぎメモ'
      ]);

      let statusLabel = '一致';
      if (data.status === 'shortage') statusLabel = '不足⚠️';
      if (data.status === 'excess') statusLabel = '過剰⚠️';

      sheet.appendRow([
        timestamp,
        storeName,
        data.date || '',
        Number(data.presaleAmount || 0),
        Number(data.changeFund || 0),
        Number(data.actualCash || 0),
        Number(data.expectedCash || 0),
        Number(data.discrepancy || 0),
        statusLabel,
        Number(data.creditSales || 0),
        Number(data.feeAmount || 0),
        Number(data.netCreditAmount || 0),
        data.memo || ''
      ]);

      return createJsonResponse({
        status: 'success',
        action: action,
        message: `${storeName} の日計締めデータ（${data.date}）を本部に正常記帳しました。`
      });
    }

    // 2. 小口現金出納データの受信
    if (action === 'petty_cash') {
      const data = payload.data || {};
      const sheet = getOrCreateSheet(ss, SHEET_PETTY_CASH, [
        '記録日時', '店舗名', '取引日', '区分', '勘定科目', '金額', '現在残高', '摘要メモ'
      ]);

      const typeLabel = data.type === 'income' ? '入金（補充）' : '出金（経費）';

      sheet.appendRow([
        timestamp,
        storeName,
        data.date || '',
        typeLabel,
        data.category || '',
        Number(data.amount || 0),
        Number(data.currentBalance || 0),
        data.memo || ''
      ]);

      return createJsonResponse({
        status: 'success',
        action: action,
        message: `${storeName} の小口出納データ（${data.category}: ¥${data.amount}）を本部に正常記帳しました。`
      });
    }

    // 3. 調剤報酬消込データの受信
    if (action === 'reconciliation') {
      const data = payload.data || {};
      const sheet = getOrCreateSheet(ss, SHEET_RECONCILIATION, [
        '記録日時', '店舗名', '請求対象年月', 'レセプト請求総額', '支払確定入金総額', 
        '入金差額', '未解決返戻総額', '備考メモ'
      ]);

      sheet.appendRow([
        timestamp,
        storeName,
        data.billingMonth || '',
        Number(data.billedAmount || 0),
        Number(data.paidAmount || 0),
        Number(data.discrepancy || 0),
        Number(data.unresolvedRemandTotal || 0),
        data.memo || ''
      ]);

      return createJsonResponse({
        status: 'success',
        action: action,
        message: `${storeName} の調剤報酬消込データ（${data.billingMonth}）を本部に正常記帳しました。`
      });
    }

    // 4. 高級車販売: 成約粗利データの受信
    if (action === 'sync_deal' || action === 'dealer_contract') {
      const data = payload.data || {};
      const showroom = payload.showroom || storeName;
      const sheet = getOrCreateSheet(ss, SHEET_DEALER_CONTRACT, [
        '記録日時', 'ショールーム', '契約番号', '車台番号(VIN)', '車種モデル', 
        '担当営業', '契約日', '納車予定日', 'ステータス', 
        '車両本体価格', 'オプション売上', '諸費用粗利', 'ローンキックバック', 
        '売上総額', '仕入原価', '加修整備費', '陸送費', '個別総原価', '確定粗利', '粗利率(%)', '出庫ロック状態'
      ]);

      sheet.appendRow([
        timestamp,
        showroom,
        data.id || '',
        data.vin || '',
        data.model || '',
        data.salesRep || '',
        data.contractDate || '',
        data.deliveryDate || '',
        data.status || '',
        Number(data.vehiclePrice || 0),
        Number(data.optionPrice || 0),
        Number(data.expenseMargin || 0),
        Number(data.loanKickback || 0),
        Number(data.totalSales || 0),
        Number(data.purchaseCost || 0),
        Number(data.repairCost || 0),
        Number(data.transportCost || 0),
        Number(data.totalCost || 0),
        Number(data.grossProfit || 0),
        Number(data.marginRate || 0),
        data.illegalDelivery ? '🚨出庫ロック突破' : '正常'
      ]);

      return createJsonResponse({
        status: 'success',
        action: action,
        message: `${showroom} の成約粗利データ（${data.id}: ${data.model}）をオーナー台帳へ直結記帳しました。`
      });
    }

    // 5. 高級車販売: 諸費用預り金出納データの受信
    if (action === 'sync_expense' || action === 'dealer_expense') {
      const data = payload.data || {};
      const showroom = payload.showroom || storeName;
      const sheet = getOrCreateSheet(ss, SHEET_DEALER_EXPENSE, [
        '記録日時', 'ショールーム', '契約番号', '車台番号(VIN)', '担当営業', 
        '預り金受託額', '受託日', '受託方法', '保管金庫', 
        '法定実費納付総額', '店舗代行売上', '顧客返還額', '預り金手元残高', '三方照合判定'
      ]);

      sheet.appendRow([
        timestamp,
        showroom,
        data.contractId || '',
        data.vin || '',
        data.salesRep || '',
        Number(data.depositReceived || 0),
        data.depositDate || '',
        data.depositMethod || '',
        data.cashVaultLocation || '',
        Number(data.actualPaidTotal || 0),
        Number(data.dealerFeeRevenue || 0),
        Number(data.customerRefund || 0),
        Number(data.balance || 0),
        (data.balance === 0) ? '三方一致（精算完了）' : '🚨預り金滞留⚠️'
      ]);

      return createJsonResponse({
        status: 'success',
        action: action,
        message: `${showroom} の諸費用出納データ（${data.contractId}）をオーナー台帳へ直結記帳しました。`
      });
    }

    // 6. 高級車販売: 信販オートローン消込データの受信
    if (action === 'sync_loan' || action === 'dealer_loan') {
      const data = payload.data || {};
      const showroom = payload.showroom || storeName;
      const sheet = getOrCreateSheet(ss, SHEET_DEALER_LOAN, [
        '記録日時', 'ショールーム', '契約番号', '車台番号(VIN)', '担当営業', 
        '信販会社名', '承認番号', '契約ローン元金', '振込予定日', 
        '実着金日', '実着金総額', 'キックバック手数料', '取扱手数料', '差額判定', 'ステータス'
      ]);

      sheet.appendRow([
        timestamp,
        showroom,
        data.contractId || '',
        data.vin || '',
        data.salesRep || '',
        data.loanCompany || '',
        data.loanApprovalNo || '',
        Number(data.contractPrincipal || 0),
        data.expectedSettlementDate || '',
        data.actualSettlementDate || '',
        Number(data.actualReceivedAmount || 0),
        Number(data.kickbackAmount || 0),
        Number(data.handlingFee || 0),
        Number(data.difference || 0) === 0 ? '消込一致' : '差額発生⚠️',
        data.status || ''
      ]);

      return createJsonResponse({
        status: 'success',
        action: action,
        message: `${showroom} のローン消込データ（${data.contractId}）をオーナー台帳へ直結記帳しました。`
      });
    }

    // 7. 高級車販売: 統制監査アラート・トリップワイヤーの受信
    if (action === 'sync_audit_alert' || action === 'dealer_audit_alert') {
      const data = payload.data || {};
      const showroom = payload.showroom || storeName;
      const sheet = getOrCreateSheet(ss, SHEET_DEALER_AUDIT, [
        '検知日時', 'ショールーム', '警告レベル', 'アラート分類', 
        '契約番号', '車台番号(VIN)', '担当営業', '警告詳細内容'
      ]);

      sheet.appendRow([
        timestamp,
        showroom,
        data.level || 'WARNING',
        data.type || '',
        data.contractId || '',
        data.vin || '',
        data.salesRep || '',
        data.message || ''
      ]);

      return createJsonResponse({
        status: 'success',
        action: action,
        message: `${showroom} の統制アラートをオーナー専用シートへ緊急通知記帳しました。`
      });
    }

    return createJsonResponse({
      status: 'error',
      message: `未知のアクションです: ${action}`
    });

  } catch (err) {
    return createJsonResponse({
      status: 'error',
      message: `本部サーバー処理エラー: ${err.message}`
    });
  }
}

/**
 * シート取得またはヘッダー付き新規作成ヘルパー
 */
function getOrCreateSheet(ss, sheetName, headers) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(headers);
    // ヘッダー行の書式設定（視認性向上）
    const range = sheet.getRange(1, 1, 1, headers.length);
    range.setBackground('#057a55'); // メディカルグリーン
    range.setFontColor('#ffffff');
    range.setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/**
 * JSONレスポンス生成
 */
function createJsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
