import axios from 'axios';
import chalk from 'chalk';
import fs from 'fs';
import random from 'random-seed';
import os from 'os';
import uuid from 'uuid';
import {
  iam,
  beanstalk,
  ec2
} from './aws';

import {
  getRecheckInterval
} from './recheck';

export function logStep(message) {
  console.log(chalk.blue(message));
}

export function getHttpHeaders(config) {
  const httpHeaders = {
    strictTransportSecurity: 'max-age=63072000; includeSubDomains; preload',
    xFrameOptions: 'DENY',
    xContentTypeOptions: 'nosniff',
    xXssProtection: '1; mode=block',
    xRobotsTag: 'none',
    contentSecurityPolicy: 'default-src \'self\' \'unsafe-inline\' https: wss:;'
  };

  if (config.httpHeaders) {
    Object.keys(config.httpHeaders).forEach((httpHeaderKey) => {
      httpHeaders[httpHeaderKey] = config.httpHeaders[httpHeaderKey];
    });
  }

  return httpHeaders;
}

export async function getDefaultVpcDns() {
  const filters = {
    Filters: [
      { Name: 'isDefault', Values: ['true'] },
      { Name: 'state', Values: ['available'] }
    ]
  };

  const vpcs = await ec2.describeVpcs(filters).promise();

  if (vpcs && vpcs.Vpcs && vpcs.Vpcs[0]) {
    // AWS default DNS-server is always the second usable IP-address of the VPC
    return (`${vpcs.Vpcs[0].CidrBlock.match(/^\d{0,3}\.\d{0,3}.\d{0,3}\./)}2`);
  }
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
  const name = config.app.name.toLowerCase();

  return {
    bucket: `mup-${name}`,
    environment: `mup-env-${name}`,
    app: `mup-${name}`,
    bundlePrefix: `mup/bundles/${name}/`,
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
    }, getRecheckInterval());
  });
}

export async function getLogs(api) {
  const config = api.getConfig();
  const {
    environment
  } = names(config);

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

  return Promise.all(Object.keys(logsForServer).map(key =>
    new Promise((resolve, reject) => {
      axios.get(logsForServer[key]).then(({ data }) => {
        resolve({
          data,
          instance: key
        });
      }).catch(reject);
    })));
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
  let added = true;


  const {
    InstanceProfile
  } = await iam.getInstanceProfile({
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
  let {
    AttachedPolicies
  } = await iam.listAttachedRolePolicies({
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

export function coloredStatusText(envColor, text) {
  if (envColor === 'Green') {
    return chalk.green(text);
  } else if (envColor === 'Yellow') {
    return chalk.yellow(text);
  } else if (envColor === 'Red') {
    return chalk.red(text);
  }
  return text;
}
