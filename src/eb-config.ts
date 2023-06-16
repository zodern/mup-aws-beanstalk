import { difference } from 'lodash';
import { beanstalk } from './aws';
import downloadEnvFile from './download';
import { createEnvFile } from './env-settings';
import { uploadEnvFile } from './upload';
import { names } from './utils';
import { largestEnvVersion } from './versions';
import { EBConfigDictionary, EBConfigElement, MeteorSettings, MupApi, MupAwsConfig, MupConfig } from "./types";
import { ConfigurationOptionSetting, EnvironmentTier } from "@aws-sdk/client-elastic-beanstalk";

export function createDesiredConfig(
  mupConfig: MupConfig,
  settings: MeteorSettings,
  longEnvVarsVersion: number | false
) {
  const {
    env,
    instanceType,
    streamLogs,
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

  if (streamLogs) {
    config.OptionSettings.push({
      Namespace: 'aws:elasticbeanstalk:cloudwatch:logs',
      OptionName: 'StreamLogs',
      Value: 'true'
    });
  }

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

export function scalingConfigChanged (
  currentConfig: (EBConfigElement | ConfigurationOptionSetting | undefined)[],
  mupConfig: MupConfig
) {
  const {
    minInstances,
    maxInstances
  } = mupConfig.app;

  let currentMinInstances = "0";
  let currentMaxInstances = "0";

  currentConfig.forEach((item) => {
    if (item!.Namespace === 'aws:autoscaling:asg') {
      if (item!.OptionName === 'MinSize') {
        currentMinInstances = item!.Value!;
      } else if (item!.OptionName === 'MaxSize') {
        currentMaxInstances = item!.Value!;
      }
    }
  });

  return currentMinInstances !== minInstances.toString() ||
    currentMaxInstances !== maxInstances.toString();
}

export function scalingConfig({ minInstances, maxInstances }: MupAwsConfig) {
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

export function convertToObject (
  result: EBConfigDictionary,
  option: EBConfigElement | ConfigurationOptionSetting | undefined
) {
  if (!option) {
    return result;
  }

  result[`${option.Namespace!}-${option.OptionName!}`] = option as EBConfigElement;

  return result;
}

export function mergeConfigs (config1: EBConfigElement[], config2: EBConfigElement[]) {
  const configDict = config1.reduce(convertToObject, {} as EBConfigDictionary);

  config2.forEach((option) => {
    const key = `${option.Namespace}-${option.OptionName}`;
    configDict[key] = option;
  });

  return Object.values(configDict);
}

export function diffConfig (current: EBConfigElement[], desired: EBConfigElement[]) {
  const currentConfigDict = current.reduce(convertToObject, {} as EBConfigDictionary);
  const desiredConfigDict = desired.reduce(convertToObject, {} as EBConfigDictionary);

  const toRemove = difference(Object.keys(currentConfigDict), Object.keys(desiredConfigDict))
    .filter(key => key.indexOf('aws:elasticbeanstalk:application:environment-') === 0)
    .map((key) => {
      const option = currentConfigDict[key];
      return {
        Namespace: option.Namespace,
        OptionName: option.OptionName
      };
    });

  const toUpdate = Object.keys(desiredConfigDict).filter((key) => {
    if (key in currentConfigDict && currentConfigDict[key].Value === desiredConfigDict[key].Value) {
      return false;
    }

    return true;
  }).map(key => desiredConfigDict[key]);

  return {
    toRemove,
    toUpdate
  };
}

export async function prepareUpdateEnvironment(api: MupApi) {
  const config = api.getConfig();
  const {
    app,
    environment,
    bucket
  } = names(config);
  const {
    ConfigurationSettings
  } = await beanstalk.describeConfigurationSettings({
    EnvironmentName: environment,
    ApplicationName: app
  });
  const { longEnvVars } = config.app;
  let nextEnvVersion = 0;
  let envSettingsChanged;
  let desiredSettings;

  if (longEnvVars) {
    const currentEnvVersion = await largestEnvVersion(api);
    const currentSettings = await downloadEnvFile(bucket, currentEnvVersion);

    desiredSettings = createEnvFile(config.app.env, api.getSettings());
    envSettingsChanged = currentSettings !== desiredSettings;

    if (envSettingsChanged) {
      nextEnvVersion = currentEnvVersion + 1;
      await uploadEnvFile(bucket, nextEnvVersion, desiredSettings);
    } else {
      nextEnvVersion = currentEnvVersion;
    }
  }
  const desiredEbConfig = createDesiredConfig(
    api.getConfig(),
    api.getSettings(),
    nextEnvVersion
  );
  const {
    toRemove,
    toUpdate
  } = diffConfig(
    ConfigurationSettings![0].OptionSettings! as EBConfigElement[],
    desiredEbConfig.OptionSettings
  );

  return {
    toRemove,
    toUpdate
  };
}

export function getEnvTierConfig (envType: 'webapp' | 'worker'): EnvironmentTier {
  if (envType === 'webapp') {
    return {
      Name: "WebServer",
      Type: "Standard"
    };
  }

  return {
    Name: "Worker",
    Type: "SQS/HTTP"
  };
}
