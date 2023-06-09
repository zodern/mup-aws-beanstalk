import axios from 'axios';
import chalk from 'chalk';
import fs from 'fs';
import { isEqual, isString } from 'lodash';
import os from 'os';
import random from 'random-seed';
import uuid from 'uuid';
import { Client } from "ssh2";
import { execSync } from 'child_process';
import { beanstalk, cloudWatchEvents, iam, s3, sts, ssm, ec2, ec2InstanceConnect } from './aws';
import { getRecheckInterval } from './recheck';
import { waitForEnvReady } from './env-ready';
import { MupApi, MupAwsConfig, MupConfig, Buckets } from "./types";
import { EnvironmentInfoDescription } from "@aws-sdk/client-elastic-beanstalk";
import { AttachRolePolicyCommandOutput } from "@aws-sdk/client-iam";
import { Target } from "@aws-sdk/client-cloudwatch-events";

export function logStep(message: string) {
  console.log(chalk.blue(message));
}

export function shouldRebuild(bundlePath: string, useCachedBuild?: boolean) {
  if (fs.existsSync(bundlePath) && useCachedBuild) {
    return false;
  }

  return true;
}

export function tmpBuildPath(appPath: string, api: MupApi) {
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

export function names(config: MupConfig) {
  const name = config.app.name.toLowerCase();

  return {
    bucket: `mup-${name}`,
    environment: config.app.envName || `mup-env-${name}`,
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

async function retrieveEnvironmentInfo(api: MupApi, count: number): Promise<EnvironmentInfoDescription[]> {
  const config = api.getConfig();
  const { environment } = names(config);

  const {
    EnvironmentInfo
  } = await beanstalk.retrieveEnvironmentInfo({
    EnvironmentName: environment,
    InfoType: 'tail'
  });

  if (EnvironmentInfo && EnvironmentInfo.length > 0) {
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

export async function getLogs(api: MupApi, logNames: string[]): Promise<{ data: string[], instance: string }[]> {
  const config = api.getConfig();
  const { environment } = names(config);

  await waitForEnvReady(config, false);

  logStep('=> Requesting Logs');

  await beanstalk.requestEnvironmentInfo({
    EnvironmentName: environment,
    InfoType: 'tail'
  });

  const EnvironmentInfo = await retrieveEnvironmentInfo(api, 0);

  logStep('=> Downloading Logs');

  const logsForServer = EnvironmentInfo && EnvironmentInfo.reduce(
    (result: { [key: string]: string }, { Ec2InstanceId, Message }: EnvironmentInfoDescription) => {
      if (isString(Ec2InstanceId)) {
        result[Ec2InstanceId] = Message!;
      }
    return result;
  }, {});

  return Promise.all(Object.keys(logsForServer).map(key =>
    new Promise<{ data: string[], instance: string }>((resolve, reject) => {
      axios.get<string>(logsForServer[key]).then(({ data }) => {
        // The separator changed with Amazon Linux 2
        let parts = data.split('----------------------------------------\n/var/log/');
        if (parts.length === 1) {
          parts = data.split('-------------------------------------\n/var/log/');
        }

        const logParts = logNames.map(name =>
          parts.find(part => part.trim().startsWith(name)) || '');

        resolve({
          data: logParts,
          instance: key
        });
      }).catch(reject);
    })));
}

export function getNodeVersion(api: MupApi, bundlePath: string) {
  const starString = fs.readFileSync(api.resolvePath(bundlePath, 'bundle/star.json')).toString();
  const nodeVersionTxt = fs.readFileSync(api.resolvePath(bundlePath, 'bundle/.node_version.txt')).toString();

  const star = JSON.parse(starString);

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

export async function selectPlatformArn() {
  const {
    PlatformBranchSummaryList
  } = await beanstalk.listPlatformBranches({
    Filters: [{
      Attribute: 'LifecycleState',
      Operator: '=',
      Values: ['supported']
    }, {
      Attribute: 'PlatformName',
      Operator: '=',
      Values: ['Node.js']
    }, {
      Attribute: 'TierType',
      Operator: '=',
      Values: ['WebServer/Standard']
    }]
  });

  if (!PlatformBranchSummaryList || PlatformBranchSummaryList.length === 0) {
    throw new Error('Unable to find supported Node.js platform');
  }

  const branchName = PlatformBranchSummaryList[0].BranchName as string;

  const {
    PlatformSummaryList
  } = await beanstalk.listPlatformVersions({
    Filters: [
      {
        Type: 'PlatformBranchName',
        Operator: '=',
        Values: [branchName]
      },
      {
        Type: 'PlatformStatus',
        Operator: '=',
        Values: ['Ready']
      }
    ]
  });

  const arn = PlatformSummaryList![0].PlatformArn;

  return arn;
}

export async function attachPolicies(roleName: string, policies: string[]) {
  const promises: Promise<AttachRolePolicyCommandOutput>[] = [];

  policies.forEach((policy) => {
    const promise = iam.attachRolePolicy({
      RoleName: roleName,
      PolicyArn: policy
    });

    promises.push(promise);
  });

  await Promise.all(promises);
}

export async function getAccountId() {
  const identity = await sts.getCallerIdentity({})
  return identity.Account!;
}

export async function ensureRoleExists(
  name: string,
  assumeRolePolicyDocument: string,
  ensureAssumeRolePolicy?: boolean
) {
  let exists = true;
  let updateAssumeRolePolicy = false;

  try {
    const { Role } = await iam.getRole({
      RoleName: name
    });

    const currentAssumeRolePolicy = decodeURIComponent(Role!.AssumeRolePolicyDocument!);
    // Make the whitespace consistent with the current document
    const consistentAssumeRolePolicyDocument = JSON.stringify(JSON.parse(assumeRolePolicyDocument));

    if (currentAssumeRolePolicy !== consistentAssumeRolePolicyDocument && ensureAssumeRolePolicy) {
      updateAssumeRolePolicy = true;
    }
  } catch (e) {
    exists = false;
  }

  if (!exists) {
    await iam.createRole({
      RoleName: name,
      AssumeRolePolicyDocument: assumeRolePolicyDocument
    });
  } else if (updateAssumeRolePolicy) {
    await iam.updateAssumeRolePolicy({
      RoleName: name,
      PolicyDocument: assumeRolePolicyDocument
    });
  }
}

export async function ensureInstanceProfileExists(name: string) {
  let exists = true;

  try {
    await iam.getInstanceProfile({
      InstanceProfileName: name
    });
  } catch (e) {
    exists = false;
  }

  if (!exists) {
    await iam.createInstanceProfile({
      InstanceProfileName: name
    });
  }
}

export async function ensureRoleAdded(instanceProfile: string, role: string) {
  let added = true;

  const {
    InstanceProfile
  } = await iam.getInstanceProfile({
    InstanceProfileName: instanceProfile
  });

  if (InstanceProfile!.Roles!.length === 0 || InstanceProfile!.Roles![0].RoleName !== role) {
    added = false;
  }

  if (!added) {
    await iam.addRoleToInstanceProfile({
      InstanceProfileName: instanceProfile,
      RoleName: role
    });
  }
}

export async function ensurePoliciesAttached(role: string, policies: string[]) {
  let {
    AttachedPolicies
  } = await iam.listAttachedRolePolicies({
    RoleName: role
  });

  const arns = AttachedPolicies!.map(policy => policy.PolicyArn);

  const unattachedPolicies = policies.reduce((result, policy) => {
    if (arns.indexOf(policy) === -1) {
      result.push(policy);
    }

    return result;
  }, [] as string[]);

  if (unattachedPolicies.length > 0) {
    await attachPolicies(role, unattachedPolicies);
  }
}

export async function ensureInlinePolicyAttached(
  role: string,
  policyName: string,
  policyDocument: string
) {
  let exists = true;
  let needsUpdating = false;

  try {
    const result = await iam.getRolePolicy({
      RoleName: role,
      PolicyName: policyName
    });
    const currentPolicyDocument = decodeURIComponent(result.PolicyDocument!);

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
    });
  }
}

export async function ensureBucketExists(
  buckets: Buckets,
  bucketName: string,
  region: string
) {
  if (!buckets.find(bucket => bucket.Name === bucketName)) {
    await s3.createBucket({
      Bucket: bucketName,
      ...(region ? {
        CreateBucketConfiguration: {
          LocationConstraint: region
        }
      } : {})
    });

    return true;
  }
}

export function findBucketWithPrefix(
  buckets: Buckets,
  prefix: string
) {
  return buckets.find(bucket => bucket.Name!.indexOf(prefix) === 0);
}

export async function ensureBucketPolicyAttached(
  bucketName: string,
  policy: string
) {
  let error = false;
  let currentPolicy;

  try {
    const { Policy } = await s3.getBucketPolicy({ Bucket: bucketName });
    currentPolicy = Policy;
  } catch (e) {
    error = true;
  }

  if (error || currentPolicy !== policy) {
    const params = {
      Bucket: bucketName,
      Policy: policy
    };

    await s3.putBucketPolicy(params);
  }
}

export async function ensureCloudWatchRule(
  name: string,
  description: string,
  eventPattern: string
) {
  let error = false;

  try {
    await cloudWatchEvents.describeRule({ Name: name });
  } catch (e) {
    error = true;
  }

  if (error) {
    await cloudWatchEvents.putRule({
      Name: name,
      Description: description,
      EventPattern: eventPattern
    });

    return true;
  }

  return false;
}

export async function ensureRuleTargetExists(ruleName: string, target: Target) {
  const {
    Targets
  } = await cloudWatchEvents.listTargetsByRule({
    Rule: ruleName
  });

  if (!Targets!.find(_target => isEqual(_target, target))) {
    const params = {
      Rule: ruleName,
      Targets: [target]
    };

    await cloudWatchEvents.putTargets(params);

    return true;
  }
}

export function coloredStatusText(envColor: string, text: string) {
  if (envColor === 'Green') {
    return chalk.green(text);
  } else if (envColor === 'Yellow') {
    return chalk.yellow(text);
  } else if (envColor === 'Red') {
    return chalk.red(text);
  }
  return text;
}

export function createVersionDescription(api: MupApi, appConfig: MupAwsConfig) {
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

export async function ensureSsmDocument(name: string, content: string) {
  let exists = true;
  let needsUpdating = false;

  try {
    const result = await ssm.getDocument({ Name: name, DocumentVersion: '$DEFAULT' });
    // If the document was created or edited on the AWS console, there is extra new
    // line characters and whitespace
    const currentContent = JSON.stringify(JSON.parse(result.Content!.replace(/\r?\n|\r/g, '')));
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
    });

    return true;
  } else if (needsUpdating) {
    try {
      await ssm.updateDocument({
        Content: content,
        Name: name,
        DocumentVersion: '$LATEST'
      });
    } catch (e) {
      // If the latest document version has the correct content
      // then it must not be the default version. Ignore the error
      // so we can fix the default version
      // @ts-ignore
      if (e.code !== 'DuplicateDocumentContent') {
        throw e;
      }
    }

    const result = await ssm.getDocument({ Name: name, DocumentVersion: '$LATEST' });
    await ssm.updateDocumentDefaultVersion({
      DocumentVersion: result.DocumentVersion,
      Name: name
    });
  }
}

export async function pickInstance(config: MupConfig, instance: string) {
  const {
    environment
  } = names(config);

  const { EnvironmentResources } = await beanstalk.describeEnvironmentResources({
    EnvironmentName: environment
  });
  const instanceIds = EnvironmentResources!.Instances!.map(({ Id }) => Id);
  const description = [
    'Available instances',
    ...instanceIds.map(id => `  - ${id}`)
  ].join('\n');

  return {
    selected: instanceIds.includes(instance) ? instance : null,
    description
  };
}

export async function connectToInstance(
  api: MupApi,
  instanceId: string,
  commandLabel: string
) {
  const {
    sshKey
  } = api.getConfig().app;

  if (!sshKey) {
    const error = new Error('missing sshKey config');
    // @ts-ignore
    error.solution = 'Learn how to configure sshKey at https://github.com/zodern/mup-aws-beanstalk/blob/master/docs/index.md#meteor-shell-and-debug';

    throw error;
  }

  const { Reservations } = await ec2.describeInstances({
    InstanceIds: [
      instanceId
    ]
  });

  const instance = Reservations![0].Instances![0];
  const availabilityZone = instance!.Placement!.AvailabilityZone;
  const securityGroups = instance!.SecurityGroups!.map(g => g.GroupId);

  let { data: ipAddress } = await axios.get<string>('https://ipv4.icanhazip.com');
  ipAddress = ipAddress.trim();

  if (securityGroups.length > 1) {
    console.warn('Instance has more than one security group. Please open a GitHub issue for mup-aws-beanstalk');
  }

  let ruleIds: string[] = [];

  try {
    const { SecurityGroupRules } = await ec2.authorizeSecurityGroupIngress({
      GroupId: securityGroups[0],
      IpPermissions: [
        {
          FromPort: 22,
          IpProtocol: 'tcp',
          IpRanges: [
            {
              CidrIp: `${ipAddress}/32`,
              Description: `Temporary SSH access for ${commandLabel}`
            }
          ],
          ToPort: 22
        }
      ]
    });

    ruleIds = SecurityGroupRules!.map(rule => rule.SecurityGroupRuleId!);
  } catch (e) {
    // @ts-ignore
    if (e.code === 'InvalidPermission.Duplicate') {
      // This rule already exists
      // TODO: should we find the rule id so we can remove it, or leave it in
      // case the user had manually added this rule?
    } else {
      throw e;
    }
  }

  await ec2InstanceConnect.sendSSHPublicKey({
    InstanceId: instanceId,
    AvailabilityZone: availabilityZone,
    InstanceOSUser: 'ec2-user',
    SSHPublicKey: fs.readFileSync(api.resolvePath(sshKey.publicKey), 'utf-8')
  });

  const sshOptions = {
    host: instance.PublicDnsName!,
    port: 22,
    username: 'ec2-user',
    privateKey: fs.readFileSync(api.resolvePath(sshKey.privateKey), 'utf-8')
  };

  return {
    sshOptions,
    removeSSHAccess() {
      if (ruleIds.length === 0) {
        return;
      }

      console.log('Removing temporary security group rule for SSH');
      return ec2.revokeSecurityGroupIngress({
        GroupId: securityGroups[0],
        SecurityGroupRuleIds: ruleIds
      });
    }
  };
}

export async function executeSSHCommand(conn: Client, command: string) {
  return new Promise<{ code: number, output: string }>((resolve, reject) => {
    conn.exec(command, (err, outputStream) => {
      if (err) {
        conn.end();
        reject(err);

        return;
      }

      let output = '';

      outputStream.on('data', (data: string) => {
        output += data;
      });

      outputStream.stderr.on('data', (data: string) => {
        output += data;
      });

      outputStream.once('close', (code: number) => {
        conn.end();
        resolve({ code, output });
      });
    });
  });
}
