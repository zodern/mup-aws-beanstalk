import { s3 } from './aws';

export default async function downloadEnvFile(bucket: string, version: number) {
  const result = await s3.getObject({
    Bucket: bucket,
    Key: `env/${version}.txt`
  });

  const bodyStream = result.Body;

  if (!bodyStream) {
    throw new Error('No body in response');
  }

  return bodyStream.transformToString();
}
