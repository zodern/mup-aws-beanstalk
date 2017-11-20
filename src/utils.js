import axios from 'axios';
import chalk from 'chalk';
import fs from 'fs';
import random from 'random-seed';
import os from 'os';
import uuid from 'uuid';
import configure from './aws';

export function logStep(message) {
  console.log(chalk.blue(message));
}

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
    bundlePrefix: `mup/bundles/${config.app.name}/`,
    instanceProfile: 'aws-elasticbeanstalk-ec2-role',
    serviceRole: 'aws-elasticbeanstalk-service-role'
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

  logStep('=> Requesting Logs');

  await beanstalk.requestEnvironmentInfo({
    EnvironmentName: environment,
    InfoType: 'tail'
  }).promise();

  const EnvironmentInfo = await retrieveEnvironmentInfo(api, 0);

  logStep('=> Downloading Logs');

  const logsForServer = EnvironmentInfo.reduce((result, info) => {
    result[info.Ec2InstanceId] = info.Message;

    return result;
  }, {});

  return Promise.all(Object.values(logsForServer).map(url => axios.get(url)));
}

export function getNodeVersion(api, bundlePath) {
  let star = fs.readFileSync(api.resolvePath(bundlePath, 'bundle/star.json')).toString();
  const nodeVersionTxt = fs.readFileSync(api.resolvePath(bundlePath, 'bundle/.node_version.txt')).toString();

  star = JSON.parse(star);

  if (star.npmVersion) {
    return {
      nodeVersion: star.nodeVersion,
      npmVersion: star.npmVersion
    };
  }

  const nodeVersion = nodeVersionTxt.substr(1);

  if (nodeVersion.startsWith('4')) {
    return {
      nodeVersion,
      npmVersion: '4.6.1'
    };
  }

  return {
    nodeVersion,
    npmVersion: '3.10.5'
  };
}

export async function attachPolicies(config, roleName, policies) {
  const {
    iam
  } = configure(config.app);

  const promises = [];

  policies.forEach((policy) => {
    const promise = iam.attachRolePolicy({
      RoleName: roleName,
      PolicyArn: policy
    }).promise();

    promises.push(promise);
  });

  await Promise.all(promises);
}

export async function ensureRoleExists(config, name, assumeRolePolicyDocument) {
  const {
    iam
  } = configure(config.app);

  let exists = true;

  try {
    await iam.getRole({
      RoleName: name
    }).promise();
  } catch (e) {
    exists = false;
  }

  if (!exists) {
    await iam.createRole({
      RoleName: name,
      AssumeRolePolicyDocument: assumeRolePolicyDocument
    }).promise();
  }
}

export async function ensureInstanceProfileExists(config, name) {
  const {
    iam
  } = configure(config.app);

  let exists = true;

  try {
    await iam.getInstanceProfile({
      InstanceProfileName: name
    }).promise();
  } catch (e) {
    exists = false;
  }

  if (!exists) {
    await iam.createInstanceProfile({
      InstanceProfileName: name
    }).promise();
  }
}

export async function ensureRoleAdded(config, instanceProfile, role) {
  const {
    iam
  } = configure(config.app);

  let added = true;


  const { InstanceProfile } = await iam.getInstanceProfile({
    InstanceProfileName: instanceProfile
  }).promise();

  if (InstanceProfile.Roles.length === 0 || InstanceProfile.Roles[0].RoleName !== role) {
    added = false;
  }

  if (!added) {
    await iam.addRoleToInstanceProfile({
      InstanceProfileName: instanceProfile,
      RoleName: role
    }).promise();
  }
}

export async function ensurePoliciesAttached(config, role, policies) {
  const {
    iam
  } = configure(config.app);

  let { AttachedPolicies } = await iam.listAttachedRolePolicies({
    RoleName: role
  }).promise();

  AttachedPolicies = AttachedPolicies.map(policy => policy.PolicyArn);

  const unattachedPolicies = policies.reduce((result, policy) => {
    if (AttachedPolicies.indexOf(policy) === -1) {
      result.push(policy);
    }

    return result;
  }, []);

  if (unattachedPolicies.length > 0) {
    await attachPolicies(config, role, unattachedPolicies);
  }
}
