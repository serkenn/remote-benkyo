# macOS Setup

[← Back to Setup Overview](./OVERVIEW.md) | [日本語版](./mac-jp.md)

---

## CLI mode

### Prerequisites

| Tool | Required version | Check |
|---|---|---|
| Python | 3.12+ | `python3 --version` |
| uv or pipx | latest | `uv --version` / `pipx --version` |
| Claude Code | latest | `claude --version` |

### 1. Install Python and uv

```bash
# Install uv via Homebrew (recommended)
brew install uv

# Or use the official installer
curl -LsSf https://astral.sh/uv/install.sh | sh
```

### 2. Install the benkyo CLI

```bash
uv tool install benkyo
benkyo --version
```

### 3. Install Claude Code

```bash
# via npm
npm install -g @anthropic-ai/claude-code

# or via Homebrew
brew install claude-code
```

### 4. Install the benkyo skills

After launching Claude Code:

```
/plugin marketplace add youseiushida/benkyo
/plugin install benkyo
```

Restart Claude Code — the 5 skills appear in `/help`.

### 5. Start studying

Launch Claude Code in the directory where your study materials live, then describe what you want:

```
You: I have past exam papers and the textbook PDF for calculus. The exam is in 2 weeks.
```

---

## Web client (iPad / browser access)

### Prerequisites

| Tool | Required version | Check |
|---|---|---|
| Docker Desktop | latest | `docker --version` |

### 1. Install Docker Desktop

Download and install [Docker Desktop for Mac](https://www.docker.com/products/docker-desktop/).

### 2. Clone the repository

```bash
git clone https://github.com/youseiushida/benkyo.git
cd benkyo
```

### 3. Start

```bash
docker compose up -d
```

The first build takes a few minutes. Once complete, open in your browser:

```
http://localhost:3000
```

From an iPad or other device on the same LAN:

```
http://<Mac's IP address>:3000
```

Find your Mac's IP in **System Settings → Wi-Fi → Details → TCP/IP**.

### 4. Remote access (Cloudflare Tunnel)

1. Create a tunnel at the [Cloudflare Zero Trust dashboard](https://one.dash.cloudflare.com/) and copy the token
2. In the web UI, open **Settings (⚙️) → External Access** and paste the token
3. The `cloudflared` container starts automatically and an HTTPS URL becomes active

### Stop / restart

```bash
docker compose down    # stop
docker compose up -d   # restart (data persists in the benkyo_data volume)
```

---

## Troubleshooting

**`benkyo: command not found`**
```bash
export PATH="$HOME/.local/bin:$PATH"
# Add to ~/.zshrc or ~/.bash_profile to persist
```

**Port 3000 already in use**
```bash
sed -i '' 's/0.0.0.0:3000/0.0.0.0:8080/' docker-compose.yml
docker compose up -d
```

**benkyo skills not showing in Claude Code**
- Fully quit and restart Claude Code
- Verify the CLI works: `benkyo --version`
