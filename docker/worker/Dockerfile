FROM ubuntu:24.04

ARG ANDROID_CMDLINE_TOOLS=11076708
ENV DEBIAN_FRONTEND=noninteractive \
    ANDROID_HOME=/opt/android-sdk \
    ANDROID_SDK_ROOT=/opt/android-sdk \
    JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64 \
    PATH=/opt/android-sdk/cmdline-tools/latest/bin:/opt/android-sdk/platform-tools:/usr/lib/jvm/java-17-openjdk-amd64/bin:$PATH

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       ca-certificates curl git openjdk-17-jdk-headless python3 sqlite3 unzip zip \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /opt/android-sdk/cmdline-tools /tmp/android-tools \
    && curl -fsSL --retry 3 \
       "https://dl.google.com/android/repository/commandlinetools-linux-${ANDROID_CMDLINE_TOOLS}_latest.zip" \
       -o /tmp/android-tools/tools.zip \
    && unzip -q /tmp/android-tools/tools.zip -d /tmp/android-tools \
    && mv /tmp/android-tools/cmdline-tools /opt/android-sdk/cmdline-tools/latest \
    && rm -rf /tmp/android-tools \
    && yes | sdkmanager --licenses >/dev/null \
    && sdkmanager "platform-tools" "platforms;android-36" "build-tools;36.0.0"

WORKDIR /worker
COPY docker/worker/worker.py /worker/worker.py
RUN mkdir -p /worker/assets
COPY public/assets/799645628_1052852437562992_1942421779255659784_n-1.webp \
     /worker/assets/quantum_production_splash.webp

CMD ["python3", "/worker/worker.py"]
