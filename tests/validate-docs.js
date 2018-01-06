/* eslint-disable no-var, vars-on-top */

var codeBlocks = require('gfm-code-blocks');
var fs = require('fs');
var path = require('path');
var sh = require('shelljs');

var tmpPath = path.resolve(__dirname, './validate-tmp');
var tmpConfig = path.resolve(__dirname, './validate-tmp/mup.js');

var validConfigs = [];

var pluginPath = path.resolve(__dirname, '../');
var mupPath = path.resolve(__dirname, '../node_modules/.bin/mup');

[
  path.resolve(__dirname, '../docs/index.md'),
  path.resolve(__dirname, '../docs/getting-started.md')
].forEach((filePath) => {
  var contents = fs.readFileSync(filePath).toString('utf8');
  var blocks = codeBlocks(contents);

  blocks.forEach((block) => {
    if (block.lang === 'js') {
      validConfigs.push(block);
    }
  });
});

try {
  if (!fs.existsSync(tmpPath)) {
    fs.mkdirSync(tmpPath);
  }
} catch (e) {
  console.log(e);
}

var failed = 0;
var success = 0;

validConfigs.forEach((config) => {
  fs.writeFileSync(tmpConfig, config.code);
  delete require.cache[require.resolve(tmpConfig)];
  var configObject = require(tmpConfig); // eslint-disable-line

  configObject.plugins = [pluginPath];
  configObject.app.auth = configObject.app.auth || {
    id: 'id',
    secret: 'secret'
  };

  fs.writeFileSync(tmpConfig, `module.exports = ${JSON.stringify(configObject)}`);
  sh.cd(tmpPath);
  var out = sh.exec(`${mupPath} validate`);

  if (out.code > 0) {
    console.dir(configObject);
    console.log(`Example starts at character ${config.start}`);
    failed += 1;
  } else {
    success += 1;
  }
});

console.log(`${success}/${success + failed} configs are valid`);

if (failed > 0) {
  process.exitCode = 1;
}
