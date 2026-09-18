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

// シート名の定義
const SHEET_DAILY_CLOSING = '日計締め台帳';
const SHEET_PETTY_CASH = '小口出納簿';
const SHEET_RECONCILIATION = '調剤報酬消込台帳';

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
