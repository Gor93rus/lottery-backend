#!/bin/bash
set -e
echo "📂 Current directory: $(pwd)"
echo "📋 Listing files:"
ls -la
echo "📦 Checking dist folder:"
ls -la dist/
echo "🚀 Starting server..."
cd "$(dirname "$0")"
node dist/server.js