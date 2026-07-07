#!/bin/sh
# Startet einen System-D-Bus im Container, bevor der Node-Server (und damit
# Puppeteer/Chromium) hochfaehrt. Ohne diesen Daemon versucht Chromium beim
# Start eine Verbindung zu /run/dbus/system_bus_socket aufzubauen, findet
# nichts und bricht den Browser-Start komplett ab ("Failed to launch the
# browser process").
set -e

mkdir -p /run/dbus
rm -f /run/dbus/pid

# --system startet den System-Bus (nicht den Session-Bus) und schreibt die
# PID-Datei, die er selbst danach wieder aufraeumt falls vorhanden.
dbus-daemon --system --fork || echo "[entrypoint] dbus-daemon konnte nicht gestartet werden, fahre trotzdem fort"

exec "$@"
