// Keep tests deterministic and quiet
/**
 * Test Configuration (testSetup.js)
 *
 * This file configures the testing environment for the application, ensuring that tests 
 * are deterministic (i.e., produce consistent results) and quiet (i.e., suppress unnecessary output).
 * 
 * Features:
 * - Sets the environment to `test` to ensure the application behaves in a test-friendly manner.
 * - Increases the default Jest timeout to 30 seconds for longer-running tests.
 * - Mocks `console.log` and `console.error` to suppress output during test execution.
 * 
 * Key Functionality:
 * - `beforeAll`: Sets up test configuration before tests run, including mocking `console.log` 
 *   and `console.error` to prevent console output during tests.
 * - `afterAll`: Restores the original behavior of `console.log` and `console.error` after tests are complete.
 * 
 * Dependencies:
 * - jest: Testing framework used for writing and running tests.
 * 
 * Author: Sunidhi Abhange
 */

process.env.NODE_ENV = 'test';
jest.setTimeout(30000);

beforeAll(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterAll(() => {
  console.warn.mockRestore?.();
  console.log.mockRestore?.();
  console.error.mockRestore?.();
});
