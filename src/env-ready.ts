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
import { MupConfig } from "./types";
import { EnvironmentDescription, EventDescription } from "@aws-sdk/client-elastic-beanstalk";

export async function getLastEvent(config: MupConfig) {
  const {
    environment
  } = names(config);

  const {
    Events
  } = await beanstalk.describeEvents({
    EnvironmentName: environment,
    MaxRecords: 5
  });

  if (!Events || Events.length === 0) {
    return;
  }

  return Events[0].EventDate;
}

export async function showEvents (
  config: MupConfig,
  eventHistory: EventDescription[],
  lastEventDate?: Date
) {
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
  });

  if (!Events || Events.length === 0) {
    return lastEventDate;
  }

  Events.forEach((event) => {
    if (event.EventDate?.toString() === lastEventDate?.toString()) {
      return;
    }
    console.log(`  Env Event: ${event.Message}`);
    eventHistory.push(event);
  });

  return Events[0].EventDate ? new Date(Events[0].EventDate): undefined;
}

async function checker (
  config: MupConfig,
  prop: keyof EnvironmentDescription,
  wantedValue: any,
  showProgress: boolean,
  eventHistory: EventDescription[]
) {
  const {
    environment,
    app
  } = names(config);

  let lastEventDate: Date | undefined;
  let lastStatus: EnvironmentDescription[typeof prop] | undefined;

  if (showProgress) {
    lastEventDate = await getLastEvent(config);
  }

  return new Promise<void>((resolve, reject) => {
    async function check(): Promise<void | ReturnType<typeof setTimeout>> {
      let result;
      try {
        result = await beanstalk.describeEnvironments({
          EnvironmentNames: [environment],
          ApplicationName: app
        });
      } catch (e) {
        if (checkForThrottlingException(e)) {
          handleThrottlingException();
          return setTimeout(check, getRecheckInterval());
        }

        console.log(e);
        reject(e);
      }

      const Environment = result!.Environments?.[0];
      const value = Environment?.[prop];

      if (value !== wantedValue && value !== lastStatus) {
        const text = prop === 'Health' ? `be ${wantedValue}` : `finish ${value}`;

        logStep(`=> Waiting for Beanstalk environment to ${text.toLocaleLowerCase()}`);
        lastStatus = value;
      } else if (value === wantedValue) {
        // TODO: run showEvents one last time
        resolve();

        return;
      }

      if (showProgress) {
        try {
          lastEventDate = await showEvents(config, eventHistory, lastEventDate);
        } catch (e) {
          if (checkForThrottlingException(e)) {
            handleThrottlingException();
          } else {
            console.log(e);
          }
        }
      }

      return setTimeout(check, getRecheckInterval());
    }

    check();
  });
}

export async function waitForEnvReady (
  config: MupConfig,
  showProgress: boolean,
  eventHistory: EventDescription[] = [],
) {
  await checker(config, 'Status', 'Ready', showProgress, eventHistory);
}

export async function waitForHealth (
  config: MupConfig,
  health = 'Green',
  showProgress: boolean
) {
  await checker(config, 'Health', health, showProgress, []);
}
