FROM node:22-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev --ignore-scripts && npm cache clean --force

COPY worker.js ./worker.js

RUN mkdir -p /data && chown -R node:node /app /data
USER node

ENV NODE_ENV=production
ENV POLL_MS=5000
ENV AUTH_STATE_FILE=/data/firebase-auth.json

CMD ["node", "worker.js"]
