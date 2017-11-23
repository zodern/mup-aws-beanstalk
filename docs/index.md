## Getting Started

Read the [Getting Started tutorial](./getting-started.md).

## Config

- This plugin is configured with the `app` object in your config.
- `app.type` should be set to `aws-beanstalk` so Meteor Up knows this plugin will deploy and manage the app.
- You will need to add `mup-aws-beanstalk` to the `plugins` array in your config
- The `servers` object is not needed

Example config:

```js
module.exports = {
    app: {
        type: 'aws-beanstalk',
        // Must be at least 4 characters
        name: 'app-name',
        auth: {
            // IAM user's Access key ID
            id: '',
            // IAM user's Secret access key
            secret: ''
        },
        env: {
            ROOT_URL: 'http://website.com',
            MONGO_URL: 'mongodb://user:pass@domain.com'
        },
        // (required) Minimum number of servers running your app
        minInstances: 2,
        // (optional, default is minInstances) Maximum number of servers
        // for autoscale to scale up to
        maxInstances: 5
    },
    plugins: ['mup-aws-beanstalk']
}
```

Complete example:
```js
module.exports = {
    app: {
        type: 'aws-beanstalk',
        // Must be at least 4 characters
        name: 'app-name',
        auth: {
            // IAM user's Access key ID
            id: '',
            // IAM user's Secret access key
            secret: ''
        },
        env: {
            ROOT_URL: 'http://website.com',
            MONGO_URL: 'mongodb://user:pass@domain.com'
        },

        // (required) Minimum number of servers running your app
        minInstances: 2,
        // (optional, default is inInstances) Maximum number of servers
        // for autoscale to scale up to
        maxInstances: 5,

        // (optional, default is t2.micro) Type of instance to use
        instanceType: 't2.small',

        // (optional) Array of domains to request an ssl certificate for
        sslDomains: ['app.com', 'www.app.com'],

        // (optional, default is us-east-1) AWS region to deploy to
        region: 'us-west-1',

        // (optional) Packages to install with the yum package manager
        yumPackages: {
            // Property is the version. Leave as an empty string to install the latest version.
            'cairo': '',
            'cairo-devel': '',
            'libjpeg-turbo-devel': '',
            'pango': '',
            'pango-devel': '',
            'giflib-devel': ''
        }

        // (optional) Same options as when deploying with mup. 
        // The one difference is serverOnly now defaults to true
        buildOptions: {
            // Default is true
            serverOnly: true,
            debug: false,
            buildLocation: '../../build',
            mobileSettings: {},
            server: 'http://app.com',
            allowIncompatibleUpdates: true,
            executable: 'meteor'
        }
    },
    plugins: ['mup-aws-beanstalk']
}
```

## Commands

- `mup deploy` Sets up and deploys your app to AWS Beanstalk
- `mup setup` Sets up AWS Beanstalk in preperation to deploy. Automatically run by `mup deploy`
- `mup reconfig` Update Meteor settings and the Beanstalk config. Automatically run by `mup deploy`
- `mup logs` View last 100 lines of the app's logs
- `mup beanstalk logs-eb` View last 100 lines of the logs from Beanstalk setting up the server and the app
- `mup stop` Scales the app to 0 instances
- `mup start` Scales the app back up after being stopped
- `mup restart` Restarts the app
- `mup beanstalk events` View events from the app's Beanstalk enviroment. Useful when troubleshooting problems.
- `mup beanstalk clean` Removes old application versions from s3 and Beanstalk. Is automatically run by `mup deploy` 
- `mup beanstalk ssl` Sets up SSL and shows you it's current status. Automatically run by `mup reconfig` and `mup deploy`
- `mup beanstalk status` View the app's and server's health and http request stats

## Cost

AWS Elastic Beanstalk is free, but you do pay for the services it uses, including:

- EC2 Instances. By default, it uses `t2.micro`, which costs $8.50/month($0.012 / hour). While the Beanstalk environment is updating, or a new version is being deployed, 25% additional servers will be used.
- Application Load Balancer. Pricing details are at https://aws.amazon.com/elasticloadbalancing/pricing/
- S3. 3 - 4 app bundles are stored on s3. Each deploy will make 2 list requests and upload 1 file. Beanstalk might store additional files on s3.

## Rolling Deploys

When deploying a new version, there is no downtime, and the number of servers handling requests is not reduced.

Beanstalk is configured to use Rolling updates with additional batch with a batch size of 25%. This means that Beanstalk first creates an additional 25% instances and deploys the new version of the app to them. After the app has started, it will update the remaining servers in batches of 25%, except for the last 25%, which it terminates.

## Load balancing

Load balancing is automatically configured and supports web sockets and sticky sessions.

## Scale
To scale your app, modify `app.minInstances` in your mup config to how many servers you want your app deployed to. Then run `mup reconfig`.

You cannot scale to 0 servers. Instead, use `mup stop`.

AWS limits how many instances your account can have. To increase the limit, you will need to contact their customer support. Learn more [here](https://aws.amazon.com/premiumsupport/knowledge-center/manage-service-limits/).

## Autoscaling

To enable autoscaling, make sure that `app.maxInstances` in your mup config is greater than `app.minInstances`.

After modifying `app.maxInstances` or `app.minInstances`, run `mup reconfig`.

The average cpu for the previous 5 minutes is used to trigger autoscaling. When the average is above 75%, it will be scaled up, and an average below 35% scales down.

## Enhanced Health

Enhanced health is enabled for your app. No metrics are configured to be stored in CloudWatch.

You can view the health by running `mup beanstalk status` or on the [AWS Console](https://console.aws.amazon.com/elasticbeanstalk/home).

## Logs

The log commands shows the last 100 lines. You can download a zip file with all of the logs from the [aws console](https://console.aws.amazon.com/elasticbeanstalk/home).

## Meteor and Node versions

This plugin supports meteor 1.2 or newer. It will automatically use the correct Node and npm version.

## Troubleshooting

- View the logs with `mup logs` or from the AWS Console
- View the environment events with `mup beanstalk events`
- Check the app and instance's health with `mup beanstalk health`
