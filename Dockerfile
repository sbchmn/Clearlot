# DigitalOcean App Platform (and any Node host).
# Grok/Vercel deploys ignore this file and use the Nitro vercel preset.
FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV NITRO_PRESET=node-server
RUN npm run build
ENV PORT=8080
ENV HOST=0.0.0.0
EXPOSE 8080
CMD ["node", ".output/server/index.mjs"]
