import { difference } from 'lodash';
import { names } from './utils';

export function createDesiredConfig(mupConfig, settings, longEnvVarsVersion) {
  const {
    env,
    instanceType,
    customBeanstalkConfig = []
  } = mupConfig.app;
  const {
    instanceProfile,
    serviceRole
  } = names(mupConfig);

  const config = {
    OptionSettings: [{
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
      Namespace: 'aws:autoscaling:launchconfiguration',
      OptionName: 'InstanceType',
      Value: instanceType
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
      Namespace: 'aws:elasticbeanstalk:command',
      OptionName: 'BatchSizeType',
      Value: 'Percentage'
    }, {
      Namespace: 'aws:elasticbeanstalk:command',
      OptionName: 'BatchSize',
      Value: '30'
    }, {
      Namespace: 'aws:autoscaling:updatepolicy:rollingupdate',
      OptionName: 'RollingUpdateEnabled',
      Value: 'true'
    }, {
      Namespace: 'aws:autoscaling:updatepolicy:rollingupdate',
      OptionName: 'RollingUpdateType',
      Value: 'Health'
    }, {
      Namespace: 'aws:elasticbeanstalk:environment',
      OptionName: 'ServiceRole',
      Value: serviceRole
    }, {
      Namespace: 'aws:elasticbeanstalk:healthreporting:system',
      OptionName: 'SystemType',
      Value: 'enhanced'
    }, {
      Namespace: 'aws:elasticbeanstalk:environment:process:default',
      OptionName: 'StickinessEnabled',
      Value: 'true'
    }, {
      Namespace: 'aws:elasticbeanstalk:environment:process:default',
      OptionName: 'DeregistrationDelay',
      Value: '75'
    }]
  };

  const settingsString = JSON.stringify(settings);

  if (longEnvVarsVersion) {
    config.OptionSettings.push({
      Namespace: 'aws:elasticbeanstalk:application:environment',
      OptionName: 'MUP_ENV_FILE_VERSION',
      Value: longEnvVarsVersion.toString()
    });
  } else {
    env.METEOR_SETTINGS_ENCODED = encodeURIComponent(settingsString);

    Object.keys(env).forEach((envName) => {
      const value = env[envName];

      config.OptionSettings.push({
        Namespace: 'aws:elasticbeanstalk:application:environment',
        OptionName: envName,
        Value: value.toString()
      });
    });
  }

  const customOptions = customBeanstalkConfig.map(option => ({
    Namespace: option.namespace,
    OptionName: option.option,
    Value: option.value
  }));

  config.OptionSettings = mergeConfigs(config.OptionSettings, customOptions);

  return config;
}

export function scalingConfigChanged(currentConfig, mupConfig) {
  const {
    minInstances,
    maxInstances
  } = mupConfig.app;

  let currentMinInstances = 0;
  let currentMaxInstances = 0;

  currentConfig.forEach((item) => {
    if (item.Namespace === 'aws:autoscaling:asg') {
      if (item.OptionName === 'MinSize') {
        currentMinInstances = item.Value;
      } else if (item.OptionName === 'MaxSize') {
        currentMaxInstances = item.Value;
      }
    }
  });

  return currentMinInstances !== minInstances.toString() ||
    currentMaxInstances !== maxInstances.toString();
}

export function scalingConfig({ minInstances, maxInstances }) {
  return {
    OptionSettings: [
      {
        Namespace: 'aws:autoscaling:asg',
        OptionName: 'MinSize',
        Value: minInstances.toString()
      }, {
        Namespace: 'aws:autoscaling:asg',
        OptionName: 'MaxSize',
        Value: maxInstances.toString()
      }
    ]
  };
}

export function convertToObject(result, option) {
  result[`${option.Namespace}-${option.OptionName}`] = option;

  return result;
}

export function mergeConfigs(config1, config2) {
  config1 = config1.reduce(convertToObject, {});

  config2.forEach((option) => {
    const key = [`${option.Namespace}-${option.OptionName}`];
    config1[key] = option;
  });

  return Object.values(config1);
}

export function diffConfig(current, desired) {
  current = current.reduce(convertToObject, {});

  desired = desired.reduce(convertToObject, {});

  const toRemove = difference(Object.keys(current), Object.keys(desired))
    .filter(key => key.indexOf('aws:elasticbeanstalk:application:environment-') === 0)
    .map((key) => {
      const option = current[key];
      return {
        Namespace: option.Namespace,
        OptionName: option.OptionName
      };
    });

  const toUpdate = Object.keys(desired).filter((key) => {
    if (key in current && current[key].Value === desired[key].Value) {
      return false;
    }

    return true;
  }).map(key => desired[key]);

  return {
    toRemove,
    toUpdate
  };
}
