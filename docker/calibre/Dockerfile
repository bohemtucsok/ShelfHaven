FROM python:3.12-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends calibre curl && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

COPY convert-server.py /app/convert-server.py

WORKDIR /app
EXPOSE 8080

ENV PYTHONUNBUFFERED=1

CMD ["python", "-u", "convert-server.py"]
