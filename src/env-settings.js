import shellEscape from 'shell-escape';

export default function createEnvFile(env, settings) {
  let content = '';
  const settingsString = encodeURIComponent(JSON.stringify(settings));

  Object.keys(env).forEach((key) => {
    const value = shellEscape([env[key]]);
    content += `export ${key}=${value}\n`;
  });

  content += `export METEOR_SETTINGS_ENCODED=${shellEscape([settingsString])}`;
  return content;
}
