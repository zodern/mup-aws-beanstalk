import {
  names
} from './utils';

export function createDesiredConfig(mupConfig, buildLocation, api) {
  const {
    env,
    minInstances,
    maxInstances
  } = mupConfig.app;
  const {
    instanceProfile
  } = names(mupConfig);

  const config = {
    OptionSettings: [{
      Namespace: 'aws:autoscaling:asg',
      OptionName: 'MinSize',
      Value: minInstances.toString()
    }, {
      Namespace: 'aws:autoscaling:asg',
      OptionName: 'MaxSize',
      Value: maxInstances.toString()
    }, {
      Namespace: 'aws:elasticbeanstalk:container:nodejs',
      OptionName: 'NodeVersion',
      Value: '8.4.0'
    }, {
      Namespace: 'aws:autoscaling:launchconfiguration',
      OptionName: 'InstanceType',
      Value: 't2.micro'
    }, {
      Namespace: 'aws:autoscaling:launchconfiguration',
      OptionName: 'IamInstanceProfile',
      Value: instanceProfile
    }]
  };

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
