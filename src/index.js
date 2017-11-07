import * as _commands from './commands';
import validator from './validate';

export const name = 'beanstalk';
export const description = 'Deploy Meteor app to AWS Elastic Beanstalk';
export const commands = _commands;

export const validators = {
  app(config, utils) {
    if (config.app && config.app.type === 'aws-beanstalk') {
      return validator(config, utils);
    }

    return [];
  }
};

export function prepareBundle(config) {
  if (!config.app || config.app.type !== 'aws-beanstalk') {
    return config;
  }

  const defaultBuildOptions = {
    serverOnly: true
  };

  config.app.buildOptions = config.app.buildOptions || defaultBuildOptions;

  return config;
}
