import AWS from 'aws-sdk';

/* eslint-disable import/no-mutable-exports */
export let s3 = {};
export let beanstalk = {};
export let iam = {};
export let autoScaling = {};
export let acm = {};
export let ec2 = {};
export let cloudTrail = {};
export let cloudWatchEvents = {};
export let sts = {};

/* eslint-enable import/no-mutable-exports */

export default function configure({ auth, name, region }) {
  const options = {
    accessKeyId: auth.id,
    secretAccessKey: auth.secret,
    region: region || 'us-east-1'
  };

  AWS.config.update(options);

  s3 = new AWS.S3({ params: { Bucket: `mup-${name}` }, apiVersion: '2006-03-01' });
  beanstalk = new AWS.ElasticBeanstalk({ apiVersion: '2010-12-01' });
  iam = new AWS.IAM({ apiVersion: '2010-05-08' });
  autoScaling = new AWS.AutoScaling({ apiVersion: '2011-01-01' });
  acm = new AWS.ACM({ apiVersion: '2015-12-08' });
  ec2 = new AWS.EC2({ apiVersion: '2016-11-15' });
  cloudTrail = new AWS.CloudTrail({ apiVersion: '2013-11-01' });
  sts = new AWS.STS({ apiVersion: '2011-06-15' });
  cloudWatchEvents = new AWS.CloudWatchEvents({ apiVersion: '2015-10-07' });
}
