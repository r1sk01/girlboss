FROM debian:trixie

ARG JAVA_VERSION=25
ARG SIGNAL_CLI_VERSION=0.14.4.1

ENV JAVA_VERSION=${JAVA_VERSION}
ENV SIGNAL_CLI_VERSION=${SIGNAL_CLI_VERSION}

RUN mkdir -p /app/config
WORKDIR /app

RUN apt-get update && apt-get upgrade -y && apt-get install -y --no-install-recommends curl wget ca-certificates bash build-essential

RUN tmpdir="$(mktemp -d)" \
    && cd "$tmpdir" \
    && wget "https://download.oracle.com/java/${JAVA_VERSION}/latest/jdk-${JAVA_VERSION}_linux-x64_bin.deb" \
    && dpkg -i "jdk-${JAVA_VERSION}_linux-x64_bin.deb" \
    && wget "https://github.com/AsamK/signal-cli/releases/download/v${SIGNAL_CLI_VERSION}/signal-cli-${SIGNAL_CLI_VERSION}.tar.gz" -O signal-cli.tar.gz \
    && tar -xzf signal-cli.tar.gz \
    && mv "signal-cli-${SIGNAL_CLI_VERSION}/bin/"* /usr/local/bin/ \
    && mv "signal-cli-${SIGNAL_CLI_VERSION}/lib/"* /usr/local/lib/ \
    && cd /app \
    && rm -rf "$tmpdir"

RUN apt-get update && apt-get upgrade -y && apt-get clean

CMD [ "signal-cli", "--config", "/app/config", "daemon", "--tcp", "0.0.0.0:64", "--receive-mode", "on-connection", "--no-receive-stdout" ]
