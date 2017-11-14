import * as commandHandlers from './command-handlers';

export const setup = {
  description: 'Prepare AWS to deploy app',
  handler: commandHandlers.setup
};

export const deploy = {
  description: 'Deploy app to AWS Elastic Beanstalk',
  builder(subYargs) {
    return subYargs.option('cached-build', {
      description: 'Use build from previous deploy',
      boolean: true
    });
  },
  handler: commandHandlers.deploy
};

export const logs = {
  description: 'View app\'s logs',
  builder(yargs) {
    return yargs
      .strict(false)
      .option('tail', {
        description: 'Number of lines to show from the end of the logs',
        alias: 't',
        number: true
      })
      .option('follow', {
        description: 'Follow log output',
        alias: 'f',
        boolean: true
      });
  },
  handler: commandHandlers.logs
};

export const logsEb = {
  name: 'logs-eb',
  description: 'Logs from setting up server and installing npm dependencies',
  handler: commandHandlers.logsEb
};


export const start = {
  description: 'Start app',
  handler: commandHandlers.start
};

export const stop = {
  description: 'Stop app',
  handler: commandHandlers.stop
};

export const restart = {
  description: 'Restart app',
  handler: commandHandlers.restart
};

export const events = {
  description: 'Environment Events',
  handler: commandHandlers.events
};

export const clean = {
  description: 'Remove old bundles and app versions',
  handler: commandHandlers.clean
};

// Hidden commands

export const reconfig = {
  description: false,
  handler: commandHandlers.reconfig
};
