import { getConfig, updateConfig } from './config-manager.js';

describe('config-manager', () => {
  afterEach(() => {
    // Clean up config after each test
    updateConfig('processCwd', undefined);
    updateConfig('gitConfigFile', undefined);
    delete process.env.GITMOB_CONFIG_FILE;
  });

  it('change the processCwd config property', () => {
    expect(getConfig('processCwd')).toBeUndefined();
    const dir = 'C:/path/dir';
    updateConfig('processCwd', dir);
    expect(getConfig('processCwd')).toBe(dir);
  });

  it('throw error for invalid config property', () => {
    const dir = 'C:/path/dir';

    expect(() => {
      updateConfig('cwd', dir);
    }).toThrow(
      expect.objectContaining({
        message: expect.stringMatching(
          'Invalid Git Mob Core config property "cwd"'
        ) as string,
      }) as Error
    );
  });

  it('should store and retrieve gitConfigFile config property', () => {
    expect(getConfig('gitConfigFile')).toBeUndefined();
    const path = '/path/to/git-mob-config';
    updateConfig('gitConfigFile', path);
    expect(getConfig('gitConfigFile')).toBe(path);
  });

  it('should return GITMOB_CONFIG_FILE env var as fallback', () => {
    process.env.GITMOB_CONFIG_FILE = '/env/path/config';
    expect(getConfig('gitConfigFile')).toBe('/env/path/config');
  });

  it('should prefer programmatic config over env var', () => {
    process.env.GITMOB_CONFIG_FILE = '/env/path/config';
    updateConfig('gitConfigFile', '/programmatic/path');
    expect(getConfig('gitConfigFile')).toBe('/programmatic/path');
  });

  it('should allow clearing gitConfigFile by setting to undefined', () => {
    updateConfig('gitConfigFile', '/some/path');
    expect(getConfig('gitConfigFile')).toBe('/some/path');
    updateConfig('gitConfigFile', undefined);
    expect(getConfig('gitConfigFile')).toBeUndefined();
  });
});
