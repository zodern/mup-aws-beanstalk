import configure from './aws';
import upload from './upload';
import {
  archiveApp,
  injectFiles
} from './prepare-bundle';
import {
  names,
  tmpBuildPath,
  shouldRebuild
} from './utils';
import {
  largestVersion,
  ebVersions
} from './versions';

import {
  createDesiredConfig
} from './eb-config';

import {
  waitForEnvReady
} from './env-ready';

export async function setup(api) {
  console.log('=> Setting up');

  const appConfig = api.getConfig().app;
  const {
    s3,
    beanstalk
  } = configure(appConfig);
  const bucketName = `mup-${appConfig.name}`;
  const appName = `mup-${appConfig.name}`;

  // Create bucket if needed
  const {
    Buckets
  } = await s3.listBuckets().promise();

  if (!Buckets.find(bucket => bucket.Name === bucketName)) {
    await s3.createBucket({
      Bucket: bucketName
    }).promise();
    console.log('  Created Bucket');
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

  // TODO: check if there is an environment, and then check if the VersionLifecycleConfig is setup
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
  const {
    beanstalk
  } = configure(config.app);

  const version = await largestVersion(api);
  const nextVersion = version + 1;

  // Mutates the config, so the meteor.build command will have the correct build location
  config.app.buildOptions.buildLocation = config.app.buildOptions.buildLocation ||
    tmpBuildPath(config.app.path, api);

  const bundlePath = api.resolvePath(config.app.buildOptions.buildLocation, 'bundle.zip');
  const willBuild = shouldRebuild(bundlePath, api.getOptions()['cached-build']);

  if (willBuild) {
    await api.runCommand('meteor.build');
    injectFiles(api, app, nextVersion, config.app.buildOptions.buildLocation);
    await archiveApp(config.app.buildOptions.buildLocation, api);
  }

  console.log('=> Uploading bundle');

  const key = `${bundlePrefix}${nextVersion}`;
  await upload(config.app, bucket, `${bundlePrefix}${nextVersion}`, bundlePath);

  console.log('=> Creating Version');

  await beanstalk.createApplicationVersion({
    ApplicationName: app,
    VersionLabel: nextVersion.toString(),
    Description: `Deployed by Mup on ${new Date().toUTCString()}`,
    SourceBundle: {
      S3Bucket: bucket,
      S3Key: key
    }
  }).promise();

  await api.runCommand('beanstalk.reconfig');

  console.log('=> Deploying new version');

  const result = await beanstalk.updateEnvironment({
    EnvironmentName: environment,
    VersionLabel: nextVersion.toString()
  }).promise();

  await waitForEnvReady(config, true);
}

export function logs() {

}

export function start() {

}

export function stop() {

}

export function restart() {

}

export function push() {

}

export async function reconfig(api) {
  const config = api.getConfig();
  const {
    beanstalk
  } = configure(config.app);

  const {
    app,
    environment
  } = names(config);

  console.log('=> Configuring Beanstalk Environment');

  // check if env exists
  const {
    Environments
  } = await beanstalk.describeEnvironments({
    ApplicationName: app,
    EnvironmentNames: [environment]
  }).promise();

  const desiredEbConfig = createDesiredConfig(api.getConfig());

  if (!Environments.find(env => env.Status !== 'Terminated')) {
    const version = await ebVersions(api);
    await beanstalk.createEnvironment({
      ApplicationName: app,
      EnvironmentName: environment,
      CNAMEPrefix: config.app.name,
      Description: `Environment for ${config.app.name}, managed by Meteor Up`,
      VersionLabel: version.toString(),
      SolutionStackName: '64bit Amazon Linux 2017.03 v4.3.0 running Node.js',
      OptionSettings: desiredEbConfig.OptionSettings
    }).promise();

    console.log(' Created Environment');
  } else {
    await waitForEnvReady(config, false);

    // TODO: only update diff, and remove extra items

    await beanstalk.updateEnvironment({
      EnvironmentName: environment,
      OptionSettings: desiredEbConfig.OptionSettings
    }).promise();
    console.log('  Updated Environment');
  }

  await waitForEnvReady(config, true);
  // TODO: Wait until aws finished making changes
}

export async function events(api) {
  const {
    beanstalk
  } = configure(api.getConfig().app);
  const {
    environment
  } = names(api.getConfig());

  const { Events: envEvents } = await beanstalk.describeEvents({
    EnvironmentName: environment
  }).promise();

  console.log(envEvents.map(ev => `${ev.EventDate}: ${ev.Message}`).join('\n'));
}
