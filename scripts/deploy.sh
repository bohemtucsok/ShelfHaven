#!/bin/bash
set -e

echo "=== ShelfHaven Deploy ==="

# Check .env exists
if [ ! -f .env ]; then
  echo "ERROR: .env not found!"
  echo "Copy .env.example to .env and fill in the values."
  exit 1
fi

echo "Building images..."
docker compose build

echo "Starting services..."
docker compose up -d

echo "Waiting for database..."
sleep 10

echo "Pushing database schema..."
docker compose exec app npx prisma db push --skip-generate

echo ""
echo "=== Deploy complete! ==="
echo "App: http://localhost:3000"
