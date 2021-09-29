#!/bin/bash

echo "Setting up"
mkdir /mup_graceful_shutdown || true
ID=$(curl http://169.254.169.254/latest/meta-data/instance-id)
FILE=/mup_graceful_shutdown/$ID
echo "File $FILE"
test -e $FILE && exit
echo "File does not exist"
echo 'PATH="/usr/local/bin:/bin:/usr/bin:/usr/local/sbin:/usr/sbin:/sbin:/opt/aws/bin:/home/ec2-user/.local/bin:/home/ec2-user/bin"' >> $FILE

# Platforms based on Amazon Linux 2 use a different user name
echo 'sudo pkill -SIGTERM -u nodejs -n node || sudo pkill -SIGTERM -u webapp -n node' >> $FILE
chmod +x $FILE 
