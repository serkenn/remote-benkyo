# Windows Setup

[← Back to Setup Overview](./OVERVIEW.md) | [日本語版](./win-jp.md)

> **Recommended:** Running benkyo under WSL 2 is strongly recommended. Native Windows works, but WSL 2 avoids most friction points.

---

## CLI mode (WSL 2 recommended)

### Using WSL 2 (recommended)

#### 1. Set up WSL 2

In PowerShell (Administrator):

```powershell
wsl --install
```

After rebooting, Ubuntu will be installed. Follow the [Debian / Ubuntu guide](./debian.md) from that point.

---

### Native Windows

#### Prerequisites

| Tool | Required version | Check |
|---|---|---|
| Python | 3.12+ | `python --version` |
| uv or pipx | latest | `uv --version` |
| Claude Code | latest | `claude --version` |

#### 1. Install Python

Download from [python.org](https://www.python.org/downloads/). **Check "Add Python to PATH"** during installation.

#### 2. Install uv

In PowerShell:

```powershell
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
```

#### 3. Install the benkyo CLI

```powershell
uv tool install benkyo
benkyo --version
```

If you see garbled output, switch PowerShell to UTF-8 mode:

```powershell
$OutputEncoding = [Console]::OutputEncoding = [Text.UTF8Encoding]::new()
```

Add this to `$PROFILE` to make it permanent.

#### 4. Install Claude Code

```powershell
npm install -g @anthropic-ai/claude-code
```

Node.js is required — install it from [nodejs.org](https://nodejs.org/).

#### 5. Install the benkyo skills

After launching Claude Code:

```
/plugin marketplace add serkenn/remote-benkyo
/plugin install benkyo
```

#### 6. Start studying

Launch Claude Code in the folder where your study materials are:

```powershell
cd C:\Users\YourName\Documents\study-math
claude
```

---

## Web client (browser / iPad access)

### Prerequisites

| Tool | Check |
|---|---|
| Docker Desktop for Windows | `docker --version` |
| WSL 2 (used by Docker Desktop) | `wsl --status` |

### 1. Install Docker Desktop

Install [Docker Desktop for Windows](https://www.docker.com/products/docker-desktop/). Keep the default WSL 2 backend enabled.

### 2. Clone the repository

In PowerShell or a WSL terminal:

```bash
git clone https://github.com/serkenn/remote-benkyo.git
cd benkyo
```

### 3. Start

```powershell
docker compose up -d
```

Open `http://localhost:3000` in your browser.

From an iPad or other device on the same LAN:

```
http://<Windows IP address>:3000
```

Find your IP in PowerShell:

```powershell
ipconfig | findstr "IPv4"
```

### 4. Remote access (Cloudflare Tunnel)

1. Create a tunnel at the [Cloudflare Zero Trust dashboard](https://one.dash.cloudflare.com/) and copy the token
2. In the web UI, open **Settings (⚙️) → External Access** and paste the token
3. The `cloudflared` container starts automatically

### Stop

```powershell
docker compose down
```

Data persists in the `benkyo_data` Docker volume.

---

## Troubleshooting

**`benkyo` not recognised (native Windows)**

```powershell
$env:PATH += ";$env:USERPROFILE\.local\bin"
# To persist: edit PATH in System → Advanced Settings → Environment Variables
```

**Docker won't start**
- Check that Docker Desktop is running (system tray icon)
- Verify WSL 2 is enabled: `wsl --status`

**Garbled characters (native Windows)**
- Run `chcp 65001` in PowerShell / cmd to switch to UTF-8

**benkyo skills not showing in Claude Code**
- Fully quit and restart Claude Code
- Verify the CLI works: `benkyo --version`
