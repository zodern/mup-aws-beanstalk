#!/bin/bash
NODE_VERSION=<%= nodeVersion %>
NPM_VERSION=<%= npmVersion %>


export NVM_DIR="/.nvm"
# Install nvm
curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.33.6/install.sh | bash
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

nvm install $NODE_VERSION
nvm use $NODE_VERSION
nvm alias default $NODE_VERSION
npm i -g npm@$NPM_VERSION

APP_PATH="$(/opt/elasticbeanstalk/bin/get-config container -k app_staging_dir)"
echo "APP_PATH: $APP_PATH"

# AWS Linux 2
[[ -z "$APP_PATH" ]] && APP_PATH="$(/opt/elasticbeanstalk/bin/get-config platformconfig -k AppStagingDir)"
echo "APP_PATH: $APP_PATH"

cd "$APP_PATH"
ls
cd programs/server && npm install --unsafe-perm
