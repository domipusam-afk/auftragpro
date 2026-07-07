#!/bin/sh
# Startet System- UND Session-D-Bus im Container, bevor der Node-Server (und
# damit Puppeteer/Chromium) hochfaehrt. Chromium versucht beim Start sowohl
# den System-Bus als auch den Session-Bus zu erreichen. Fehlt einer davon
# oder ist DBUS_SESSION_BUS_ADDRESS nicht gesetzt/parsebar, bricht der
# komplette Browser-Start ab ("Failed to launch the browser process").
set -e

# --- System-Bus ---
mkdir -p /run/dbus
rm -f /run/dbus/pid
dbus-daemon --system --fork --nopidfile --syslog-only || echo "[entrypoint] system dbus-daemon konnte nicht gestartet werden, fahre trotzdem fort"

# --- Session-Bus ---
export XDG_RUNTIME_DIR=/tmp/runtime-root
mkdir -p "$XDG_RUNTIME_DIR"
chmod 700 "$XDG_RUNTIME_DIR"

export DBUS_SESSION_BUS_ADDRESS="unix:path=$XDG_RUNTIME_DIR/bus"
dbus-daemon --session --address="$DBUS_SESSION_BUS_ADDRESS" --fork --nopidfile --syslog-only || echo "[entrypoint] session dbus-daemon konnte nicht gestartet werden, fahre trotzdem fort"

exec "$@"
