import { s3 } from './aws';

export default function downloadEnvFile(bucket, version) {
  return new Promise((resolve, reject) => {
    const downloader = s3.getObject({
      Bucket: bucket,
      Key: `env/${version}.txt`
    });
    downloader.send((err, result) => {
      if (err) {
        return reject(err);
      }
      result = Buffer.from(result.Body).toString('utf8');
      if (result.indexOf('METEOR_SETTINGS_ENCODED') !== -1) {
        result = decodeURIComponent(result.slice(
          result.indexOf('METEOR_SETTINGS_ENCODED') + 25,
          result.length - 1
        ));
        result = JSON.parse(result);
      }
      resolve(result);
    });
  });
}
