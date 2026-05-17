# Debian / Ubuntu Setup

[← Back to Setup Overview](./OVERVIEW.md) | [日本語版](./debian-jp.md)

> Targets Debian 12+ / Ubuntu 22.04+.  
> **Also use this guide to deploy the web client on a VPS or home server.**

---

## CLI mode

### Prerequisites

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git
```

### 1. Install Python 3.12

```bash
# Ubuntu 22.04 / Debian 12
sudo apt install -y python3.12 python3.12-venv
python3 --version
```

If Ubuntu 22.04 ships Python 3.10 by default:

```bash
sudo add-apt-repository ppa:deadsnakes/ppa
sudo apt update
sudo apt install -y python3.12 python3.12-venv python3.12-distutils
```

### 2. Install uv

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
source $HOME/.local/bin/env   # or open a new shell
uv --version
```

### 3. Install the benkyo CLI

```bash
uv tool install benkyo
benkyo --version
```

### 4. Install Claude Code

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
npm install -g @anthropic-ai/claude-code
claude --version
```

### 5. Install the benkyo skills

After launching Claude Code:

```
/plugin marketplace add youseiushida/benkyo
/plugin install benkyo
```

### 6. Start studying

```bash
cd ~/study-materials
claude
```

---

## Web client (Docker server deployment)

Serves a browser UI accessible over LAN or the internet from any device.

### Prerequisites

- Debian 12 / Ubuntu 22.04+
- If exposing publicly: open port 3000 in your firewall

### 1. Install Docker

```bash
curl -fsSL https://get.docker.com | sudo sh

# Allow running Docker without sudo
sudo usermod -aG docker $USER
newgrp docker

docker --version
docker compose version
```

### 2. Clone the repository

```bash
git clone https://github.com/youseiushida/benkyo.git
cd benkyo
```

### 3. Start

```bash
docker compose up -d
```

Check status:

```bash
docker compose ps
# Wait until both 'app' and 'backend' are "running" / "healthy"
```

Open from a browser on the same LAN:

```
http://<server IP>:3000
```

### 4. Remote access (Cloudflare Tunnel)

**Option A: via the web UI (recommended)**

1. Create a tunnel at the [Cloudflare Zero Trust dashboard](https://one.dash.cloudflare.com/) and copy the token
2. Open `http://<server IP>:3000`
3. Go to **Settings (⚙️) → External Access**, paste the token, and save
4. The `cloudflared` container starts automatically and HTTPS access becomes active

**Option B: via environment variable**

```bash
cp .env.example .env
echo "CLOUDFLARE_TUNNEL_TOKEN=your_token_here" >> .env
docker compose --profile tunnel up -d
```

### 5. Auto-start with systemd

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

### 6. Update

```bash
git pull
docker compose build --no-cache
docker compose up -d
```

---

## Firewall

### ufw (Ubuntu default)

```bash
# Allow LAN only (e.g. 192.168.0.0/24)
sudo ufw allow from 192.168.0.0/24 to any port 3000

# Or open to all IPs (not needed if using Cloudflare Tunnel)
sudo ufw allow 3000/tcp
```

### iptables (Debian default)

```bash
sudo iptables -A INPUT -p tcp --dport 3000 -j ACCEPT
sudo iptables-save | sudo tee /etc/iptables/rules.v4
```

---

## Data location and backup

Data lives in the `benkyo_data` Docker volume.

```bash
# Inspect volume location
docker volume inspect benkyo_data

# Backup to a tar archive on the host
docker run --rm \
  -v benkyo_data:/data \
  -v $(pwd):/backup \
  busybox tar czf /backup/benkyo-backup-$(date +%Y%m%d).tar.gz /data
```

---

## Troubleshooting

**`docker compose` not found**

```bash
sudo apt install -y docker-compose-plugin
docker compose version
```

**Port 3000 already in use**

```bash
sudo ss -tlnp | grep 3000
# Edit ports in docker-compose.yml (e.g. 8080:3000)
```

**Container fails to start**

```bash
docker compose logs backend
docker compose logs app
```

**benkyo skills not showing in Claude Code**

```bash
benkyo --version
which benkyo
echo $PATH
```

If `benkyo` is not found, add to `.bashrc` or `.profile`:

```bash
export PATH="$HOME/.local/bin:$PATH"
```
