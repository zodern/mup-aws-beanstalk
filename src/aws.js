import AWS from 'aws-sdk';

let client = {};
let configured = false;

export default function configure({ auth, name, region }) {
  if (configured) {
    return client;
  }
  const options = {
    accessKeyId: auth.id,
    secretAccessKey: auth.secret,
    region: region || 'us-east-1'
  };

  AWS.config.update(options);
  configured = true;

  client = {
    s3: new AWS.S3({ params: { Bucket: `mup-${name}` }, apiVersion: '2006-03-01' }),
    beanstalk: new AWS.ElasticBeanstalk({ apiVersion: '2010-12-01' }),
    iam: new AWS.IAM({ apiVersion: '2010-05-08' }),
    autoScaling: new AWS.AutoScaling({ apiVersion: '2011-01-01' })
  };

  return client;
}
