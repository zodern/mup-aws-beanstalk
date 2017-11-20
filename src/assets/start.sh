#!/bin/bash

export METEOR_SETTINGS=$(node -e 'console.log(decodeURIComponent(process.env.METEOR_SETTINGS_ENCODED))')

# Use nvm
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

echo "Node version"
echo $(node --version)
echo "Npm version"
echo $(npm --version)

echo "=> Starting health check server"
node health-check.js &

echo "=> Starting App"
node main.js
