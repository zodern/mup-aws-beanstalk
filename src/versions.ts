import { difference } from 'lodash';
import {
  beanstalk,
  s3
} from './aws';
import { names } from './utils';
import { MupApi } from "./types";

export async function ebVersions(api: MupApi) {
  const config = api.getConfig();
  const versions = [0];
  const {
    app
  } = names(config);

  const appVersions = await beanstalk.describeApplicationVersions({
    ApplicationName: app
  });

  if (appVersions.ApplicationVersions
    && appVersions.ApplicationVersions.length > 0) {
    appVersions.ApplicationVersions.forEach(({
      VersionLabel
    }) => {
      const parsedVersion = parseInt(VersionLabel || "0", 10);

      versions.push(parsedVersion);
    });
  }

  return versions.sort((a, b) => b - a);
}

export async function s3Versions (api: MupApi, providedPrefix?: string) {
  const config = api.getConfig();
  const versions = [0];
  const {
    bucket,
    bundlePrefix
  } = names(config);
  const prefix = providedPrefix || bundlePrefix;

  const uploadedBundles = await s3.listObjects({
    Bucket: bucket,
    Prefix: prefix
  });

  if (uploadedBundles.Contents
    && uploadedBundles.Contents.length > 0) {
    uploadedBundles.Contents.forEach((bundle) => {
      if (!bundle.Key) return;
      const bundleVersion = parseInt(bundle.Key.split(prefix)[1], 10);

      versions.push(bundleVersion);
    });
  }

  return versions.sort((a, b) => b - a);
}

export async function largestVersion (api: MupApi) {
  let [version] = await s3Versions(api);
  const [appVersion] = await ebVersions(api);

  if (appVersion > version) {
    version = appVersion;
  }

  return version;
}

export async function largestEnvVersion (api: MupApi) {
  const versions = [0];
  const prefix = 'env/';
  const config = api.getConfig();

  const {
    bucket: bucketName
  } = names(config);

  const uploadedBundles = await s3.listObjectsV2({
    Bucket: bucketName,
    Prefix: prefix
  });

  if (uploadedBundles.Contents
    && uploadedBundles.Contents.length > 0) {
    uploadedBundles.Contents.forEach((bundle) => {
      if (!bundle.Key) return;
      const bundleVersion = parseInt(bundle.Key.split(prefix)[1], 10);

      versions.push(bundleVersion);
    });
  }

  return versions.sort((a, b) => b - a)[0];
}

export async function oldEnvVersions (api: MupApi) {
  const keep = 10;
  const versions = await s3Versions(api, 'env/');

  return versions.slice(keep);
}

export async function oldVersions (api: MupApi) {
  const keep = api.getConfig().app.oldVersions;
  const appVersions = await ebVersions(api);
  const bundleVersions = await s3Versions(api);

  // find unused bundles
  const oldBundleVersions = difference(bundleVersions, appVersions);

  // keep the 3 newest versions
  const oldAppVersions = appVersions.slice(keep);
  return {
    bundles: oldBundleVersions,
    versions: oldAppVersions
  };
}
