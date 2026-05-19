# remote-benkyo

iPad ライクなキャンバス UI と benkyo-cli を組み合わせた学習支援 Web アプリ。

---

## 概要

| 目的 | 詳細 |
|------|------|
| 学習管理 | [benkyo-cli](https://github.com/youseiushida/benkyo) をバックエンドとして活用 |
| AI | Claude Code CLI 経由で Claude API に接続 |
| 解答インターフェース | タッチパネル対応の手書きキャンバス（iPad 想定） |
| 教科分離 | 教科ごとにデータ・コンテキストを完全分離 |
| アクセス | cloudflared トンネルで外部公開 |
| 実行環境 | Docker Compose で一括管理 |

---

## アーキテクチャ

```
┌─────────────────────────────────────────────────────┐
│                  iPad / Browser                      │
│  ┌──────────────┐   ┌──────────────────────────┐   │
│  │  教科ダッシュ  │   │  キャンバス解答 UI         │   │
│  │  ボード       │   │  (手書き・計算式・図示)     │   │
│  └──────┬───────┘   └──────────┬───────────────┘   │
└─────────┼──────────────────────┼───────────────────┘
          │ HTTP / WebSocket      │ Canvas Image / Ink Data
          ▼                      ▼
┌─────────────────────────────────────────────────────┐
│              cloudflared tunnel                      │
└─────────────────────────┬───────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────┐
│              Reverse Proxy (Nginx / Caddy)           │
└──────┬──────────────────────────────────────────────┘
       │
       ├──── /api/*  ──────► API Server (FastAPI)
       │                        │
       │                        ├── PostgreSQL (教科・問題・ファイル管理)
       │                        │
       │                        └── benkyo-cli Runner
       │                               │
       │                               ├── 教科ごとの workspace 分離
       │                               └── Claude Code CLI
       │                                       │
       │                                       └── Claude API (OAuth Token)
       │
       └──── /*  ──────────► Frontend (Next.js)
```

---

## サービス構成（Docker Compose）

```
remote-benkyo/
├── docker-compose.yml
├── frontend/          # Next.js + Canvas UI
├── api/               # FastAPI web server
├── benkyo-runner/     # benkyo-cli 実行環境
├── db/                # PostgreSQL init scripts
├── nginx/             # reverse proxy config
└── cloudflared/       # tunnel config
```

### コンテナ一覧

| サービス名 | イメージ | 役割 |
|-----------|---------|------|
| `frontend` | Node 22 (Next.js) | キャンバス UI・教科ダッシュボード |
| `api` | Python 3.13 (FastAPI) | REST / WebSocket API |
| `benkyo-runner` | Node 22 + Claude Code CLI | benkyo-cli 実行・教科 workspace 管理 |
| `db` | PostgreSQL 17 | 教科・問題・ファイル・セッション管理 |
| `nginx` | nginx:alpine | リバースプロキシ・静的配信 |
| `cloudflared` | cloudflare/cloudflared | 外部トンネル |

---

## 認証フロー（Claude Code OAuth）

Claude Code CLI のブラウザ認証をそのまま流用する。

```
1. ユーザーがアプリにアクセス
        │
        ▼
2. 「Claude でログイン」ボタン
        │
        ▼
3. Claude Code CLI の OAuth URL へリダイレクト
   (例: https://claude.ai/auth/... )
        │
        ▼
4. Claude 側でブラウザ認証完了
        │
        ▼
5. トークン文字列が画面に表示される
        │  ← ユーザーがコピー
        ▼
6. アプリのトークン入力欄にペースト
        │
        ▼
7. API Server がトークンを検証・保存
   (セッションに紐付け、DB に暗号化保存)
        │
        ▼
8. 以降は Authorization: Bearer <token> で Claude API を呼び出す
```

> **実装メモ**: `claude auth login` コマンドを benkyo-runner コンテナ内で実行してトークンを取得する方式と、ユーザー自身がトークンをペーストする方式の2択。初期実装はペースト方式が最もシンプル。

---

## データ分離設計（教科ごと）

```
benkyo-runner/workspaces/
├── {subject_id_1}/       # 数学
│   ├── .benkyo/          # benkyo-cli のデータ
│   ├── files/            # アップロードされた教材
│   └── problems/         # 問題セット
├── {subject_id_2}/       # 物理
│   └── ...
└── {subject_id_N}/
```

- API Server は教科 ID ごとに workspace パスを解決してから benkyo-runner に指示
- benkyo-cli の呼び出しは必ず該当 workspace をカレントディレクトリにして実行
- ファイルアップロード時も教科 ID で保存先を分岐し、Claude のコンテキストに混入しない

---

## キャンバス解答 UI 設計

CLI でテキスト返答するのではなく、iPad タッチパネルで手書き・図示・計算式を記述して答える。

```
┌────────────────────────────────────────────┐
│  問題表示エリア                              │
│  ┌──────────────────────────────────────┐  │
│  │  Q: sin(30°) を求めよ                │  │
│  └──────────────────────────────────────┘  │
│                                            │
│  解答キャンバス（手書き）                    │
│  ┌──────────────────────────────────────┐  │
│  │                                      │  │
│  │   ✏️ sin(30°) = 1/2              │  │
│  │                                      │  │
│  └──────────────────────────────────────┘  │
│                                            │
│  [消去]  [ペン]  [テキスト]  [送信]         │
└────────────────────────────────────────────┘
```

### 技術スタック候補

| 要素 | 候補 |
|------|------|
| キャンバスライブラリ | [tldraw](https://tldraw.dev/) / [Excalidraw](https://excalidraw.com/) / Perfect Freehand |
| 手書き → テキスト変換 | Canvas を PNG にエクスポート → Claude Vision で解釈 |
| 数式レンダリング | KaTeX / MathJax |
| リアルタイム同期 | WebSocket |

### 解答送信フロー

```
1. ユーザーがキャンバスに手書きで解答
2. 「送信」ボタン押下
3. Canvas を PNG にシリアライズ
4. API Server へ POST (multipart: image + subject_id + problem_id)
5. API Server → benkyo-runner へ転送
6. benkyo-runner:
   a. PNG を Claude Vision に送って解答テキストを抽出
   b. 抽出結果を benkyo-cli に渡して採点・フィードバック生成
7. フィードバックを WebSocket でフロントに返す
8. 正誤・解説を UI に表示
```

---

## DB スキーマ（概略）

```sql
subjects        -- 教科 (id, name, workspace_path, user_token_hash)
files           -- アップロード教材 (id, subject_id, filename, storage_path)
problems        -- 問題 (id, subject_id, content, source_file_id)
sessions        -- 学習セッション (id, subject_id, started_at, ended_at)
answers         -- 解答履歴 (id, session_id, problem_id, canvas_png_path, extracted_text, score, feedback)
```

---

## 実装ロードマップ

### Phase 1 — 土台
- [ ] Docker Compose で全サービス起動確認
- [ ] cloudflared トンネル設定
- [ ] benkyo-runner コンテナで benkyo-cli 動作確認
- [ ] PostgreSQL + マイグレーション

### Phase 2 — 認証
- [ ] Claude Code OAuth フロー実装
- [ ] トークンペースト方式の API エンドポイント
- [ ] セッション管理

### Phase 3 — 教科管理
- [ ] 教科 CRUD API
- [ ] workspace 自動生成
- [ ] ファイルアップロード → 教科紐付け

### Phase 4 — キャンバス UI
- [ ] tldraw または Excalidraw の組み込み
- [ ] Canvas PNG エクスポート → 送信
- [ ] WebSocket でフィードバック受信・表示

### Phase 5 — benkyo-cli 統合
- [ ] benkyo-cli を API から呼び出すラッパー実装
- [ ] Claude Vision での手書き解釈
- [ ] 採点・フィードバックのフォーマット統一

### Phase 6 — 仕上げ
- [ ] iPad タッチ最適化（CSS・レイアウト）
- [ ] 学習進捗ダッシュボード
- [ ] セッション履歴・解答ログ閲覧

---

## 環境変数（.env 想定）

```env
# Claude
CLAUDE_API_TOKEN=

# DB
POSTGRES_USER=benkyo
POSTGRES_PASSWORD=
POSTGRES_DB=benkyo

# Cloudflared
CLOUDFLARE_TUNNEL_TOKEN=

# App
API_SECRET_KEY=
FRONTEND_URL=https://<your-tunnel>.trycloudflare.com
```

---

## 参照

- [benkyo-cli](https://github.com/youseiushida/benkyo)
- [Claude Code CLI](https://docs.anthropic.com/claude-code)
- [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
- [tldraw](https://tldraw.dev/)
