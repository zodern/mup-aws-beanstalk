export function createDesiredConfig(mupConfig, buildLocation, api) {
  const config = {
    OptionSettings: [{
      Namespace: 'aws:elasticbeanstalk:container:nodejs',
      OptionName: 'NodeVersion',
      Value: '8.4.0'
    }, {
      Namespace: 'aws:autoscaling:launchconfiguration',
      OptionName: 'InstanceType',
      Value: 't2.micro'
    }]
  };

  const { env } = mupConfig.app;
  const settingsString = JSON.stringify(api.getSettings());

  env.METEOR_SETTINGS_ENCODED = encodeURIComponent(settingsString);

  Object.keys(env).forEach((envName) => {
    const value = env[envName];

    config.OptionSettings.push({
      Namespace: 'aws:elasticbeanstalk:application:environment',
      OptionName: envName,
      Value: value
    });
  });

  return config;
}

export function diffConfig(current, desired) {

}
