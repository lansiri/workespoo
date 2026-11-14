# Speech to text on our own server (docs/research/voice-stt.md).
#
# sherpa-onnx's websocket server with NVIDIA's Parakeet TDT 0.6b v3 (int8): one multilingual model
# for English, Finnish and Swedish. The web container sends it audio over a private network; it
# answers with text. It keeps nothing: no volume, no log file, a read-only file system, and no
# route to the internet (see the `stt` service in compose.yaml).
#
# Built once and reused: the image tag in compose.yaml names the model, and the deploy hook builds
# it only when that tag is missing. Both downloads are checked against their SHA-256; a mismatch
# fails the build.
FROM node:22-bookworm-slim

ARG SHERPA_VERSION=v2.0.1
ARG STT_MODEL=sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8

RUN set -eu; \
    apt-get update; \
    apt-get install -y --no-install-recommends bzip2 ca-certificates curl; \
    mkdir -p /opt/stt/bin /opt/stt/lib /opt/stt/model /tmp/stt; \
    cd /tmp/stt; \
    G=https://github.com/k2-fsa/sherpa-onnx/releases/download; \
    RT="sherpa-onnx-${SHERPA_VERSION}-linux-x64-shared-no-tts"; \
    curl -fsSL --retry 3 --retry-delay 5 -o rt.tar.bz2 "$G/${SHERPA_VERSION}/$RT.tar.bz2"; \
    curl -fsSL --retry 3 --retry-delay 5 -o model.tar.bz2 "$G/asr-models/${STT_MODEL}.tar.bz2"; \
    printf '%s  %s\n' \
      b3b095f619059d54914027ff38f8a0a132ea3bbc5df32a212a9743a8bd1467b2 rt.tar.bz2 \
      1495e91b59d7fc53ddca91f3431758ec99f8fa253fdb0e1e851be0f72b14b0f9 model.tar.bz2 \
      > SHA256SUMS; \
    sha256sum --check --strict SHA256SUMS; \
    tar --no-same-owner -xjf rt.tar.bz2 "$RT/bin/sherpa-onnx-offline-websocket-server" "$RT/lib/libonnxruntime.so"; \
    tar --no-same-owner -xjf model.tar.bz2 \
      "${STT_MODEL}/encoder.int8.onnx" "${STT_MODEL}/decoder.int8.onnx" "${STT_MODEL}/joiner.int8.onnx" "${STT_MODEL}/tokens.txt"; \
    mv "$RT/bin/sherpa-onnx-offline-websocket-server" /opt/stt/bin/; \
    mv "$RT/lib/libonnxruntime.so" /opt/stt/lib/; \
    mv "${STT_MODEL}"/* /opt/stt/model/; \
    cd /; rm -rf /tmp/stt; \
    chmod -R a+rX /opt/stt; \
    test -x /opt/stt/bin/sherpa-onnx-offline-websocket-server; \
    apt-get purge -y bzip2 curl; apt-get autoremove -y; rm -rf /var/lib/apt/lists/*

ENV LD_LIBRARY_PATH=/opt/stt/lib
USER node
EXPOSE 6006

# One recording at a time, on both cores. The server's own log would only repeat what goes to
# stdout (connections and counts, never audio or text), so it goes nowhere.
# A recording longer than 35 seconds is refused; the app cuts at 30 at the latest.
CMD ["/opt/stt/bin/sherpa-onnx-offline-websocket-server", \
     "--port=6006", "--num-io-threads=1", "--num-work-threads=1", "--max-batch-size=1", \
     "--max-utterance-length=35", "--log-file=/dev/null", \
     "--tokens=/opt/stt/model/tokens.txt", \
     "--encoder=/opt/stt/model/encoder.int8.onnx", \
     "--decoder=/opt/stt/model/decoder.int8.onnx", \
     "--joiner=/opt/stt/model/joiner.int8.onnx", \
     "--model-type=nemo_transducer", "--num-threads=2"]
