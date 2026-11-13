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

# Everything is installed and built as the unprivileged `node` user, so no `chown -R` layer
# is needed afterwards (that layer used to copy the whole tree and double the image).
RUN mkdir -p /app && chown node:node /app
WORKDIR /app
USER node

COPY --chown=node:node package.json package-lock.json ./
RUN npm ci && npm cache clean --force

COPY --chown=node:node . .
# Full node_modules and sources stay: the worker and migrations run from source with tsx.
# The build cache is only useful for a second build in the same tree, which never happens here.
RUN npm run build && rm -rf .next/cache

EXPOSE 3000
CMD ["npm", "run", "start"]
