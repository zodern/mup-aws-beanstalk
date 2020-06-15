import {
  logStep,
  names
} from './utils';
import { beanstalk } from './aws';
import {
  getRecheckInterval,
  checkForThrottlingException,
  handleThrottlingException
} from './recheck';

export async function getLastEvent(config) {
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

async function checker(config, prop, wantedValue, showProgress) {
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
        console.log('in check exception');
        if (checkForThrottlingException(e)) {
          handleThrottlingException();
          return setTimeout(check, getRecheckInterval());
        }

        console.log(e);
        reject(e);
      }
      const value = result.Environments[0][prop];
      if (value !== wantedValue && value !== lastStatus) {
        const text = prop === 'Health' ? `be ${wantedValue}` : `finish ${value}`;

        logStep(`=> Waiting for Beanstalk Environment to ${text.toLocaleLowerCase()}`);
        lastStatus = value;
      } else if (value === wantedValue) {
        // TODO: run showEvents one last time
        resolve();

        return;
      }

      if (showProgress) {
        try {
          lastEventDate = await showEvents(config, lastEventDate);
        } catch (e) {
          if (checkForThrottlingException(e)) {
            handleThrottlingException();
          } else {
            console.log(e);
          }
        }
      }

      setTimeout(check, getRecheckInterval());
    }

    check();
  });
}

export async function waitForEnvReady(config, showProgress) {
  await checker(config, 'Status', 'Ready', showProgress);
}

export async function waitForHealth(config, health = 'Green', showProgress) {
  await checker(config, 'Health', health, showProgress);
}
