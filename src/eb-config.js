export function createDesiredConfig(mupConfig, buildLocation) {
  const config = {
    OptionSettings: [{
      Namespace: 'aws:elasticbeanstalk:container:nodejs',
      OptionName: 'NodeVersion',
      Value: '4.8.4'
    }, {
      Namespace: 'aws:autoscaling:launchconfiguration',
      OptionName: 'InstanceType',
      Value: 't2.micro'
    }]
  };

  Object.keys(mupConfig.app.env).forEach((envName) => {
    const value = mupConfig.app.env[envName];

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
