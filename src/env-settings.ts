import shellEscape from 'shell-escape';
import { MeteorSettings, Env } from "./types";

export function createEnvFile(
  env: Env,
  settings: MeteorSettings
) {
  let content = '';
  const settingsString = encodeURIComponent(JSON.stringify(settings));

  Object.keys(env).forEach((key) => {
    const value = shellEscape([env[key]]);
    content += `export ${key}=${value}\n`;
  });

  content += `export METEOR_SETTINGS_ENCODED=${shellEscape([settingsString])}`;
  return content
}
