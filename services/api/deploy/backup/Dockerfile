# Respaldo semanal de MongoDB Atlas M0 a Cloud Storage como Cloud Run Job
# (ADR-025, punto 5, con el cambio de ADR-030). M0 no hace respaldos propios.
#
# ubuntu:24.04 fijada por digest (índice multiplataforma, publicada el
# 2026-11-10) y mongodb-database-tools por versión y sha256 (publicadas el
# 2026-11-02): ADR-013. Sin gcloud: backup.sh sube el archivo con la API JSON
# de GCS y el token de la cuenta del job, del metadata server de Cloud Run.
FROM ubuntu:24.04@sha256:9c7f200c07e3d4a03e7249d2c16bf66a51120fb876aa2242cf31451412543289

ARG TOOLS_VERSION=100.20.1
ARG TOOLS_SHA256=96a9c32b5ea4492a2533151f420e41d5b762559951a1ec916eb3a72886734021

RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends ca-certificates curl; \
    deb="mongodb-database-tools-ubuntu2404-x86_64-${TOOLS_VERSION}.deb"; \
    curl --fail --silent --show-error --location -o "/tmp/$deb" "https://fastdl.mongodb.org/tools/db/$deb"; \
    echo "${TOOLS_SHA256}  /tmp/$deb" | sha256sum --check --strict; \
    apt-get install -y --no-install-recommends "/tmp/$deb"; \
    rm -f "/tmp/$deb"; \
    rm -rf /var/lib/apt/lists/*; \
    mongodump --version

COPY --chmod=0555 backup.sh /usr/local/bin/backup

# Sin root: el job solo necesita su directorio temporal.
USER 65532:65532
ENV HOME=/tmp

ENTRYPOINT ["/usr/local/bin/backup"]
