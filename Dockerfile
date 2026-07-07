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
RUN apt-get update && apt-get install -y \
  poppler-utils \
  dbus \
  fonts-liberation \
  libasound2 \
  libatk-bridge2.0-0 \
  libatk1.0-0 \
  libcups2 \
  libdbus-1-3 \
  libdrm2 \
  libgbm1 \
  libgdk-pixbuf2.0-0 \
  libnspr4 \
  libnss3 \
  libx11-xcb1 \
  libxcomposite1 \
  libxdamage1 \
  libxfixes3 \
  libxkbcommon0 \
  libxrandr2 \
  xdg-utils \
  wget \
  ca-certificates \
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
# --install-deps installiert automatisch ALLE fehlenden System-Bibliotheken
# fuer das heruntergeladene Chrome (z.B. libpango, libgtk etc.), die im
# minimalen node:20-slim-Image standardmaessig fehlen. Das ist zuverlässiger
# als eine manuell gepflegte apt-get-Liste, die schnell veraltet.
RUN npx puppeteer browsers install chrome --install-deps

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
