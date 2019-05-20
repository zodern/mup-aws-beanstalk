import axios from 'axios';
import chalk from 'chalk';
import fs from 'fs';
import { isEqual } from 'lodash';
import os from 'os';
import random from 'random-seed';
import uuid from 'uuid';
import { execSync } from 'child_process';
import { beanstalk, cloudWatchEvents, iam, s3, sts, ssm } from './aws';
import { getRecheckInterval } from './recheck';

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
  const name = config.app.name.toLowerCase();

  return {
    bucket: `mup-${name}`,
    environment: `mup-env-${name}`,
    app: `mup-${name}`,
    bundlePrefix: `mup/bundles/${name}/`,
    instanceProfile: 'aws-elasticbeanstalk-ec2-role',
    serviceRole: 'aws-elasticbeanstalk-service-role',
    trailBucketPrefix: 'mup-graceful-shutdown-trail',
    trailName: 'mup-graceful-shutdown-trail',
    deregisterRuleName: 'mup-target-deregister',
    eventTargetRole: `mup-envoke-run-command-${name}`,
    eventTargetPolicyName: 'Invoke_Run_Command',
    eventTargetPassRoleName: 'Pass_Role',
    automationDocument: 'mup-graceful-shutdown'
  };
}

export function createUniqueName(prefix = '') {
  const randomNumbers = Math.floor(Math.random() * 10000);

  return `${prefix}-${Date.now()}-${randomNumbers}`;
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

export function getAccountId() {
  return sts.getCallerIdentity()
    .promise()
    .then(({ Account }) => Account);
}

export async function ensureRoleExists(name, assumeRolePolicyDocument, ensureAssumeRolePolicy) {
  let exists = true;
  let updateAssumeRolePolicy = false;

  try {
    const { Role } = await iam.getRole({
      RoleName: name
    }).promise();


    const currentAssumeRolePolicy = decodeURIComponent(Role.AssumeRolePolicyDocument);
    // Make the whitespace consistent with the current document
    assumeRolePolicyDocument = JSON.stringify(JSON.parse(assumeRolePolicyDocument));

    if (currentAssumeRolePolicy !== assumeRolePolicyDocument && ensureAssumeRolePolicy) {
      updateAssumeRolePolicy = true;
    }
  } catch (e) {
    exists = false;
  }

  if (!exists) {
    await iam.createRole({
      RoleName: name,
      AssumeRolePolicyDocument: assumeRolePolicyDocument
    }).promise();
  } else if (updateAssumeRolePolicy) {
    await iam.updateAssumeRolePolicy({
      RoleName: name,
      PolicyDocument: assumeRolePolicyDocument
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

export async function ensureInlinePolicyAttached(role, policyName, policyDocument) {
  let exists = true;
  let needsUpdating = false;

  try {
    const result = await iam.getRolePolicy({
      RoleName: role,
      PolicyName: policyName
    }).promise();
    const currentPolicyDocument = decodeURIComponent(result.PolicyDocument);

    if (currentPolicyDocument !== policyDocument) {
      needsUpdating = true;
    }
  } catch (e) {
    exists = false;
  }

  if (!exists || needsUpdating) {
    await iam.putRolePolicy({
      RoleName: role,
      PolicyName: policyName,
      PolicyDocument: policyDocument
    }).promise();
  }
}

export async function ensureBucketExists(buckets, bucketName, region) {
  if (!buckets.find(bucket => bucket.Name === bucketName)) {
    await s3.createBucket({
      Bucket: bucketName,
      ...(region ? {
        CreateBucketConfiguration: {
          LocationConstraint: region
        }
      } : {})
    }).promise();

    return true;
  }
}

export function findBucketWithPrefix(buckets, prefix) {
  return buckets.find(bucket => bucket.Name.indexOf(prefix) === 0);
}

export async function ensureBucketPolicyAttached(bucketName, policy) {
  let error = false;
  let currentPolicy;

  try {
    const { Policy } = await s3.getBucketPolicy({ Bucket: bucketName }).promise();
    currentPolicy = Policy;
  } catch (e) {
    error = true;
  }

  if (error || currentPolicy !== policy) {
    const params = {
      Bucket: bucketName,
      Policy: policy
    };

    await s3.putBucketPolicy(params).promise();
  }
}

export async function ensureCloudWatchRule(name, description, eventPattern) {
  let error = false;

  try {
    await cloudWatchEvents.describeRule({ Name: name }).promise();
  } catch (e) {
    error = true;
  }

  if (error) {
    await cloudWatchEvents.putRule({
      Name: name,
      Description: description,
      EventPattern: eventPattern
    }).promise();

    return true;
  }

  return false;
}

export async function ensureRuleTargetExists(ruleName, target) {
  const {
    Targets
  } = await cloudWatchEvents.listTargetsByRule({
    Rule: ruleName
  }).promise();

  if (!Targets.find(_target => isEqual(_target, target))) {
    const params = {
      Rule: ruleName,
      Targets: [target]
    };
    await cloudWatchEvents.putTargets(params).promise();

    return true;
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


// Checks if it is safe to use the environment variables from s3
export function checkLongEnvSafe(currentConfig, commandHistory, appConfig) {
  const optionEnabled = appConfig.longEnvVars;
  const previouslyMigrated = currentConfig[0].OptionSettings.find(({ Namespace, OptionName }) => Namespace === 'aws:elasticbeanstalk:application:environment' &&
      OptionName === 'MUP_ENV_FILE_VERSION');
  const reconfigCount = commandHistory.filter(({ name }) => name === 'beanstalk.reconfig').length;
  const ranDeploy = commandHistory.find(({ name }) => name === 'beanstalk.deploy') && reconfigCount > 1;

  return {
    migrated: previouslyMigrated,
    safeToReconfig: optionEnabled && (previouslyMigrated || ranDeploy),
    enabled: optionEnabled
  };
}

export function createVersionDescription(api, appConfig) {
  const appPath = api.resolvePath(api.getBasePath(), appConfig.path);
  let description = '';

  try {
    description = execSync('git log -1 --pretty=%B', {
      cwd: appPath,
      stdio: 'pipe'
    }).toString();
  } catch (e) {
    description = `Deployed by Mup on ${new Date().toUTCString()}`;
  }
  return description.split('\n')[0].slice(0, 195);
}

export async function ensureSsmDocument(name, content) {
  let exists = true;
  let needsUpdating = false;

  try {
    const result = await ssm.getDocument({ Name: name, DocumentVersion: '$LATEST' }).promise();
    // If the document was created or edited on the AWS console, there is extra new
    // line characters and whitespace
    const currentContent = JSON.stringify(JSON.parse(result.Content.replace(/\r?\n|\r/g, '')));
    if (currentContent !== content) {
      needsUpdating = true;
    }
  } catch (e) {
    exists = false;
  }

  if (!exists) {
    await ssm.createDocument({
      Content: content,
      Name: name,
      DocumentType: 'Automation'
    }).promise();

    return true;
  } else if (needsUpdating) {
    await ssm.updateDocument({
      Content: content,
      Name: name,
      DocumentVersion: '$LATEST'
    }).promise();
  }
}

export async function getEnvFileContent(api, newestVersion) {
  const config = api.getConfig();
  const {
    bucket: bucketName
  } = names(config);

  try {
    const result = await s3.getObject({
      Bucket: bucketName,
      Key: `env/${newestVersion}.txt`
    }).promise();

    return result.Body.toString();
  } catch (e) {
    return null;
  }
}
