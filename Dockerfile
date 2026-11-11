FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY config/ ./config/
COPY lib/ ./lib/
COPY scripts/ ./scripts/
COPY site/ ./site/
RUN mkdir -p /app/data && chown -R node:node /app/data
ENV HOST=0.0.0.0 PORT=4173
EXPOSE 4173
USER node
CMD ["node", "scripts/serve.mjs"]
