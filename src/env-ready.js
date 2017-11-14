import {
  logStep,
  names
} from './utils';
import configure from './aws';

export async function getLastEvent(config) {
  const {
    beanstalk
  } = configure(config.app);
  const {
    environment
  } = names(config);

  const {
    Events
  } = await beanstalk.describeEvents({
    EnvironmentName: environment,
    MaxRecords: 5
  }).promise();

  return Events[0].EventDate;
}

export async function showEvents(config, lastEventDate) {
  const {
    beanstalk
  } = configure(config.app);
  const {
    environment,
    app
  } = names(config);

  const {
    Events
  } = await beanstalk.describeEvents({
    EnvironmentName: environment,
    ApplicationName: app,
    StartTime: lastEventDate
  }).promise();

  Events.forEach((event) => {
    if (event.EventDate.toString() === lastEventDate.toString()) {
      return;
    }
    console.log(`  Env Event: ${event.Message}`);
  });

  return new Date(Events[0].EventDate);
}

export async function waitForEnvReady(config, showProgress) {
  const {
    beanstalk
  } = configure(config.app);
  const {
    environment,
    app
  } = names(config);

  let lastEventDate = null;
  let lastStatus = null;

  if (showProgress) {
    lastEventDate = await getLastEvent(config);
  }

  return new Promise((resolve, reject) => {
    async function check() {
      let result;
      try {
        result = await beanstalk.describeEnvironments({
          EnvironmentNames: [environment],
          ApplicationName: app
        }).promise();
      } catch (e) {
        console.log(e);
        reject(e);
      }

      const status = result.Environments[0].Status;
      if (status !== 'Ready' && status !== lastStatus) {
        logStep(`=> Waiting for Beanstalk Environment to finish ${status.toLowerCase()}`);
        console.log('  It could take a few minutes');
        lastStatus = status;
      } else if (status === 'Ready') {
        // TODO: run showEvents one last time
        resolve();

        return;
      }

      if (showProgress) {
        try {
          lastEventDate = await showEvents(config, lastEventDate);
        } catch (e) {
          console.log(e);
        }
      }

      setTimeout(check, 2000);
    }

    check();
  });
}
