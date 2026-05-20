#!/bin/bash
set -e

# Ensure volume-mounted directories are writable by claudeuser.
# Named Docker volumes are owned by root on first creation, so we chown at startup.
chown claudeuser:claudeuser /app/uploads /app/workspaces 2>/dev/null || true

# Sync host Claude credentials into claudeuser's home on every startup so that
# container restarts/rebuilds don't require re-authenticating via the web UI.
if [ -f /tmp/.host-claude-credentials ]; then
    mkdir -p /home/claudeuser/.claude
    cp /tmp/.host-claude-credentials /home/claudeuser/.claude/.credentials.json
    chown claudeuser:claudeuser /home/claudeuser/.claude/.credentials.json
    chmod 600 /home/claudeuser/.claude/.credentials.json
fi

# Drop root and run uvicorn as claudeuser.
# su without -l does not set HOME; export it explicitly so claude can find
# its credentials in /home/claudeuser/.claude/.
exec su -s /bin/bash claudeuser -c "export HOME=/home/claudeuser; exec uvicorn app.main:app --host 0.0.0.0 --port 8000"
