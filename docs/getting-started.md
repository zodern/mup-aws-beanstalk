# Getting Started with mup-aws-beanstalk

## Install

You can install `mup` and `mup-aws-beanstalk` by running

```bash
npm i -g mup mup-aws-beanstalk
```

The AWS Beanstalk plugin requires Node 4 or newer and Meteor Up 1.3.5 or newer.

## Step 1: Initialize your project

In the terminal, run

```bash
cd path/to/app
mkdir .deploy && cd .deploy
mup init
```

This will create a .deploy folder in your app, and `mup init` will add a Meteor settings file and mup config in it.

## Step 2: Customize your Mup Config

You can replace the mup config in `.deploy/mup.js` with this:

```js
module.exports = {
    app: {
        // Tells mup that the AWS Beanstalk plugin will manage the app
        type: 'aws-beanstalk',
        name: 'myApp',
        path: '../',
        env: {
            ROOT_URL: 'http://app.com',
            MONGO_URL: 'mongodb://user:pass@domain.com'
        },
        auth: {
            id: '12345',
            secret: '6789'
        },
        minInstances: 1
    },
    plugins: ['mup-aws-beanstalk']
};
```

You will want to modify:

1) The app name. It must be at least 4 characters
2) `app.env.ROOT_URL`
3) `app.env.MONGO_URL` You will need to get a database from mLab, Compose, or another DBaaS provider

The next step will provide the values for the `app.auth` object.

## Step 3: Create AWS user

You will need to [create an Amazon account](https://portal.aws.amazon.com/billing/signup#/start) if you do not have one.

Next, create an IAM user at [https://console.aws.amazon.com/iam/home?region=us-east-1#/users](https://console.aws.amazon.com/iam/home?region=us-east-1#/users)

The access type should be `Programmatic access`.
You can select `Add user to group` and create a new group. The group should have the following permissions:

- `AdministratorAccess-AWSElasticBeanstalk`
- `IAMFullAccess` This is used to create the roles and Instance Profiles needed by Elastic Beanstalk. After the first deploy, you can replace it with `IAMReadOnlyAccess`
- `AWSCertificateManagerFullAccess` Used to create and manage SSL certificates for the app
- `EC2InstanceConnect` is optional. Used when accessing a production Meteor shell or to connect your node developer tools to the app running in Elastic Beanstalk
- `AmazonEC2FullAccess`
- `AmazonS3FullAccess`

In your mup config, set `app.auth.id` to the Access Key ID, and `app.auth.secret` to the Secret access key AWS gives you after creating the user.

## Step 4: Deploy

Simply run:

```bash
mup deploy
```

It will setup and deploy your app.
