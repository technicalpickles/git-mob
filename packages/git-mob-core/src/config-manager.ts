const config: Record<string, string | undefined> = {
  processCwd: undefined,
  gitConfigFile: undefined,
};

export function getConfig(prop: string) {
  const value = config[prop];
  // Check environment variable as fallback for gitConfigFile
  if (value === undefined && prop === 'gitConfigFile') {
    return process.env.GITMOB_CONFIG_FILE;
  }
  return value;
}

export function updateConfig(prop: string, value: string | undefined) {
  if (prop in config) {
    config[prop] = value;
  } else {
    throw new Error(`Invalid Git Mob Core config property "${prop}"`);
  }
}
