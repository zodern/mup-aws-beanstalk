#!/bin/bash
bucket="<%= bucketName %>"
VERSION="2018-03-28"
env_version=`sudo /opt/elasticbeanstalk/bin/get-config environment --key MUP_ENV_FILE_VERSION`

echo "env_version=$env_version"

[[ -z "$env_version" ]] && { echo "Long Env is not enabled."; exit 0; }

export NVM_DIR="/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

instance_profile=`curl http://169.254.169.254/$VERSION/meta-data/iam/security-credentials/`
json=`curl http://169.254.169.254/$VERSION/meta-data/iam/security-credentials/${instance_profile}`
instance_region=`curl http://169.254.169.254/latest/meta-data/placement/availability-zone | sed 's/.$//'`

function getInstanceProfileProperty () {
  result=`node -e "console.log(JSON.parse(process.argv.slice(2).join(''))[process.argv[1]])" $1 $json`
  echo "$result"
}

aws_access_key_id=`getInstanceProfileProperty "AccessKeyId"`
aws_secret_access_key=`getInstanceProfileProperty "SecretAccessKey"`
token=`getInstanceProfileProperty "Token"`

file="env/$env_version.txt"
resource="${bucket}/${file}"

mkdir -p /etc/app || true
sudo aws s3 cp s3://${resource} /etc/app/env.txt
