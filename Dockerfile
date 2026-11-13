# One image, three roles (see compose.yaml):
#   web:     npm run start      (port 3000)
#   worker:  npm run worker
#   migrate: npm run db:migrate
FROM node:22-bookworm-slim

ARG GIT_COMMIT=unknown
ENV GIT_COMMIT=$GIT_COMMIT \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# Full node_modules and sources stay: the worker and migrations run from source with tsx.
RUN chown -R node:node /app
USER node

EXPOSE 3000
CMD ["npm", "run", "start"]
