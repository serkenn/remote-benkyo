# セットアップガイド

benkyo には **2 つの使い方**があります。目的の環境を選んでください。

---

## 使い方を選ぶ

| 使い方 | 概要 | 向いている人 |
|---|---|---|
| **CLI モード** | benkyo CLI + Claude Code をローカルにインストール | 普段 Claude Code を使っている開発者 |
| **Web クライアント** | Docker でサーバーに立ち上げ、ブラウザ（iPad 等）から操作 | タブレットや別端末から使いたい人 |

---

## 環境別ガイド

- [macOS](./mac.md)
- [Windows](./win.md)
- [Debian / Ubuntu](./debian.md)

---

## 早見表

### CLI モード（共通手順）

```bash
# 1. CLI インストール
uv tool install benkyo      # または: pipx install benkyo

# 2. Claude Code でスキルをインストール
/plugin marketplace add youseiushida/benkyo
/plugin install benkyo

# 3. 教材を用意して開始
# Claude Code を起動し、教材ファイルを共有して話しかけるだけ
```

### Web クライアント（Docker）

```bash
# docker compose up 一発で起動
docker compose up -d

# ブラウザで http://<サーバーIP>:3000 にアクセス
```

詳しいセットアップ手順（OS 別の前提条件インストール等）は各 OS ガイドを参照してください。
