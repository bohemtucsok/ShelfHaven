FROM python:3.12-slim

# The upgrade pulls in Debian security fixes that the base image does not
# contain yet, so the trivy gate (--ignore-unfixed) only sees unfixed CVEs.
RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get upgrade -y --no-install-recommends && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends calibre curl && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

COPY convert-server.py /app/convert-server.py

WORKDIR /app
EXPOSE 8080

ENV PYTHONUNBUFFERED=1

CMD ["python", "-u", "convert-server.py"]
