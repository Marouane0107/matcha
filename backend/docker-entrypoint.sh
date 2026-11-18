#!/bin/sh
set -e

echo "Waiting for database and seeding on first run..."
node docker/init-db.js

echo "Starting backend server..."
exec node src/server.js
