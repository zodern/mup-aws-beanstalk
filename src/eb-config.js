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
    instanceProfile,
    serviceRole
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
      Namespace: 'aws:autoscaling:trigger',
      OptionName: 'MeasureName',
      Value: 'CPUUtilization'
    }, {
      Namespace: 'aws:autoscaling:trigger',
      OptionName: 'Statistic',
      Value: 'Average'
    }, {
      Namespace: 'aws:autoscaling:trigger',
      OptionName: 'Unit',
      Value: 'Percent'
    }, {
      Namespace: 'aws:autoscaling:trigger',
      OptionName: 'UpperThreshold',
      Value: '75'
    }, {
      Namespace: 'aws:autoscaling:trigger',
      OptionName: 'LowerThreshold',
      Value: '35'
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
    }, {
      Namespace: 'aws:elasticbeanstalk:environment:process:default',
      OptionName: 'HealthyThresholdCount',
      Value: '2'
    }, {
      Namespace: 'aws:elasticbeanstalk:environment:process:default',
      OptionName: 'HealthCheckPath',
      Value: '/aws-health-check-3984729847289743128904723'
    }, {
      Namespace: 'aws:elasticbeanstalk:environment',
      OptionName: 'EnvironmentType',
      Value: 'LoadBalanced'
    }, {
      Namespace: 'aws:elasticbeanstalk:environment',
      OptionName: 'LoadBalancerType',
      Value: 'application'
    }, {
      Namespace: 'aws:elasticbeanstalk:command',
      OptionName: 'DeploymentPolicy',
      Value: 'RollingWithAdditionalBatch'
    }, {
      Namespace: 'aws:elasticbeanstalk:environment',
      OptionName: 'ServiceRole',
      Value: serviceRole
    }, {
      Namespace: 'aws:elasticbeanstalk:healthreporting:system:',
      OptionName: 'SystemType',
      Value: 'enhanced'
    }]
  };

  const settingsString = JSON.stringify(api.getSettings());

  env.METEOR_SETTINGS_ENCODED = encodeURIComponent(settingsString);
  env.PORT = 8081;

  Object.keys(env).forEach((envName) => {
    const value = env[envName];

    config.OptionSettings.push({
      Namespace: 'aws:elasticbeanstalk:application:environment',
      OptionName: envName,
      Value: value.toString()
    });
  });

  return config;
}

export function diffConfig(current, desired) {

}
