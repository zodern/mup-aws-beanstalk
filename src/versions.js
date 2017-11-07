import configure from './aws';
import {
  names
} from './utils';

export async function ebVersions(api) {
  const config = api.getConfig();
  let version = 0;

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
    appVersions.ApplicationVersions.forEach(({ VersionLabel }) => {
      const parsedVersion = parseInt(VersionLabel, 10);
      if (parsedVersion > version) {
        version = parsedVersion;
      }
    });
  }

  return version;
}

export async function s3Versions(api) {
  const config = api.getConfig();
  let version = 0;
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

      if (bundleVersion >= version) {
        version = bundleVersion;
      }
    });
  }

  return version;
}

export async function largestVersion(api) {
  let version = await s3Versions(api);
  const appVersion = await ebVersions(api);

  if (appVersion > version) {
    version = appVersion;
  }

  return version;
}

export function deployedVersion() {

}