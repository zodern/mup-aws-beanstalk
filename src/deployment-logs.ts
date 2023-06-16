import uniq from "lodash/uniq";
import { GetLogEventsCommandInput } from "@aws-sdk/client-cloudwatch-logs";
import { logs } from "./aws";
import { MupApi } from "./types";
import { logStreamEvent, names } from "./utils";
import { EventDescription } from "@aws-sdk/client-elastic-beanstalk";

let instanceFinderInterval: NodeJS.Timeout | undefined;
let activeInstanceListeners: { [instanceName: string]: NodeJS.Timeout } = {};

async function listen (
  logGroupName: string,
  logStreamName: string,
  nextToken?: string
) {
  const params: GetLogEventsCommandInput = {
    logGroupName,
    logStreamName,
  };

  if (nextToken) {
    params.nextToken = nextToken;
  }

  try {
    const { events, nextForwardToken } = await logs.getLogEvents(params);

    events!.forEach(event => {
      logStreamEvent(`<${logStreamName}> ${event.message!}`);
    });

    if (events && events.length > 0 || nextToken) {
      return nextForwardToken;
    }

    return nextToken;
  } catch (err) {
    // @ts-ignore
    if (err && err.name === "ResourceNotFoundException") {
      // Log stream is not yet available, takes a little time

      // console.error("Unable to find log stream", logGroupName, logStreamName);

      // const { logStreams } = await logs.describeLogStreams({
      //   logGroupName,
      // });

      // if (logStreams && logStreams.length > 0) {
      //   console.log("Available log streams", logStreams.map(stream => stream.logStreamName));
      // }

      return nextToken;
    }
    console.error("Error", err);
    return nextToken;
  }
}

// Cheeky function that uses the dynamically updated event log (provided by
// the `showEvents` function) to find the instances that were created during
// the deployment.
function getInstancesFromLogs (eventLog: EventDescription[]) {
  const instances: string[] = [];

  eventLog.forEach(event => {
    const match = event.Message?.match(/EC2 instance\(s\) \[(.*)\]/);

    if (match) {
      const newInstances = match[1].split(', ');
      newInstances.forEach(instance => {
        instances.push(instance.trim());
      });
    }
  });

  return uniq(instances);
}

async function startInstanceLogListener (
  logGroupName: string,
  instanceName: string
) {
  const logStreamName = instanceName;

  try {
    console.log(`Started listening to ${logGroupName}:${instanceName}`);
    let nextToken: string | undefined = await listen(logGroupName, logStreamName);

    return setInterval(async () => {
      nextToken = await listen(logGroupName, logStreamName, nextToken);
    }, 5000);
  } catch (err) {
    // @ts-ignore
    if (err.name === "ResourceNotFoundException") {
      console.error("Unable to find log streams for", logGroupName);
    } else {
      console.error("Log stream error", err);
    }
    return;
  }
}

async function startInstanceListeners (logGroupName: string, instanceNames: string[]) {
  instanceNames.forEach(async (instanceName) => {
    if (activeInstanceListeners[instanceName]) {
      return;
    }

    const instanceListener = await startInstanceLogListener(logGroupName, instanceName);
    if (instanceListener) {
      activeInstanceListeners[instanceName] = instanceListener;
    }
  });
}

export async function startLogStreamListener (
  api: MupApi,
  eventLog: EventDescription[]
) {
  const config = api.getConfig();
  console.log("Start log stream listener");

  const { environment } = names(config);

  const logFileName = 'var/log/web.stdout.log';
  const logGroupName = `/aws/elasticbeanstalk/${environment}/${logFileName}`;

  await startInstanceListeners(logGroupName, getInstancesFromLogs(eventLog));

  instanceFinderInterval = setInterval(async () => {
    await startInstanceListeners(logGroupName, getInstancesFromLogs(eventLog));
  }, 5000);
}

export async function stopLogStreamListener () {
  clearInterval(instanceFinderInterval);

  Object.values(activeInstanceListeners).forEach(listener => {
    clearInterval(listener);
  });
}
