# Setup Guide / セットアップガイド

benkyo has two modes. Pick your environment below.  
benkyo には 2 つの使い方があります。環境を選んでください。

---

## Environment guides / 環境別ガイド

| | macOS | Windows | Debian / Ubuntu |
|---|---|---|---|
| 🇬🇧 English | [mac.md](./mac.md) | [win.md](./win.md) | [debian.md](./debian.md) |
| 🇯🇵 日本語 | [mac-jp.md](./mac-jp.md) | [win-jp.md](./win-jp.md) | [debian-jp.md](./debian-jp.md) |

---

## Modes / 使い方

| Mode | Description | Best for |
|---|---|---|
| **CLI mode** | Install benkyo CLI + Claude Code locally | Developers already using Claude Code |
| **Web client** | Deploy via Docker, access from browser (iPad etc.) | Tablet / multi-device use |

| 使い方 | 概要 | 向いている人 |
|---|---|---|
| **CLI モード** | benkyo CLI + Claude Code をローカルにインストール | 普段 Claude Code を使っている開発者 |
| **Web クライアント** | Docker でサーバーに立ち上げ、ブラウザ（iPad 等）から操作 | タブレットや別端末から使いたい人 |

---

## Quick start

### CLI mode

```bash
# 1. Install the CLI
uv tool install benkyo        # or: pipx install benkyo

# 2. Install skills (inside Claude Code)
/plugin marketplace add youseiushida/benkyo
/plugin install benkyo
```

### Web client (Docker)

```bash
docker compose up -d
# Open: http://<server-ip>:3000
```

For external HTTPS access, enter a Cloudflare Tunnel token in **Settings (⚙️) → External Access** — the `cloudflared` container starts automatically.

---

## 早見表

### CLI モード

```bash
# 1. CLI インストール
uv tool install benkyo        # または: pipx install benkyo

# 2. スキルをインストール（Claude Code 内で）
/plugin marketplace add youseiushida/benkyo
/plugin install benkyo
```

### Web クライアント（Docker）

```bash
docker compose up -d
# ブラウザで http://<サーバーIP>:3000 にアクセス
```

外出先から HTTPS でアクセスするには **設定（⚙️）→ 外部アクセス設定** で Cloudflare Tunnel トークンを入力してください。`cloudflared` コンテナが自動起動します。
