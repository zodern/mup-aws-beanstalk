import * as commandHandlers from './command-handlers';
import configure from './aws';
import { MupApi } from "./types";

let prepared = false;

function prepare(commandHandler: Function) {
  return function handler (api: MupApi) {
    if (!prepared) {
      configure(api.getConfig().app);
      prepared = true;
    }

    return commandHandler(api);
  };
}

export const setup = {
  description: 'Prepare AWS to deploy app',
  handler: prepare(commandHandlers.setup)
};

export const deploy = {
  description: 'Deploy app to AWS Elastic Beanstalk',
  builder(subYargs: any) {
    return subYargs.option('cached-build', {
      description: 'Use build from previous deploy',
      boolean: true
    });
  },
  handler: commandHandlers.deploy
};

export const logs = {
  description: 'View app\'s logs',
  builder(yargs: any) {
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
  handler: prepare(commandHandlers.logs)
};

export const logsNginx = {
  name: 'logs-nginx',
  description: 'View Nginx logs',
  handler: prepare(commandHandlers.logsNginx)
};

export const logsEb = {
  name: 'logs-eb',
  description: 'Logs from setting up server and installing npm dependencies',
  handler: prepare(commandHandlers.logsEb)
};


export const start = {
  description: 'Start app',
  handler: prepare(commandHandlers.start)
};

export const stop = {
  description: 'Stop app',
  handler: prepare(commandHandlers.stop)
};

export const restart = {
  description: 'Restart app',
  handler: prepare(commandHandlers.restart)
};

export const events = {
  description: 'Environment Events',
  handler: prepare(commandHandlers.events)
};

export const clean = {
  description: 'Remove old bundles and app versions',
  handler: prepare(commandHandlers.clean)
};

export const ssl = {
  description: 'Setup and view status of ssl certificate',
  handler: prepare(commandHandlers.ssl)
};

export const reconfig = {
  description: 'Update env variables, instance count, and Meteor settings.json',
  handler: prepare(commandHandlers.reconfig)
};

export const status = {
  description: 'View status of app',
  handler: prepare(commandHandlers.status)
};

export const shell = {
  name: 'shell [instance-id]',
  description: 'Open production Meteor shell',
  builder(yargs: any) {
    yargs.positional('instance-id', {
      description: 'Instance id. If not provided, will show a list of instances'
    }).strict(false);
  },
  handler: prepare(commandHandlers.shell)
};

export const debug = {
  name: 'debug [instance-id]',
  description: 'Connect your local Node developer tools',
  builder(yargs: any) {
    yargs.positional('instance-id', {
      description: 'Instance id. If not provided, will show a list of instances'
    }).strict(false);
  },
  handler: prepare(commandHandlers.debug)
};
