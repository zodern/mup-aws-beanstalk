## 0.8.0 - July 18, 2022

- Support `.platform` files (@s7dhansh)
- If you manually configure the ssl certificate instead of configuring it in the mup config, mup-aws-beanstalk will no longer remove your changes (@filipenovola)
- `mup beanstalk shell` and `mup beanstalk debug` will temporarily add a rule to the security group to allow ssh access from your ip address
- Fix configuring nginx when using Amazon Linux 2
- Fix health checks when using Amazon Linux 2
- Improve documentation (@filipenevola)
- Increase s3 upload timeout (@ramijarrar)
- Improve error when sshKey is not configured
- When requesting logs, wait for env to be ready

## 0.7.0 - October 19, 2021

New features:

- Add support for custom .ebextensions folder (@s7dhansh)
- New environments use platforms based on Amazon Linux 2. The docs have instructions for migrating existing environments to the new platforms
- During deploys, the environment will only be updated a single time. This makes deploys much faster when updating env vars or the settings.json during a deploy, or when longEnvVars is enabled.
- Add `mup beanstalk shell` to get a production Meteor shell. Look in the docs for how to enable
- Add `mup beanstalk debug` to allow connecting your local Node debugging tools to the app. Look in the docs for how to enable.
- Logs if the deploy fails. It also sets the exit code to an error code
- The environment name can be changed

Bug fixes:

- Fix node version used when rebuilding native npm dependencies
- Fix unnecessarily updating environment during deploys when longEnvVars is enabled (@alexkyen)
- Fix few cases where it did not wait until the environment was ready before updating it
- Fix `mup status` when the environment does not exist
- Reduce timeout of automation document used for graceful shutdown

## 0.6.4 - June 14, 2020

- Fix compatibility with Meteor Up 1.5

## 0.6.3 - April 18, 2020

- Fix memory leak in health-check.js (@jimrandomh)
- Fix nginx config for fonts in packages (@cunneen)

## 0.6.2 - November 15, 2018

- Fix `Throttling: Rate exceeded` errors

## 0.6.1 - September 17, 2018

- Fix using longEnvVars in regions other than us-east-1 (@gerwinbrunner and @cunneen)

## 0.6.0 - June 19, 2018

- Add graceful shutdown (sponsored by [Hive](https://hive.com/))
- Add support for large settings.json files and long environment variables
- Set `Strict-Transport-Security` when `app.forceSSL` is enabled (@fschaeffler)
- Use the last git's commit message for the version description
- Add option to configure number of old application versions to keep
