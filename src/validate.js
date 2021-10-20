import Joi from 'joi';

const schema = Joi.object().keys({
  name: Joi.string().min(1).required(),
  path: Joi.string().min(1).required(),
  type: Joi.string().required(),
  envName: Joi.string().min(1),
  buildOptions: Joi.object().keys({
    serverOnly: Joi.bool(),
    debug: Joi.bool(),
    buildLocation: Joi.string(),
    mobileSettings: Joi.object(),
    server: Joi.string().uri(),
    allowIncompatibleUpdates: Joi.boolean(),
    executable: Joi.string()
  }),
  // The meteor plugin adds the docker object, which is a bug in mup
  docker: Joi.object(),
  env: Joi.object(),
  auth: Joi.object().keys({
    id: Joi.string().required(),
    secret: Joi.string().required()
  }).required(),
  sslDomains: Joi.array().items(Joi.string()),
  forceSSL: Joi.bool(),
  region: Joi.string(),
  minInstances: Joi.number().min(1).required(),
  maxInstances: Joi.number().min(1),
  instanceType: Joi.string(),
  gracefulShutdown: Joi.bool(),
  longEnvVars: Joi.bool(),
  yumPackages: Joi.object().pattern(
    /[/s/S]*/,
    [Joi.string().allow('')]
  ),
  oldVersions: Joi.number(),
  customBeanstalkConfig: Joi.array().items(Joi.object({
    namespace: Joi.string().trim().required(),
    option: Joi.string().trim().required(),
    value: Joi.string().trim().required()
  })),
  sshKey: {
    privateKey: Joi.string().required(),
    publicKey: Joi.string().required()
  }
});

export default function validator(config, utils) {
  let details = [];
  details = utils.combineErrorDetails(
    details,
    schema.validate(config.app, utils.VALIDATE_OPTIONS)
  );
  if (config.app?.name?.length < 4) {
    details.push({
      message: 'must have at least 4 characters',
      path: 'name'
    });
  }

  return utils.addLocation(details, 'app');
}
