#!/bin/bash
set -e

# Ensure volume-mounted directories are writable by claudeuser.
# Named Docker volumes are owned by root on first creation, so we chown at startup.
chown claudeuser:claudeuser /app/uploads /app/workspaces 2>/dev/null || true

# Drop root and run uvicorn as claudeuser.
# su without -l does not set HOME; export it explicitly so claude can find
# its credentials in /home/claudeuser/.claude/.
exec su -s /bin/bash claudeuser -c "export HOME=/home/claudeuser; exec uvicorn app.main:app --host 0.0.0.0 --port 8000"
