#!/bin/bash

# When nvm is installed, $HOME isn't set
# resulting in nvm installed /.nvm
export NVM_DIR="/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" >/dev/null 2>&1

# nvm use default --delete-prefix --silent

[[ ! -z "$MUP_ENV_FILE_VERSION" ]] && { echo "Long Env is enabled."; source /home/longenvvars/env.txt; }

echo "Node version"
echo $(node --version)
echo "Npm version"
echo $(npm --version)

export METEOR_SETTINGS=$(node -e 'console.log(decodeURIComponent(process.env.METEOR_SETTINGS_ENCODED))')

echo "=> Starting health check server"
node health-check.js &

echo "=> Starting App"
node main.js
