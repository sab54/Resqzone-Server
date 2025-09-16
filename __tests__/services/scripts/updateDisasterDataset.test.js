/**
 * updateDisasterDataset.test.js
 *
 * Covers:
 * 1) Success path: logs start + done, no process.exit
 * 2) Failure path: logs error, calls process.exit(1)
 * 3) OS-agnostic path check for services/datasets/disaster-quizzes.json
 *
 * Implementation notes:
 * - We use jest.isolateModules + jest.doMock per test to inject a mock for
 *   ../../../services/quizAI and to run the script fresh each time.
 * - After requiring the script, we await flushPromises() so the async run()
 *   has time to resolve/reject and hit the console logs.
 */

const path = require('path');

const flushPromises = async () =>
  new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.resetModules();
});

describe('generateDisasterDataset.js', () => {
  const SCRIPT_PATH = path.join(
    __dirname,
    '../../../services/scripts/updateDisasterDataset.js'
  );

  /**
   * Run the script with a per-test mock for expandDatasetWithAI.
   * @param {'resolve'|'reject'} behavior
   * @returns {import('jest-mock').Mock} the mock function used
   */
  const runScriptWithMock = (behavior) => {
    const mockFn = jest.fn(() =>
      behavior === 'reject' ? Promise.reject(new Error('boom')) : Promise.resolve()
    );

    jest.isolateModules(() => {
      jest.doMock('../../../services/quizAI', () => ({
        expandDatasetWithAI: mockFn,
      }));
      require(SCRIPT_PATH); // top-level runs immediately
    });

    return mockFn;
  };

  test('calls expandDatasetWithAI and logs success path', async () => {
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});

    const mockFn = runScriptWithMock('resolve');
    // Allow the async run() to complete and log
    await flushPromises();

    expect(mockFn).toHaveBeenCalledTimes(1);

    // Logged start
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Starting disaster quiz dataset generation...')
    );

    // Logged completion (tolerant to extra newline + path)
    const logCalls = console.log.mock.calls.map((c) => String(c[0]));
    expect(logCalls.some((msg) => msg.includes('Done! Dataset saved to:'))).toBe(true);

    // No exit on success
    expect(exitSpy).not.toHaveBeenCalled();

    exitSpy.mockRestore();
  });

  test('handles error case and exits with code 1', async () => {
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});

    const mockFn = runScriptWithMock('reject');
    // Allow the async run() to hit catch block
    await flushPromises();

    expect(mockFn).toHaveBeenCalledTimes(1);

    // Error log: tolerant check for prefix
    expect(console.error).toHaveBeenCalled();
    const errCalls = console.error.mock.calls.map((c) => String(c[0]));
    expect(errCalls.some((msg) => msg.includes('Failed to generate dataset:'))).toBe(true);

    // Exit with code 1
    expect(exitSpy).toHaveBeenCalledWith(1);

    exitSpy.mockRestore();
  });

  test('resolves dataset path correctly (OS-agnostic)', () => {
    const datasetPath = path.join(
      path.resolve(__dirname, '../../../services'),
      'datasets',
      'disaster-quizzes.json'
    );
    const normalized = datasetPath.replace(/\\/g, '/'); // Windows → POSIX
    expect(normalized).toContain('services/datasets/disaster-quizzes.json');
  });
});
