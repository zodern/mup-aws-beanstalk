import * as _commands from './commands';
import validator from './validate';

export const name = 'beanstalk';
export const description = 'Deploy Meteor app to AWS Elastic Beanstalk';
export const commands = _commands;

export const validate = {
  app(config, utils) {
    if (config.app && config.app.type === 'aws-beanstalk') {
      return validator(config, utils);
    }

    return [];
  }
};

export function prepareConfig(config) {
  if (!config.app || config.app.type !== 'aws-beanstalk') {
    return config;
  }

  const defaultBuildOptions = {
    serverOnly: true
  };

  config.app.buildOptions = config.app.buildOptions || defaultBuildOptions;

  // This will change 0 to 1. The validator will warn when the number is 0
  // To have 0 instances, `mup stop` should be used
  config.app.minInstances = config.app.minInstances || 1;
  config.app.maxInstances = config.app.maxInstances || 1;

  return config;
}
