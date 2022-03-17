#!/bin/bash

export NVM_DIR="/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

nvm use default --delete-prefix --silent

[[ ! -z "$MUP_ENV_FILE_VERSION" ]] && { echo "Long Env is enabled."; source /etc/app/env.txt; }

echo "Node version"
echo $(node --version)
echo "Npm version"
echo $(npm --version)

export METEOR_SETTINGS=$(node -e 'console.log(decodeURIComponent(process.env.METEOR_SETTINGS_ENCODED))')

echo "=> Starting health check server"
node health-check.js &

echo "=> Starting App"
node main.js
