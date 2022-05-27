import { beanstalk } from './aws';
import { names } from './utils';
import { convertToObject } from './eb-config';
import { waitForEnvReady } from './env-ready';

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

  // we use domains to decide if we need to do something about SSL
  if (!domains || domains.length === 0) {
    return;
  }

  const { ConfigurationSettings } = await beanstalk
    .describeConfigurationSettings({
      EnvironmentName: environment,
      ApplicationName: app,
    })
    .promise();

  const current = ConfigurationSettings[0].OptionSettings.reduce(
    convertToObject,
    {}
  );
  const desired = ebConfig.reduce(convertToObject, {});

  const needToUpdate = Object.keys(desired).find(
    (key) => !current[key] || current[key].Value !== desired[key].Value
  );

  if (!needToUpdate) {
    return;
  }

  await beanstalk
    .updateEnvironment({
      EnvironmentName: environment,
      OptionSettings: ebConfig,
    })
    .promise();
  await waitForEnvReady(config, true);
}
