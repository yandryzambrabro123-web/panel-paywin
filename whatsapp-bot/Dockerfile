# Receta de construcción propia del bot (así Railway no usa su plantilla automática, que fallaba
# con "secret TELEGRAM_BOT_TOKEN not found"). Las variables se leen cuando el bot ARRANCA, no aquí.
# Imagen completa de node (trae git, que baileys necesita para instalar sus dependencias).
FROM node:20-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY . .
# El volumen de la sesión de WhatsApp se monta en /app/auth_info (ver README).
CMD ["node", "index.js"]
