# Debian / Ubuntu セットアップ

[← セットアップ概要に戻る](./OVERVIEW.md)

> このガイドは Debian 12+ / Ubuntu 22.04+ を対象としています。  
> **サーバー（VPS など）に Web クライアントをデプロイする場合もこのガイドを参照してください。**

---

## CLI モード

### 前提条件

```bash
# システム更新
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git
```

### 1. Python 3.12 をインストール

```bash
# Ubuntu 22.04 / Debian 12 の場合
sudo apt install -y python3.12 python3.12-venv

# python3 が 3.12 以上か確認
python3 --version
```

Ubuntu 22.04 でデフォルトの Python が 3.10 の場合:

```bash
sudo add-apt-repository ppa:deadsnakes/ppa
sudo apt update
sudo apt install -y python3.12 python3.12-venv python3.12-distutils
```

### 2. uv をインストール

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
source $HOME/.local/bin/env   # または新しいシェルを開く
uv --version
```

### 3. benkyo CLI をインストール

```bash
uv tool install benkyo
benkyo --version
```

### 4. Claude Code をインストール

```bash
# Node.js が必要
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
npm install -g @anthropic-ai/claude-code
claude --version
```

### 5. benkyo スキルをインストール

Claude Code を起動後:

```
/plugin marketplace add serkenn/remote-benkyo
/plugin install benkyo
```

### 6. 学習を開始

```bash
cd ~/study-materials   # 教材ファイルがあるディレクトリ
claude
```

---

## Web クライアント（Docker サーバーデプロイ）

iPad やブラウザから LAN / インターネット経由でアクセスする Web UI を立ち上げます。

### 前提条件

- Debian 12 / Ubuntu 22.04 以上
- 公開サーバーの場合: ポート 3000 を開放

### 1. Docker をインストール

```bash
# 公式スクリプトでインストール（推奨）
curl -fsSL https://get.docker.com | sudo sh

# 現在のユーザーを docker グループに追加（sudo 不要にする）
sudo usermod -aG docker $USER
newgrp docker   # またはログアウト → ログイン

# 確認
docker --version
docker compose version
```

### 2. リポジトリをクローン

```bash
git clone https://github.com/serkenn/remote-benkyo.git
cd benkyo
```

### 3. 起動

```bash
docker compose up -d
```

初回ビルドは数分かかります。起動確認:

```bash
docker compose ps
# app と backend が "running" / "healthy" になるまで待つ
```

LAN 内からブラウザで:

```
http://<サーバーの IP>:3000
```

### 4. 外出先からアクセス（Cloudflare Tunnel）

**方法 A: Web UI から設定（推奨）**

1. [Cloudflare Zero Trust ダッシュボード](https://one.dash.cloudflare.com/) でトンネルを作成し、トークンをコピー
2. `http://<サーバーIP>:3000` にアクセス
3. **設定（⚙️）→ 外部アクセス設定** にトークンを貼り付けて「保存」
4. `cloudflared` コンテナが自動起動し、HTTPS URL が有効になります

**方法 B: 環境変数で設定**

```bash
cp .env.example .env
echo "CLOUDFLARE_TUNNEL_TOKEN=your_token_here" >> .env

# tunnel プロファイルを有効にして起動
docker compose --profile tunnel up -d
```

### 5. 自動起動を設定（systemd）

```bash
sudo tee /etc/systemd/system/benkyo.service > /dev/null <<'EOF'
[Unit]
Description=benkyo web client
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/home/YOUR_USER/benkyo
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
User=YOUR_USER

[Install]
WantedBy=multi-user.target
EOF

sudo sed -i "s/YOUR_USER/$USER/g" /etc/systemd/system/benkyo.service
sudo systemctl daemon-reload
sudo systemctl enable benkyo
sudo systemctl start benkyo
```

### 6. 更新

```bash
git pull
docker compose build --no-cache
docker compose up -d
```

---

## ファイアウォール設定

### ufw（Ubuntu デフォルト）

```bash
# LAN からのみ許可（例: 192.168.0.0/24）
sudo ufw allow from 192.168.0.0/24 to any port 3000

# または全 IP に開放（Cloudflare Tunnel を使う場合は不要）
sudo ufw allow 3000/tcp
```

### iptables（Debian デフォルト）

```bash
sudo iptables -A INPUT -p tcp --dport 3000 -j ACCEPT
sudo iptables-save | sudo tee /etc/iptables/rules.v4
```

---

## データの場所とバックアップ

```bash
# データの場所を確認
docker volume inspect benkyo_data

# バックアップ
docker run --rm \
  -v benkyo_data:/data \
  -v $(pwd):/backup \
  busybox tar czf /backup/benkyo-backup-$(date +%Y%m%d).tar.gz /data
```

---

## トラブルシューティング

**`docker compose` コマンドが見つからない**

```bash
sudo apt install -y docker-compose-plugin
docker compose version
```

**ポート 3000 がすでに使われている**

```bash
sudo ss -tlnp | grep 3000
# docker-compose.yml の ports を変更（例: 8080:3000）
```

**コンテナが起動しない**

```bash
docker compose logs backend
docker compose logs app
```

**スキルが Claude Code に表示されない**

```bash
benkyo --version
which benkyo
echo $PATH
```

`benkyo` が見つからない場合は `.bashrc` または `.profile` に以下を追加:

```bash
export PATH="$HOME/.local/bin:$PATH"
```
