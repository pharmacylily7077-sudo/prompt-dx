# 外車・高級車販売 資金統制・不正根絶システム 新チャット引継ぎ仕様書
**（docs/CAR_SALES_HANDOVER.md）**

---

## 1. 完了済み開発成果サマリー

調剤薬局DX（`prompt-dx`）の設計思想・数理照合・エグゼクティブデザインを完全継承し、**「業界歴30年のトップセールスマンによる巧妙な不正・中抜きを物理的・数学的に封殺する外車・高級車販売特化型 資金統制システム」**の開発および精密外部検証が完了しています。

### ① テスト検証実績（全246項目 100% 完全合格）
* **高級車販売DX テスト（全57項目 PASS）**: `tests/test-dealer-jxa.js`
  - 車両別成約締め・個別原価（COGS）・USSオークション相場突合
  - 地方税法年度末基準 法定税額自動逆算マスタ（1円単位）
  - 諸費用預り金三方照合・滞留アラート・公的領収証書番号必須拘束
  - 信販オートローン着金消込（差額ゼロ原則）・他社残債立替金追跡
  - 30年トップ営業マン不正シミュレーション（物理出庫ゲートロック・フォレンジック異常スコアCRITICAL判定）
  - 至高の防護3大防衛線（専属行政書士出庫パス・第三者50点パーツ検収・年次VIP親展照合状）
  - オーナー直結Googleスプレッドシート同期 ＆ 個人情報非保持ディープスキャン
* **調剤薬局DX 回帰テスト（全189項目 PASS）**: `tests/run-tests-jxa.js`
  - レジ現金、小口出納、調剤報酬消込、金種計算、クラウド同期、完全整合性維持。

### ② 納品ファイル一覧
* **SPA本体**: [`dealer.html`](file:///Users/pha.ai/Documents/antigravity%20optimize/prompt-pha/prompt-dx/dealer.html), [`css/dealer.css`](file:///Users/pha.ai/Documents/antigravity%20optimize/prompt-pha/prompt-dx/css/dealer.css)
* **ロジック**: [`js/dealer-contract.js`](file:///Users/pha.ai/Documents/antigravity%20optimize/prompt-pha/prompt-dx/js/dealer-contract.js), [`js/dealer-expense.js`](file:///Users/pha.ai/Documents/antigravity%20optimize/prompt-pha/prompt-dx/js/dealer-expense.js), [`js/dealer-loan.js`](file:///Users/pha.ai/Documents/antigravity%20optimize/prompt-pha/prompt-dx/js/dealer-loan.js), [`js/dealer-audit.js`](file:///Users/pha.ai/Documents/antigravity%20optimize/prompt-pha/prompt-dx/js/dealer-audit.js), [`js/dealer-supreme.js`](file:///Users/pha.ai/Documents/antigravity%20optimize/prompt-pha/prompt-dx/js/dealer-supreme.js), [`js/dealer-sync.js`](file:///Users/pha.ai/Documents/antigravity%20optimize/prompt-pha/prompt-dx/js/dealer-sync.js), [`js/dealer-app.js`](file:///Users/pha.ai/Documents/antigravity%20optimize/prompt-pha/prompt-dx/js/dealer-app.js)
* **バックエンド**: [`gas/Code.gs`](file:///Users/pha.ai/Documents/antigravity%20optimize/prompt-pha/prompt-dx/gas/Code.gs)（成約粗利、諸費用、ローン、アラートの4大シート受取エンドポイント）
* **統制仕様書**: [`docs/CAR_SALES_SPEC.md`](file:///Users/pha.ai/Documents/antigravity%20optimize/prompt-pha/prompt-dx/docs/CAR_SALES_SPEC.md), [`docs/ALL_PATTERNS_GUIDE.md`](file:///Users/pha.ai/Documents/antigravity%20optimize/prompt-pha/prompt-dx/docs/ALL_PATTERNS_GUIDE.md)

---

## 2. 新チャットで一気に実行する「3大タスク」

ユーザー様からのご指示: **「全部一気にやりたいので１、２、３全部お願いします。」**

### 【タスク1】全店舗・全端末向け 本番Webアドレス（URL）の発行
- **目的**: 店舗PC、ショールームのiPad、外出先の営業マンのスマホからいつでもアクセスできるSSL対応の公開URL（`https://...`）を発行する。
- **候補**:
  1. **GitHub Pages**: リモート `origin (pharmacylily7077-sudo/prompt-dx)` にプッシュし、GitHub Pagesを有効化して即座に `https://pharmacylily7077-sudo.github.io/prompt-dx/dealer.html` を発行。
  2. **Firebase Hosting**: プロジェクトへデプロイして `https://xxx.web.app` を発行。
  3. **ローカルサーバー / 社内ネットワーク**: `python3 -m http.server` 等でLAN内公開。

### 【タスク2】店舗PC＆ショールームiPadの実機配備（PWA・ホーム画面化）
- **目的**: 現場スタッフがワンタップでアプリのように起動できるようにする。
- **手順**:
  - iPad / iPhone: Safariで開いて「ホーム画面に追加」（PWAアイコン・全画面表示対応）。
  - 店舗Windows / Mac: デスクトップ上に「🏎️ 高級車販売DX」のショートカットを作成。
  - 行政書士用・現場用の運用マニュアルの最終チェック。

### 【タスク3】手元のMacでの本番実データ入力 ＆ オーナーGoogleスプレッドシート連携
- **目的**: オーナー様の実機環境で、実際の車両1台目を入力し、オーナーのGoogleスプレッドシートにリアルタイム自動記帳されることを確認する。
- **手順**:
  - 「🗑️ 本番データ初期化」を押してクリーン状態へ移行。
  - Googleスプレッドシートに `gas/Code.gs` をデプロイしてウェブアプリURLを発行。
  - 画面の「☁️ クラウド設定」にURLを登録。
  - 実際の成約データを1件登録し、スプレッドシートの4大台帳（成約粗利、諸費用、ローン、アラート）への自動反映を目視確認。

---

## 3. 新チャット開始用 コピペプロンプト

新チャットを開いたら、以下のテキストをそのまま貼り付けて送信してください。

```text
前チャットからの引き継ぎで、外車・高級車販売特化型 不正根絶・資金統制システム（prompt-dx / dealer.html）の実機運用・公開展開を行います。

引き継ぎ仕様書（docs/CAR_SALES_HANDOVER.md）および全パターン網羅ガイド（docs/ALL_PATTERNS_GUIDE.md）を確認の上、以下の3大タスクを一気に実行してください。

1. 【本番Webアドレス（URL）の発行】
   全店舗のPCやiPadからアクセスできる公開URL（GitHub Pages または Firebase Hosting）を発行してください。
2. 【店舗PC＆iPadへの実機配備】
   iPadのホーム画面アイコン化（PWA）および店舗PCショートカットの整備を行ってください。
3. 【手元Macでの本番実データ入力 ＆ オーナーGoogleスプレッドシート同期の稼働確認】
   本番データモードでの1台目登録手順と、Googleスプレッドシート（gas/Code.gs）への自動記帳を完了させてください。
```
