import {
  difference
} from 'lodash';
import configure from './aws';
import {
  names
} from './utils';

export async function ebVersions(api) {
  const config = api.getConfig();
  const versions = [0];

  const {
    beanstalk
  } = configure(config.app);
  const {
    app
  } = names(config);

  const appVersions = await beanstalk.describeApplicationVersions({
    ApplicationName: app
  }).promise();

  if (appVersions.ApplicationVersions.length > 0) {
    // TODO: check for largest version number
    appVersions.ApplicationVersions.forEach(({
      VersionLabel
    }) => {
      const parsedVersion = parseInt(VersionLabel, 10);

      versions.push(parsedVersion);
    });
  }

  return versions.sort((a, b) => b - a);
}

export async function s3Versions(api) {
  const config = api.getConfig();
  const versions = [0];
  const {
    s3
  } = configure(config.app);
  const {
    bucket,
    bundlePrefix
  } = names(config);

  const uploadedBundles = await s3.listObjectsV2({
    Bucket: bucket,
    Prefix: bundlePrefix
  }).promise();


  if (uploadedBundles.Contents.length > 0) {
    uploadedBundles.Contents.forEach((bundle) => {
      const bundleVersion = parseInt(bundle.Key.split(bundlePrefix)[1], 10);

      versions.push(bundleVersion);
    });
  }

  return versions.sort((a, b) => b - a);
}

export async function largestVersion(api) {
  let [version] = await s3Versions(api);
  const [appVersion] = await ebVersions(api);

  if (appVersion > version) {
    version = appVersion;
  }

  return version;
}

export async function oldVersions(api) {
  const appVersions = await ebVersions(api);
  const bundleVersions = await s3Versions(api);

  // find unused bundles
  const oldBundleVersions = difference(bundleVersions, appVersions);

  // keep the 3 newest versions
  // TODO: make sure the currently deployed version isn't an older one
  const oldAppVersions = appVersions.slice(3);
  return {
    bundles: oldBundleVersions,
    versions: oldAppVersions
  };
}
