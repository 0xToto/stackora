FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY mobile/package.json mobile/package.json
RUN npm ci --workspace server --include-workspace-root
COPY server server
RUN mkdir -p /data && chown node:node /data
USER node
ENV DATABASE_PATH=/data/stackora.sqlite PORT=3001 LOG_LEVEL=info
EXPOSE 3001
CMD ["npm", "run", "server"]
