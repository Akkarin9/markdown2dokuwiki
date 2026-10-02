# --- Fase 1: build dell'app statica -------------------------------------
FROM node:22-alpine AS build

WORKDIR /app

# Installa le dipendenze in uno strato separato (cache-friendly).
COPY package.json package-lock.json ./
RUN npm ci

# Copia i sorgenti e compila la build di produzione in /app/dist.
COPY . .
RUN npm run build

# --- Fase 2: servizio statico con nginx ----------------------------------
FROM nginx:alpine

# SPA senza routing: basta servire i file statici.
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null --tries=1 http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
