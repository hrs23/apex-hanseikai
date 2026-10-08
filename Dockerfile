FROM node:24-slim AS web
WORKDIR /src/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM node:24-slim AS server
WORKDIR /src
COPY server/package.json server/package-lock.json server/
RUN npm --prefix server ci
COPY server/ server/
RUN npm --prefix server run build

FROM node:24-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app
RUN mkdir /recordings
COPY --from=server /src/server/dist/server.mjs ./server.mjs
COPY --from=server /src/server/node_modules/swagger-ui-dist/swagger-ui.css /src/server/node_modules/swagger-ui-dist/swagger-ui-bundle.js ./swagger-ui/
COPY --from=web /src/web/dist ./web
ARG APP_REVISION=development
ENV APP_REVISION=$APP_REVISION \
    PORT=8080 \
    DB_PATH=/data/apex.db \
    RECORDINGS_DIR=/recordings \
    CACHE_DIR=/data/cache \
    WEB_DIST=/app/web \
    SWAGGER_UI_DIR=/app/swagger-ui
VOLUME /data
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:8080/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "server.mjs"]
