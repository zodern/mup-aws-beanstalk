import {
  beanstalk
} from './aws';
import {
  names
} from './utils';
import {
  convertToObject
} from './eb-config';
import {
  waitForEnvReady
} from './env-ready';

export default async function ensureSSLConfigured(config, certificateArn) {
  const {
    app,
    environment
  } = names(config);

  const ebConfig = [{
    Namespace: 'aws:elbv2:listener:443',
    OptionName: 'SSLCertificateArns',
    Value: certificateArn
  }, {
    Namespace: 'aws:elbv2:listener:443',
    OptionName: 'DefaultProcess',
    Value: 'default'
  }, {
    Namespace: 'aws:elbv2:listener:443',
    OptionName: 'ListenerEnabled',
    Value: 'true'
  }, {
    Namespace: 'aws:elbv2:listener:443',
    OptionName: 'Protocol',
    Value: 'HTTPS'
  }];

  const domains = config.app.sslDomains;

  if (!domains || domains.length === 0) {
    await beanstalk.updateEnvironment({
      EnvironmentName: environment,
      // eslint-disable-next-line arrow-body-style
      OptionsToRemove: ebConfig.map(({ Namespace, OptionName }) => {
        return {
          Namespace,
          OptionName
        };
      })
    }).promise();
  } else {
    let needToUpdate = false;

    const {
      ConfigurationSettings
    } = await beanstalk.describeConfigurationSettings({
      EnvironmentName: environment,
      ApplicationName: app
    }).promise();

    const current = ConfigurationSettings[0].OptionSettings.reduce(convertToObject, {});
    const desired = ebConfig.reduce(convertToObject, {});

    Object.keys(desired).forEach((key) => {
      if (needToUpdate || !current[key] || current[key].Value !== desired[key].Value) {
        needToUpdate = true;
      }
    });

    if (needToUpdate) {
      await beanstalk.updateEnvironment({
        EnvironmentName: environment,
        OptionSettings: ebConfig
      }).promise();
      await waitForEnvReady(config, true);
    }
  }
}
