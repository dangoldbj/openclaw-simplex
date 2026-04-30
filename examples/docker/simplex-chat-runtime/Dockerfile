FROM debian:bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl netcat-openbsd \
  && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://raw.githubusercontent.com/simplex-chat/simplex-chat/stable/install.sh | bash

RUN mkdir -p /var/lib/simplex/files /var/lib/simplex/tmp

WORKDIR /var/lib/simplex

CMD ["simplex-chat", "-p", "5225", "--device-name", "OpenClaw SimpleX", "--files-folder", "/var/lib/simplex/files", "--temp-folder", "/var/lib/simplex/tmp"]
