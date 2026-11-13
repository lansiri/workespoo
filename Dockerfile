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

# Piper speech synthesis (docs/research/voice-piper.md): the pinned binary and one voice each
# for en, fi and sv under /opt/piper. Runs as root before anything else so a code or
# dependency change never downloads them again. Every file is checked against its SHA-256 and
# a mismatch fails the build. Files stay root-owned and world-readable.
ARG PIPER_RELEASE=2023.11.14-2
ARG PIPER_VOICES_REV=v1.0.0
ENV PIPER_DIR=/opt/piper
RUN set -eu; \
    mkdir -p /opt/piper/voices; \
    cd /opt/piper; \
    fetch1() { node -e 'fetch(process.argv[1]).then(async (r) => { if (!r.ok) throw new Error("HTTP " + r.status + " " + process.argv[1]); require("fs").writeFileSync(process.argv[2], Buffer.from(await r.arrayBuffer())); }).catch((e) => { console.error(String(e)); process.exit(1); })' "$1" "$2"; }; \
    dl() { for i in 1 2 3; do fetch1 "$1" "$2" && return 0; sleep 5; done; return 1; }; \
    dl "https://github.com/rhasspy/piper/releases/download/${PIPER_RELEASE}/piper_linux_x86_64.tar.gz" piper.tar.gz; \
    V="https://huggingface.co/rhasspy/piper-voices/resolve/${PIPER_VOICES_REV}"; \
    for f in en/en_GB/cori/medium/en_GB-cori-medium fi/fi_FI/harri/medium/fi_FI-harri-medium sv/sv_SE/nst/medium/sv_SE-nst-medium; do \
      dl "$V/$f.onnx" "voices/${f##*/}.onnx"; \
      dl "$V/$f.onnx.json" "voices/${f##*/}.onnx.json"; \
    done; \
    printf '%s  %s\n' \
      a50cb45f355b7af1f6d758c1b360717877ba0a398cc8cbe6d2a7a3a26e225992 piper.tar.gz \
      1899f98e5fb8310154f3c2973f4b8a929ba7245e722b3d3a85680b833d95f10d voices/en_GB-cori-medium.onnx \
      e262c16d7f192f69d4edd6b4ef8a5915379e67495fcc402f1ab15eeb33da3d36 voices/en_GB-cori-medium.onnx.json \
      a44167faa34caed940e4fcad139fcc35922266b2593bcebe77701774c0fb2389 voices/fi_FI-harri-medium.onnx \
      3f9c9f76f74adf1fbe7279e41eea17d6610757e45effd6808bbea6be74b8916d voices/fi_FI-harri-medium.onnx.json \
      df011f56825a59dd1efc080c38a65a1ef70407e60f63050e9246f43a3d7e471e voices/sv_SE-nst-medium.onnx \
      d45dd74cbb4eca58694bf04a97e243044092476f28a55ae26424f0653086980a voices/sv_SE-nst-medium.onnx.json \
      > SHA256SUMS; \
    sha256sum --check --strict SHA256SUMS; \
    tar --no-same-owner -xzf piper.tar.gz; \
    rm piper.tar.gz SHA256SUMS; \
    chmod -R a+rX /opt/piper; \
    test -x piper/piper

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
