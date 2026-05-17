# macOS セットアップ

[← セットアップ概要に戻る](./OVERVIEW.md)

---

## CLI モード

### 前提条件

| ツール | 推奨バージョン | 確認コマンド |
|---|---|---|
| Python | 3.12 以上 | `python3 --version` |
| uv または pipx | 最新 | `uv --version` / `pipx --version` |
| Claude Code | 最新 | `claude --version` |

### 1. Python と uv をインストール

```bash
# Homebrew で uv をインストール（推奨）
brew install uv

# または公式インストーラー
curl -LsSf https://astral.sh/uv/install.sh | sh
```

### 2. benkyo CLI をインストール

```bash
uv tool install benkyo
benkyo --version
```

### 3. Claude Code をインストール

```bash
# npm 経由
npm install -g @anthropic-ai/claude-code

# または Homebrew
brew install claude-code
```

### 4. benkyo スキルをインストール

Claude Code を起動後:

```
/plugin marketplace add youseiushida/benkyo
/plugin install benkyo
```

再起動すると `/help` に 5 つのスキルが表示されます。

### 5. 学習を開始

教材ファイル（PDF・テキスト等）があるディレクトリで Claude Code を起動し、話しかけます:

```
You: 数学の期末試験が 2 週間後にあります。過去問と教科書 PDF を用意しました。
```

---

## Web クライアント（iPad などから使う）

### 前提条件

| ツール | 推奨バージョン | 確認コマンド |
|---|---|---|
| Docker Desktop | 最新 | `docker --version` |

### 1. Docker Desktop をインストール

[Docker Desktop for Mac](https://www.docker.com/products/docker-desktop/) からダウンロードしてインストールします。

### 2. リポジトリをクローン

```bash
git clone https://github.com/youseiushida/benkyo.git
cd benkyo
```

### 3. 起動

```bash
docker compose up -d
```

初回ビルドには数分かかります。完了後、ブラウザで以下にアクセスします:

```
http://localhost:3000
```

同じ LAN 上の iPad や他のデバイスからは:

```
http://<Macの IPアドレス>:3000
```

Mac の IP アドレスは「システム設定 → Wi-Fi → 詳細 → TCP/IP」で確認できます。

### 4. 外出先からアクセス（Cloudflare Tunnel）

1. [Cloudflare Zero Trust ダッシュボード](https://one.dash.cloudflare.com/) でトンネルを作成してトークンを取得
2. Web UI の **設定（⚙️）→ 外部アクセス設定** にトークンを入力して保存
3. `cloudflared` コンテナが自動起動し、外部向け HTTPS URL が有効になります

### 停止・再起動

```bash
# 停止
docker compose down

# 再起動（データは benkyo_data ボリュームに永続化されます）
docker compose up -d
```

---

## トラブルシューティング

**`benkyo: command not found`**
```bash
# PATH を確認
export PATH="$HOME/.local/bin:$PATH"
# ~/.zshrc または ~/.bash_profile に追記して永続化
```

**Docker でポート 3000 が使われている**
```bash
# 別ポートを使う
sed -i '' 's/0.0.0.0:3000/0.0.0.0:8080/' docker-compose.yml
docker compose up -d
```

**Claude Code スキルが表示されない**
- Claude Code を完全に終了して再起動してください
- `benkyo --version` で CLI が動作していることを確認してください
