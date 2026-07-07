FROM node:20-slim
WORKDIR /app

# System-Dependencies fuer Puppeteers eigenes (gebuendeltes) Chrome.
# WICHTIG: Wir installieren NICHT das Debian-"chromium"-Paket mehr, sondern
# nutzen Puppeteers eigenes Chrome-Binary (siehe `npx puppeteer browsers
# install chrome` weiter unten). Das Debian-Paket hatte auf Render einen
# stillen Absturz ("Failed to launch the browser process: Code: null" ohne
# jede Fehlermeldung) verursacht, der lokal nicht reproduzierbar war -
# Puppeteers eigenes Chrome ist genau auf die installierte Puppeteer-Version
# abgestimmt und wird von den Puppeteer-Maintainern fuer Docker empfohlen.
# poppler-utils liefert `pdftoppm`, das die PDF-Live-Vorschau (Seite 1 als JPEG) benötigt
# Dies ist die von den Puppeteer-Maintainern offiziell dokumentierte Liste
# (https://pptr.dev/troubleshooting) fuer Debian/Ubuntu, ergaenzt um
# poppler-utils (PDF->JPEG fuer die Live-Vorschau) und dbus.
RUN apt-get update && apt-get install -y \
  ca-certificates \
  fonts-liberation \
  libasound2 \
  libatk-bridge2.0-0 \
  libatk1.0-0 \
  libc6 \
  libcairo2 \
  libcups2 \
  libdbus-1-3 \
  libdrm2 \
  libexpat1 \
  libfontconfig1 \
  libgbm1 \
  libgdk-pixbuf2.0-0 \
  libglib2.0-0 \
  libgtk-3-0 \
  libnspr4 \
  libnss3 \
  libpango-1.0-0 \
  libpangocairo-1.0-0 \
  libstdc++6 \
  libx11-6 \
  libx11-xcb1 \
  libxcb1 \
  libxcomposite1 \
  libxcursor1 \
  libxdamage1 \
  libxext6 \
  libxfixes3 \
  libxi6 \
  libxkbcommon0 \
  libxrandr2 \
  libxrender1 \
  libxss1 \
  libxtst6 \
  lsb-release \
  poppler-utils \
  dbus \
  xdg-utils \
  wget \
  --no-install-recommends && \
  rm -rf /var/lib/apt/lists/*

# System-D-Bus fuer Chromium bereitstellen (minimaler Container hat sonst keinen)
RUN mkdir -p /run/dbus

# Puppeteer soll sein eigenes, zur installierten Version passendes Chrome
# herunterladen (NICHT das Debian-Systempaket verwenden - siehe Kommentar
# oben). Cache-Verzeichnis liegt in /app/.cache/puppeteer, damit es beim
# `npm prune` weiter unten nicht mit geloescht wird.
ENV PUPPETEER_CACHE_DIR=/app/.cache/puppeteer

# Install dependencies
COPY package*.json ./
RUN npm ci
# Chrome-Binary herunterladen. Die dafuer noetigen System-Bibliotheken
# (libpango, libgtk etc.) sind bereits explizit oben per apt-get installiert
# - zuverlaessiger als sich allein auf --install-deps zu verlassen, das in
# diesem Image lautlos nichts bewirkt hat.
RUN npx puppeteer browsers install chrome

# Copy source and build
COPY . .
RUN npm run build

# Remove devDependencies after build
RUN npm prune --omit=dev

RUN chmod +x docker-entrypoint.sh

EXPOSE 5000
ENV NODE_ENV=production
ENV PORT=5000
# Puppeteer findet sein Chrome selbst ueber PUPPETEER_CACHE_DIR - kein
# PUPPETEER_EXECUTABLE_PATH mehr noetig (server/routes.ts faellt automatisch
# auf Puppeteers Standard-Pfad zurueck, wenn diese Variable nicht gesetzt ist).
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/index.cjs"]
