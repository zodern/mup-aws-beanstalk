import joi from 'joi';

const schema = joi.object().keys({
  name: joi.string().min(1).required(),
  path: joi.string().min(1).required(),
  type: joi.string().required(),
  enableUploadProgressBar: joi.bool(),
  buildOptions: joi.object().keys({
    serverOnly: joi.bool(),
    debug: joi.bool(),
    buildLocation: joi.bool(),
    mobileSettings: joi.object(),
    server: joi.string().uri(),
    allowIncompatibleUpdates: joi.boolean(),
    executable: joi.string()
  })
});

export default function (config, utils) {
  let details = [];
  details = utils.combineErrorDetails(
    details,
    joi.validate(config.app, schema, utils.VALIDATE_OPTIONS)
  );
  if (config.app && config.app.name && config.app.name.length < 4) {
    details.push({
      message: 'must have at least 4 characters',
      path: 'name'
    });
  }

  return utils.addLocation(details, 'app');
}
