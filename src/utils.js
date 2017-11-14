import axios from 'axios';
import fs from 'fs';
import random from 'random-seed';
import os from 'os';
import uuid from 'uuid';
import configure from './aws';

export function shouldRebuild(bundlePath, useCachedBuild) {
  if (fs.existsSync(bundlePath) && useCachedBuild) {
    return false;
  }

  return true;
}

export function tmpBuildPath(appPath, api) {
  const rand = random.create(appPath);
  const uuidNumbers = [];

  for (let i = 0; i < 16; i++) {
    uuidNumbers.push(rand(255));
  }

  return api.resolvePath(
    os.tmpdir(),
    `mup-meteor-${uuid.v4({ random: uuidNumbers })}`
  );
}

export function names(config) {
  return {
    bucket: `mup-${config.app.name}`,
    environment: `mup-env-${config.app.name}`,
    app: `mup-${config.app.name}`,
    bundlePrefix: `mup/bundles/${config.app.name}/`
  };
}

async function retrieveEnvironmentInfo(api, count) {
  const config = api.getConfig();
  const {
    environment
  } = names(config);
  const {
    beanstalk
  } = configure(config.app);

  const {
    EnvironmentInfo
  } = await beanstalk.retrieveEnvironmentInfo({
    EnvironmentName: environment,
    InfoType: 'tail'
  }).promise();

  if (EnvironmentInfo.length > 0) {
    return EnvironmentInfo;
  } else if (count > 5) {
    throw new Error('No logs');
  }

  return new Promise((resolve, reject) => {
    setTimeout(() => {
      // The logs aren't always available, so retry until they are
      // Another option is to look for the event that says it is ready
      retrieveEnvironmentInfo(api, count + 1)
        .then(resolve)
        .catch(reject);
    }, 2000);
  });
}

export async function getLogs(api) {
  const config = api.getConfig();
  const {
    environment
  } = names(config);
  const {
    beanstalk
  } = configure(config.app);

  console.log('=> Requesting Logs');

  await beanstalk.requestEnvironmentInfo({
    EnvironmentName: environment,
    InfoType: 'tail'
  }).promise();

  const EnvironmentInfo = await retrieveEnvironmentInfo(api, 0);

  console.log('=> Downloading Logs');

  const logsForServer = EnvironmentInfo.reduce((result, info) => {
    result[info.Ec2InstanceId] = info.Message;

    return result;
  }, {});

  return Promise.all(Object.values(logsForServer).map(url => axios.get(url)));
}
