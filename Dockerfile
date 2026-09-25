FROM mcr.microsoft.com/playwright:v1.51.0-noble

WORKDIR /app

COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY . .
RUN npm run build

RUN mkdir -p data/snapshots data/screenshots

ENV PORT=3000
ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "dist/server.cjs"]
