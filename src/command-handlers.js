import chalk from 'chalk';
import { Client } from 'ssh2';
import {
  acm,
  s3,
  beanstalk,
  autoScaling,
  cloudTrail
} from './aws';
import updateSSLConfig from './certificates';
import {
  rolePolicy,
  trailBucketPolicy,
  DeregisterEvent,
  deregisterEventTarget,
  serviceRole,
  eventTargetRolePolicy,
  eventTargetRole,
  gracefulShutdownAutomationDocument,
  passRolePolicy
} from './policies';
import upload, { uploadEnvFile } from './upload';
import {
  archiveApp,
  injectFiles
} from './prepare-bundle';
import {
  coloredStatusText,
  ensureBucketExists,
  ensureInstanceProfileExists,
  ensureRoleExists,
  ensureRoleAdded,
  ensurePoliciesAttached,
  ensureBucketPolicyAttached,
  getAccountId,
  getLogs,
  logStep,
  names,
  tmpBuildPath,
  shouldRebuild,
  ensureCloudWatchRule,
  ensureRuleTargetExists,
  ensureInlinePolicyAttached,
  findBucketWithPrefix,
  createUniqueName,
  createVersionDescription,
  ensureSsmDocument,
  selectPlatformArn,
  pickInstance,
  connectToInstance,
  executeSSHCommand
} from './utils';
import {
  largestVersion,
  ebVersions,
  oldVersions,
  oldEnvVersions
} from './versions';

import {
  createDesiredConfig,
  prepareUpdateEnvironment,
  scalingConfig,
  scalingConfigChanged
} from './eb-config';

import {
  waitForEnvReady,
  waitForHealth
} from './env-ready';

export async function setup(api) {
  const config = api.getConfig();
  const appConfig = config.app;

  const {
    bucket: bucketName,
    app: appName,
    instanceProfile,
    serviceRole: serviceRoleName,
    trailBucketPrefix,
    trailName,
    deregisterRuleName,
    environment: environmentName,
    eventTargetRole: eventTargetRoleName,
    eventTargetPolicyName,
    eventTargetPassRoleName,
    automationDocument
  } = names(config);

  logStep('=> Setting up');

  // Create bucket if needed
  const {
    Buckets
  } = await s3.listBuckets().promise();

  const beanstalkBucketCreated = await ensureBucketExists(Buckets, bucketName, appConfig.region);

  if (beanstalkBucketCreated) {
    console.log('  Created Bucket');
  }

  logStep('=> Ensuring IAM Roles and Instance Profiles are setup');

  // Create role and instance profile
  await ensureRoleExists(instanceProfile, rolePolicy);
  await ensureInstanceProfileExists(config, instanceProfile);
  await ensurePoliciesAttached(config, instanceProfile, [
    'arn:aws:iam::aws:policy/AWSElasticBeanstalkWebTier',
    'arn:aws:iam::aws:policy/AWSElasticBeanstalkMulticontainerDocker',
    'arn:aws:iam::aws:policy/AWSElasticBeanstalkWorkerTier',
    ...appConfig.gracefulShutdown ? ['arn:aws:iam::aws:policy/service-role/AmazonEC2RoleforSSM'] : []
  ]);
  await ensureRoleAdded(config, instanceProfile, instanceProfile);

  // Create role used by enhanced health
  await ensureRoleExists(serviceRoleName, serviceRole);
  await ensurePoliciesAttached(config, serviceRoleName, [
    'arn:aws:iam::aws:policy/service-role/AWSElasticBeanstalkEnhancedHealth',
    'arn:aws:iam::aws:policy/service-role/AWSElasticBeanstalkService'
  ]);

  if (appConfig.gracefulShutdown) {
    const accountId = await getAccountId();
    const policy = eventTargetRolePolicy(accountId, environmentName, appConfig.region || 'us-east-1');
    const passPolicy = passRolePolicy(accountId, eventTargetRoleName);

    await ensureRoleExists(eventTargetRoleName, eventTargetRole, true);
    await ensureInlinePolicyAttached(eventTargetRoleName, eventTargetPolicyName, policy);
    await ensureInlinePolicyAttached(eventTargetRoleName, eventTargetPassRoleName, passPolicy);
  }

  // Create beanstalk application if needed
  const {
    Applications
  } = await beanstalk.describeApplications().promise();

  if (!Applications.find(app => app.ApplicationName === appName)) {
    const params = {
      ApplicationName: appName,
      Description: `App "${appConfig.name}" managed by Meteor Up`
    };

    await beanstalk.createApplication(params).promise();
    console.log('  Created Beanstalk application');
  }

  if (appConfig.gracefulShutdown) {
    logStep('=> Ensuring Graceful Shutdown is setup');

    const existingBucket = findBucketWithPrefix(Buckets, trailBucketPrefix);
    const trailBucketName = existingBucket ?
      existingBucket.Name :
      createUniqueName(trailBucketPrefix);
    const region = appConfig.region || 'us-east-1';
    const accountId = await getAccountId();
    const policy = trailBucketPolicy(accountId, trailBucketName);

    const trailBucketCreated = await ensureBucketExists(Buckets, trailBucketName, appConfig.region);
    await ensureBucketPolicyAttached(trailBucketName, policy);

    if (trailBucketCreated) {
      console.log('  Created bucket for Cloud Trail');
    }

    const params = {
      trailNameList: [
        trailName
      ]
    };

    const {
      trailList
    } = await cloudTrail.describeTrails(params).promise();

    if (trailList.length === 0) {
      const createParams = {
        Name: trailName,
        S3BucketName: trailBucketName
      };

      await cloudTrail.createTrail(createParams).promise();

      console.log('  Created CloudTrail trail');
    }

    const createdDocument = await ensureSsmDocument(
      automationDocument,
      gracefulShutdownAutomationDocument()
    );
    if (createdDocument) {
      console.log('  Created SSM Automation Document');
    }

    const createdRule = await ensureCloudWatchRule(deregisterRuleName, 'Used by Meteor Up for graceful shutdown', DeregisterEvent);

    if (createdRule) {
      console.log('  Created Cloud Watch rule');
    }

    const target = deregisterEventTarget(environmentName, eventTargetRoleName, accountId, region);
    const createdTarget = await ensureRuleTargetExists(deregisterRuleName, target, accountId);

    if (createdTarget) {
      console.log('  Created target for Cloud Watch rule');
    }
  }
}

export async function deploy(api) {
  await api.runCommand('beanstalk.setup');

  const config = api.getConfig();
  const {
    app,
    bucket,
    bundlePrefix,
    environment
  } = names(config);


  const version = await largestVersion(api);
  const nextVersion = version + 1;

  // Mutates the config, so the meteor.build command will have the correct build location
  config.app.buildOptions.buildLocation = config.app.buildOptions.buildLocation ||
    tmpBuildPath(config.app.path, api);

  const bundlePath = api.resolvePath(config.app.buildOptions.buildLocation, 'bundle.zip');
  const willBuild = shouldRebuild(bundlePath, api.getOptions()['cached-build']);

  if (willBuild) {
    await api.runCommand('meteor.build');
    injectFiles(
      api,
      app,
      nextVersion,
      config.app
    );
    await archiveApp(config.app.buildOptions.buildLocation, api);
  }

  logStep('=> Uploading bundle');

  const key = `${bundlePrefix}${nextVersion}`;
  await upload(config.app, bucket, `${bundlePrefix}${nextVersion}`, bundlePath);

  logStep('=> Creating version');

  await beanstalk.createApplicationVersion({
    ApplicationName: app,
    VersionLabel: nextVersion.toString(),
    Description: createVersionDescription(api, config.app),
    SourceBundle: {
      S3Bucket: bucket,
      S3Key: key
    }
  }).promise();

  await api.runCommand('beanstalk.reconfig');
  await waitForEnvReady(config, true);

  logStep('=> Deploying new version');

  const {
    toRemove,
    toUpdate
  } = await prepareUpdateEnvironment(api);

  if (api.verbose) {
    console.log('EB Config changes:');
    console.dir({
      toRemove,
      toUpdate
    });
  }

  await beanstalk.updateEnvironment({
    EnvironmentName: environment,
    VersionLabel: nextVersion.toString(),
    OptionSettings: toUpdate,
    OptionsToRemove: toRemove
  }).promise();

  await waitForEnvReady(config, true);

  const {
    Environments
  } = await beanstalk.describeEnvironments({
    ApplicationName: app,
    EnvironmentNames: [environment]
  }).promise();

  await api.runCommand('beanstalk.clean');

  await api.runCommand('beanstalk.ssl');

  // Check if deploy succeeded
  const {
    Environments: finalEnvironments
  } = await beanstalk.describeEnvironments({
    ApplicationName: app,
    EnvironmentNames: [environment]
  }).promise();

  if (nextVersion.toString() === finalEnvironments[0].VersionLabel) {
    console.log(chalk.green(`App is running at ${Environments[0].CNAME}`));
  } else {
    console.log(chalk.red`Deploy Failed. Visit the Aws Elastic Beanstalk console to view the logs from the failed deploy.`);
    process.exitCode = 1;
  }
}

export async function logs(api) {
  const logsContent = await getLogs(api, ['web.stdout.log']);

  logsContent.forEach(({
    instance,
    data
  }) => {
    console.log(`${instance} `, data[0]);
  });
}

export async function logsNginx(api) {
  const logsContent = await getLogs(api, ['nginx/error.log', 'nginx/access.log']);

  logsContent.forEach(({
    instance,
    data
  }) => {
    console.log(`${instance} `, data[0]);
    console.log(`${instance} `, data[1]);
  });
}

export async function logsEb(api) {
  const logsContent = await getLogs(api, ['eb-engine.log']);

  logsContent.forEach(({
    data,
    instance
  }) => {
    console.log(`${instance} `, data[0]);
  });
}

export async function start(api) {
  const config = api.getConfig();
  const {
    environment
  } = names(config);

  logStep('=> Starting App');

  const {
    EnvironmentResources
  } = await beanstalk.describeEnvironmentResources({
    EnvironmentName: environment
  }).promise();

  const autoScalingGroup = EnvironmentResources.AutoScalingGroups[0].Name;

  const {
    minInstances,
    maxInstances
  } = config.app;

  await autoScaling.updateAutoScalingGroup({
    AutoScalingGroupName: autoScalingGroup,
    MaxSize: maxInstances,
    MinSize: minInstances,
    DesiredCapacity: minInstances
  }).promise();

  await waitForHealth(config);
}

export async function stop(api) {
  const config = api.getConfig();
  const {
    environment
  } = names(config);

  logStep('=> Stopping App');

  const {
    EnvironmentResources
  } = await beanstalk.describeEnvironmentResources({
    EnvironmentName: environment
  }).promise();

  const autoScalingGroup = EnvironmentResources.AutoScalingGroups[0].Name;

  await autoScaling.updateAutoScalingGroup({
    AutoScalingGroupName: autoScalingGroup,
    MaxSize: 0,
    MinSize: 0,
    DesiredCapacity: 0
  }).promise();

  await waitForHealth(config, 'Grey');
}

export async function restart(api) {
  const config = api.getConfig();
  const {
    environment
  } = names(config);

  logStep('=> Restarting App');

  await beanstalk.restartAppServer({
    EnvironmentName: environment
  }).promise();

  await waitForEnvReady(config, false);
}

export async function clean(api) {
  const config = api.getConfig();
  const {
    app,
    bucket
  } = names(config);

  logStep('=> Finding old versions');
  const {
    versions
  } = await oldVersions(api);
  const envVersions = await oldEnvVersions(api);

  logStep('=> Removing old versions');

  const promises = [];
  for (let i = 0; i < versions.length; i++) {
    promises.push(beanstalk.deleteApplicationVersion({
      ApplicationName: app,
      VersionLabel: versions[i].toString(),
      DeleteSourceBundle: true
    }).promise());
  }

  for (let i = 0; i < envVersions.length; i++) {
    promises.push(s3.deleteObject({
      Bucket: bucket,
      Key: `env/${envVersions[i]}.txt`
    }).promise());
  }

  // TODO: remove bundles

  await Promise.all(promises);
}

export async function reconfig(api) {
  const config = api.getConfig();
  const {
    app,
    environment,
    bucket
  } = names(config);
  const deploying = !!api.commandHistory.find(entry => entry.name === 'beanstalk.deploy');

  logStep('=> Configuring Beanstalk environment');

  // check if env exists
  const {
    Environments
  } = await beanstalk.describeEnvironments({
    ApplicationName: app,
    EnvironmentNames: [environment]
  }).promise();

  if (!Environments.find(env => env.Status !== 'Terminated')) {
    const desiredEbConfig = createDesiredConfig(
      api.getConfig(),
      api.getSettings(),
      config.app.longEnvVars ? 1 : false
    );

    if (config.app.longEnvVars) {
      await uploadEnvFile(bucket, 1, config.app.env, api.getSettings());
    }

    const platformArn = await selectPlatformArn();

    const [version] = await ebVersions(api);
    await beanstalk.createEnvironment({
      ApplicationName: app,
      EnvironmentName: environment,
      Description: `Environment for ${config.app.name}, managed by Meteor Up`,
      VersionLabel: version.toString(),
      PlatformArn: platformArn,
      OptionSettings: desiredEbConfig.OptionSettings
    }).promise();

    console.log(' Created Environment');
    await waitForEnvReady(config, false);
  } else if (!deploying) {
    // If we are deploying, the environment will be updated
    // at the same time we update the environment version
    const {
      toRemove,
      toUpdate
    } = await prepareUpdateEnvironment(api);

    if (api.verbose) {
      console.log('EB Config changes:');
      console.dir({
        toRemove,
        toUpdate
      });
    }

    if (toRemove.length > 0 || toUpdate.length > 0) {
      await waitForEnvReady(config, true);
      await beanstalk.updateEnvironment({
        EnvironmentName: environment,
        OptionSettings: toUpdate,
        OptionsToRemove: toRemove
      }).promise();
      console.log('  Updated Environment');
      await waitForEnvReady(config, true);
    }
  }

  const {
    ConfigurationSettings
  } = await beanstalk.describeConfigurationSettings({
    EnvironmentName: environment,
    ApplicationName: app
  }).promise();

  if (scalingConfigChanged(ConfigurationSettings[0].OptionSettings, config)) {
    logStep('=> Configuring scaling');
    await beanstalk.updateEnvironment({
      EnvironmentName: environment,
      OptionSettings: scalingConfig(config.app).OptionSettings
    }).promise();
    await waitForEnvReady(config, true);
  }
}

export async function events(api) {
  const {
    environment
  } = names(api.getConfig());

  const {
    Events: envEvents
  } = await beanstalk.describeEvents({
    EnvironmentName: environment
  }).promise();

  console.log(envEvents.map(ev => `${ev.EventDate}: ${ev.Message}`).join('\n'));
}

export async function status(api) {
  const {
    environment
  } = names(api.getConfig());

  let result;

  try {
    result = await beanstalk.describeEnvironmentHealth({
      AttributeNames: [
        'All'
      ],
      EnvironmentName: environment
    }).promise();
  } catch (e) {
    if (e.message.includes('No Environment found for EnvironmentName')) {
      console.log(' AWS Beanstalk environment does not exist');
      return;
    }

    throw e;
  }

  const {
    InstanceHealthList
  } = await beanstalk.describeInstancesHealth({
    AttributeNames: [
      'All'
    ],
    EnvironmentName: environment
  }).promise();

  const {
    RequestCount,
    Duration,
    StatusCodes,
    Latency
  } = result.ApplicationMetrics;

  console.log(`Environment Status: ${result.Status}`);
  console.log(`Health Status: ${coloredStatusText(result.Color, result.HealthStatus)}`);
  if (result.Causes.length > 0) {
    console.log('Causes: ');
    result.Causes.forEach(cause => console.log(`  ${cause}`));
  }
  console.log('');
  console.log(`=== Metrics For Last ${Duration || 'Unknown'} Minutes ===`);
  console.log(`  Requests: ${RequestCount}`);
  if (StatusCodes) {
    console.log('  Status Codes');
    console.log(`    2xx: ${StatusCodes.Status2xx}`);
    console.log(`    3xx: ${StatusCodes.Status3xx}`);
    console.log(`    4xx: ${StatusCodes.Status4xx}`);
    console.log(`    5xx: ${StatusCodes.Status5xx}`);
  }
  if (Latency) {
    console.log('  Latency');
    console.log(`    99.9%: ${Latency.P999}`);
    console.log(`    99%  : ${Latency.P99}`);
    console.log(`    95%  : ${Latency.P95}`);
    console.log(`    90%  : ${Latency.P90}`);
    console.log(`    85%  : ${Latency.P85}`);
    console.log(`    75%  : ${Latency.P75}`);
    console.log(`    50%  : ${Latency.P50}`);
    console.log(`    10%  : ${Latency.P10}`);
  }
  console.log('');
  console.log('=== Instances ===');
  InstanceHealthList.forEach((instance) => {
    console.log(`  ${instance.InstanceId}: ${coloredStatusText(instance.Color, instance.HealthStatus)}`);
  });
  if (InstanceHealthList.length === 0) {
    console.log('  0 Instances');
  }
}

export async function ssl(api) {
  const config = api.getConfig();

  await waitForEnvReady(config, true);

  if (!config.app || !config.app.sslDomains) {
    logStep('=> Updating Beanstalk SSL Config');
    await updateSSLConfig(config);
    return;
  }

  logStep('=> Checking Certificate Status');

  const domains = config.app.sslDomains;
  const {
    CertificateSummaryList
  } = await acm.listCertificates().promise();
  let found = null;

  for (let i = 0; i < CertificateSummaryList.length; i++) {
    const {
      DomainName,
      CertificateArn
    } = CertificateSummaryList[i];

    if (DomainName === domains[0]) {
      const {
        Certificate
      } = await acm.describeCertificate({ // eslint-disable-line no-await-in-loop
        CertificateArn
      }).promise();

      if (domains.join(',') === Certificate.SubjectAlternativeNames.join(',')) {
        found = CertificateSummaryList[i];
      }
    }
  }

  let certificateArn;

  if (!found) {
    logStep('=> Requesting Certificate');

    const result = await acm.requestCertificate({
      DomainName: domains.shift(),
      SubjectAlternativeNames: domains.length > 0 ? domains : null
    }).promise();

    certificateArn = result.CertificateArn;
  }

  if (found) {
    certificateArn = found.CertificateArn;
  }

  let emailsProvided = false;
  let checks = 0;
  let certificate;

  /* eslint-disable no-await-in-loop */
  while (!emailsProvided && checks < 5) {
    const {
      Certificate
    } = await acm.describeCertificate({
      CertificateArn: certificateArn
    }).promise();
    const validationOptions = Certificate.DomainValidationOptions[0];

    if (typeof validationOptions.ValidationEmails === 'undefined') {
      emailsProvided = true;
      certificate = Certificate;
    } else if (validationOptions.ValidationEmails.length > 0 || checks === 6) {
      emailsProvided = true;
      certificate = Certificate;
    } else {
      checks += 1;

      await new Promise((resolve) => {
        setTimeout(resolve, 1000 * 10);
      });
    }
  }

  if (certificate.Status === 'PENDING_VALIDATION') {
    console.log('Certificate is pending validation.');
    certificate.DomainValidationOptions.forEach(({
      DomainName,
      ValidationEmails,
      ValidationDomain,
      ValidationStatus
    }) => {
      if (ValidationStatus === 'SUCCESS') {
        console.log(chalk.green(`${ValidationDomain || DomainName} has been verified`));
        return;
      }

      console.log(chalk.yellow(`${ValidationDomain || DomainName} is pending validation`));

      if (ValidationEmails) {
        console.log('Emails with instructions have been sent to:');

        ValidationEmails.forEach((email) => {
          console.log(`  ${email}`);
        });
      }

      console.log('Run "mup beanstalk ssl" after you have verified the domains, or to check the verification status');
    });
  } else if (certificate.Status === 'ISSUED') {
    console.log(chalk.green('Certificate has been issued'));
    logStep('=> Updating Beanstalk SSL config');
    await updateSSLConfig(config, certificateArn);
  }
}

export async function shell(api) {
  const {
    selected,
    description
  } = await pickInstance(api.getConfig(), api.getArgs()[2]);

  if (!selected) {
    console.log(description);
    console.log('Run "mup beanstalk shell <instance id>"');
    process.exitCode = 1;

    return;
  }

  const sshOptions = await connectToInstance(api, selected);

  const conn = new Client();
  conn.on('ready', () => {
    conn.exec('sudo node /home/webapp/meteor-shell.js', {
      pty: true
    }, (err, stream) => {
      if (err) {
        throw err;
      }
      stream.on('close', () => {
        conn.end();
        process.exit();
      });

      process.stdin.setRawMode(true);
      process.stdin.pipe(stream);

      stream.pipe(process.stdout);
      stream.stderr.pipe(process.stderr);
      stream.setWindow(process.stdout.rows, process.stdout.columns);

      process.stdout.on('resize', () => {
        stream.setWindow(process.stdout.rows, process.stdout.columns);
      });
    });
  }).connect(sshOptions);
}

export async function debug(api) {
  const config = api.getConfig();
  const {
    selected,
    description
  } = await pickInstance(config, api.getArgs()[2]);

  if (!selected) {
    console.log(description);
    console.log('Run "mup beanstalk debug <instance id>"');
    process.exitCode = 1;

    return;
  }

  const sshOptions = await connectToInstance(api, selected);

  const conn = new Client();
  conn.on('ready', async () => {
    const result = await executeSSHCommand(
      conn,
      'sudo pkill -USR1 -u webapp -n node || sudo pkill -USR1 -u nodejs -n node'
    );

    if (api.verbose) {
      console.log(result.output);
    }

    const server = {
      ...sshOptions,
      pem: api.resolvePath(config.app.sshKey.privateKey)
    };

    let loggedConnection = false;

    api.forwardPort({
      server,
      localAddress: '0.0.0.0',
      localPort: 9229,
      remoteAddress: '127.0.0.1',
      remotePort: 9229,
      onError(error) {
        console.error(error);
      },
      onReady() {
        console.log('Connected to server');
        console.log('');
        console.log('Debugger listening on ws://127.0.0.1:9229');
        console.log('');
        console.log('To debug:');
        console.log('1. Open chrome://inspect in Chrome');
        console.log('2. Select "Open dedicated DevTools for Node"');
        console.log('3. Wait a minute while it connects and loads the app.');
        console.log('   When it is ready, the app\'s files will appear in the Sources tab');
        console.log('');
        console.log('Warning: Do not use breakpoints when debugging a production server.');
        console.log('They will pause your server when hit, causing it to not handle methods or subscriptions.');
        console.log('Use logpoints or something else that does not pause the server');
        console.log('');
        console.log('The debugger will be enabled until the next time the app is restarted,');
        console.log('though only accessible while this command is running');
      },
      onConnection() {
        if (!loggedConnection) {
          // It isn't guaranteed the debugger is connected, but not many
          // other tools will try to connect to port 9229.
          console.log('');
          console.log('Detected by debugger');
          loggedConnection = true;
        }
      }
    });
  }).connect(sshOptions);
}
