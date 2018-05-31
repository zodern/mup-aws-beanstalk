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
  config.app.maxInstances = config.app.maxInstances || config.app.minInstances;

  config.app.instanceType = config.app.instanceType || 't2.micro';

  config.app.env = config.app.env || {};
  config.app.env.PORT = 8081;
  config.app.env.METEOR_SIGTERM_GRACE_PERIOD_SECONDS = 30;

  return config;
}

function isBeanstalkApp(api) {
  const config = api.getConfig();

  if (config.app && config.app.type === 'aws-beanstalk') {
    return true;
  }

  return false;
}

export const hooks = {
  'post.setup': (api) => {
    if (isBeanstalkApp(api)) {
      return api.runCommand('beanstalk.setup');
    }
  },
  'post.deploy': (api) => {
    if (isBeanstalkApp(api)) {
      return api.runCommand('beanstalk.deploy');
    }
  },
  'post.logs': (api) => {
    if (isBeanstalkApp(api)) {
      return api.runCommand('beanstalk.logs');
    }
  },
  'post.start': (api) => {
    if (isBeanstalkApp(api)) {
      return api.runCommand('beanstalk.start');
    }
  },
  'post.stop': (api) => {
    if (isBeanstalkApp(api)) {
      return api.runCommand('beanstalk.stop');
    }
  },
  'post.restart': (api) => {
    if (isBeanstalkApp(api)) {
      return api.runCommand('beanstalk.restart');
    }
  },
  'post.reconfig': (api) => {
    if (isBeanstalkApp(api)) {
      return api.runCommand('beanstalk.reconfig');
    }
  },
  'post.status': (api) => {
    if (isBeanstalkApp(api)) {
      return api.runCommand('beanstalk.status');
    }
  }
};
