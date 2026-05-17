# Windows セットアップ

[← セットアップ概要に戻る](./OVERVIEW.md)

> **推奨:** Windows では WSL 2 上で動かすことを推奨します。ネイティブ Windows でも動きますが、WSL 2 の方がトラブルが少ないです。

---

## CLI モード（WSL 2 推奨）

### WSL 2 を使う場合（推奨）

#### 1. WSL 2 をセットアップ

PowerShell（管理者）で:

```powershell
wsl --install
```

再起動後、Ubuntu がインストールされます。その後は [Debian / Ubuntu ガイド](./debian-jp.md) の手順に従ってください。

---

### ネイティブ Windows を使う場合

#### 前提条件

| ツール | 推奨バージョン | 確認コマンド |
|---|---|---|
| Python | 3.12 以上 | `python --version` |
| uv または pipx | 最新 | `uv --version` |
| Claude Code | 最新 | `claude --version` |

#### 1. Python をインストール

[python.org](https://www.python.org/downloads/) からダウンロード。インストール時に **「Add Python to PATH」にチェックを入れること**。

#### 2. uv をインストール

PowerShell で:

```powershell
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
```

#### 3. benkyo CLI をインストール

```powershell
uv tool install benkyo
benkyo --version
```

文字化けが出る場合は PowerShell を UTF-8 モードに:

```powershell
$OutputEncoding = [Console]::OutputEncoding = [Text.UTF8Encoding]::new()
```

`$PROFILE` に追記して永続化することを推奨します。

#### 4. Claude Code をインストール

```powershell
npm install -g @anthropic-ai/claude-code
```

Node.js が必要です。[nodejs.org](https://nodejs.org/) からインストールしてください。

#### 5. benkyo スキルをインストール

Claude Code を起動後:

```
/plugin marketplace add youseiushida/benkyo
/plugin install benkyo
```

#### 6. 学習を開始

教材ファイルがあるフォルダで Claude Code を起動します:

```powershell
cd C:\Users\YourName\Documents\study-math
claude
```

---

## Web クライアント（ブラウザ・iPad から使う）

### 前提条件

| ツール | 確認コマンド |
|---|---|
| Docker Desktop for Windows | `docker --version` |
| WSL 2（Docker Desktop が使用） | `wsl --status` |

### 1. Docker Desktop をインストール

[Docker Desktop for Windows](https://www.docker.com/products/docker-desktop/) をインストールします。WSL 2 バックエンドを使うよう設定してください（デフォルト）。

### 2. リポジトリをクローン

PowerShell または WSL 端末で:

```bash
git clone https://github.com/youseiushida/benkyo.git
cd benkyo
```

### 3. 起動

```powershell
docker compose up -d
```

ブラウザで `http://localhost:3000` にアクセスします。

同じ LAN 上の iPad などからは:

```
http://<Windows の IP アドレス>:3000
```

Windows の IP アドレスは PowerShell で確認:

```powershell
ipconfig | findstr "IPv4"
```

### 4. 外出先からアクセス（Cloudflare Tunnel）

1. [Cloudflare Zero Trust ダッシュボード](https://one.dash.cloudflare.com/) でトンネルを作成してトークンを取得
2. Web UI の **設定（⚙️）→ 外部アクセス設定** にトークンを入力して保存
3. `cloudflared` コンテナが自動起動します

### 停止

```powershell
docker compose down
```

データは `benkyo_data` という Docker ボリュームに永続化されます。

---

## トラブルシューティング

**`benkyo` が認識されない（ネイティブ Windows）**

```powershell
# PATH に uv の bin ディレクトリを追加
$env:PATH += ";$env:USERPROFILE\.local\bin"
# 永続化するには システム → 詳細設定 → 環境変数 で PATH を編集
```

**Docker が起動しない**
- Docker Desktop が実行中か確認（タスクバーのアイコン）
- WSL 2 が有効か確認: `wsl --status`

**日本語が文字化けする（ネイティブ Windows）**
- PowerShell / cmd で `chcp 65001` を実行して UTF-8 に切り替えてください

**Claude Code でスキルが表示されない**
- Claude Code を完全終了して再起動
- `benkyo --version` で CLI が動作していることを確認
