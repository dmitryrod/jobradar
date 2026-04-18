FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

RUN npx playwright install --with-deps chromium

COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENV DASHBOARD_PORT=3849

EXPOSE 3849

ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "scripts/dashboard-server.mjs"]