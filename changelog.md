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
