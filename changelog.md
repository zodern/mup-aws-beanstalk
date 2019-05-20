## Next

- Environment file is only changed when its content changes. This will improve deploy speed when `longEnvVars` is true.
- Fix environment sometimes not ready when trying to migrate to using environment variables stored in s3
- Fix `mup status` command 

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
