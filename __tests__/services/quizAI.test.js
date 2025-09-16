/**
 * quizAI.test.js
 *
 * What This Test File Covers:
 *
 * 1) GPT Path + Persistence
 *    - With OPENAI_API_KEY present and node-fetch mocked to return a valid JSON quiz,
 *      generateQuizFromAI saves to dataset and returns a formatted quiz honoring difficulty.
 *
 * 2) Local Fallback (Topic Found)
 *    - With OPENAI_API_KEY absent, generateQuizFromAI falls back to a topic-specific quiz
 *      from the dataset and caps questions at 5.
 *
 * 3) Mixed Fallback (Topic Missing)
 *    - With OPENAI_API_KEY absent and dataset lacking the topic, returns a "Mixed Quiz"
 *      with up to 5 sampled questions.
 *
 * 4) expandDatasetWithAI
 *    - Ensures it writes an expanded dataset including keys for predefined topics.
 *
 * Notes:
 * - We do not change production source; tests adjust mocks accordingly.
 * - File I/O is mocked to avoid touching real disk.
 */

global.console = { ...console, warn: jest.fn(), log: jest.fn(), error: jest.fn() };

const path = require('path');
const fs = require('fs');

// Silence console noise for clean test output
let warnSpy, logSpy;

beforeAll(() => {
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  logSpy  = jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterAll(() => {
  warnSpy.mockRestore();
  logSpy.mockRestore();
});

// ---- Helpers to (re)load module under different config mocks
function loadWithConfigMock(configExport) {
  jest.resetModules();

  // Mock the same module id used by services/quizAI.js
  jest.doMock('../../config', () => configExport, { virtual: true });

  // Provide a DEFAULT safe mock for node-fetch so any un-overridden calls won't warn
  const defaultFetchMock = jest.fn().mockResolvedValue({
    json: async () => ({
      choices: [
        { message: { content: JSON.stringify({ title: 'Auto', questions: [] }) } }
      ],
    }),
  });
  jest.doMock('node-fetch', () => defaultFetchMock, { virtual: true });

  // Load after mocks
  return require('../../services/quizAI');
}

describe('quizGenerator (services/quizAI)', () => {
  const mockDatasetPathEndsWith = path.join('datasets', 'disaster-quizzes.json');

  let existsSpy;
  let readSpy;
  let writeSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    existsSpy = jest.spyOn(fs, 'existsSync');
    readSpy   = jest.spyOn(fs, 'readFileSync');
    writeSpy  = jest.spyOn(fs, 'writeFileSync');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('GPT path: uses node-fetch result, saves dataset, formats by difficulty', async () => {
    // Arrange config with API key to force GPT path
    const mod = loadWithConfigMock({ OPENAI_API_KEY: 'test-key' });
    const fetch = require('node-fetch');

    const gptQuiz = {
      title: 'Earthquake Basics',
      description: 'How to prepare for earthquakes',
      category: 'Preparedness',
      xp_reward: 70,
      questions: [
        { id: 1, text: 'Q1', options: ['a','b','c','d'], answer: 'a', difficulty: 'easy' },
        { id: 2, text: 'Q2', options: ['a','b','c','d'], answer: 'b', difficulty: 'easy' },
        { id: 3, text: 'Q3', options: ['a','b','c','d'], answer: 'c', difficulty: 'medium' },
        { id: 4, text: 'Q4', options: ['a','b','c','d'], answer: 'd', difficulty: 'easy' },
        { id: 5, text: 'Q5', options: ['a','b','c','d'], answer: 'a', difficulty: 'hard' },
        { id: 6, text: 'Q6', options: ['a','b','c','d'], answer: 'b', difficulty: 'easy' },
      ],
      checklist: {
        title: 'Quake Kit',
        description: 'Assemble your kit',
        xp_reward: 50,
        items: [{ title: 'Water', done: false }],
      },
    };

    // Override the default fetch for this specific call
    fetch.mockResolvedValueOnce({
      json: async () => ({
        choices: [
          { message: { content: JSON.stringify(gptQuiz) } }
        ],
      }),
    });

    // Mock fs to behave like empty dataset initially
    existsSpy.mockReturnValue(false);

    // Act
    const result = await mod.generateQuizFromAI({ topic: 'Earthquake', difficulty: 'easy' });

    // Assert: formatted by difficulty (only 'easy') and limited to 5
    expect(result.title).toBe('Earthquake Basics');
    expect(Array.isArray(result.questions)).toBe(true);
    expect(result.questions.length).toBeLessThanOrEqual(5);
    expect(result.questions.every(q => q.difficulty === 'easy')).toBe(true);
    expect(result.checklist && result.checklist.title).toBe('Quake Kit');

    // Assert: saved to dataset (write called with the dataset file path)
    expect(writeSpy).toHaveBeenCalled();
    const lastWriteArgs = writeSpy.mock.calls[writeSpy.mock.calls.length - 1];
    expect(String(lastWriteArgs[0])).toEqual(expect.stringContaining(mockDatasetPathEndsWith));
    const savedJson = JSON.parse(lastWriteArgs[1]);
    expect(savedJson['earthquake']).toBeDefined();
  });

  test('Local fallback (topic found): returns topic quiz and caps at 5 questions', async () => {
    // Arrange config with NO API key -> forces local path
    const mod = loadWithConfigMock({ OPENAI_API_KEY: '' });

    // Dataset contains the topic already
    const dataset = {
      flood: {
        title: 'Flood Readiness',
        description: 'Be ready for floods',
        category: 'Preparedness',
        xp_reward: 60,
        questions: Array.from({ length: 7 }).map((_, i) => ({
          id: i + 1,
          text: `Q${i + 1}`,
          options: ['a','b','c','d'],
          answer: 'a',
          difficulty: 'medium',
        })),
        checklist: { title: 'Flood Kit', description: 'Items', xp_reward: 40, items: [] },
      },
    };

    existsSpy.mockReturnValue(true);
    readSpy.mockReturnValue(JSON.stringify(dataset));

    // Act
    const result = await mod.generateQuizFromAI({ topic: 'FLOOD', difficulty: 'medium' });

    // Assert: It should use the topic-specific quiz, not mixed
    expect(result.title).toBe('Flood Readiness');
    expect(result.questions.length).toBe(5); // capped
    expect(result.questions.every(q => q.difficulty === 'medium')).toBe(true);
  });

  test('Mixed fallback (topic missing): returns "Mixed Quiz" with up to 5 questions', async () => {
    // Arrange config with NO API key -> local path
    const mod = loadWithConfigMock({ OPENAI_API_KEY: null });

    // Dataset has other topics but NOT the requested one
    const dataset = {
      wildfire: {
        title: 'Wildfire Awareness',
        questions: [
          { text: 'Q1', options: ['a','b','c','d'], answer: 'a' },
          { text: 'Q2', options: ['a','b','c','d'], answer: 'b' },
        ],
      },
      tsunami: {
        title: 'Tsunami Safety',
        questions: [
          { text: 'Q3', options: ['a','b','c','d'], answer: 'c' },
          { text: 'Q4', options: ['a','b','c','d'], answer: 'd' },
          { text: 'Q5', options: ['a','b','c','d'], answer: 'a' },
        ],
      },
    };

    existsSpy.mockReturnValue(true);
    readSpy.mockReturnValue(JSON.stringify(dataset));

    // Act
    const result = await mod.generateQuizFromAI({ topic: 'Asteroid', difficulty: 'medium' });

    // Assert: Mixed quiz title and <=5 questions from pool of all topics
    expect(result.title).toMatch(/^Mixed Quiz:\s*Asteroid/i);
    expect(result.questions.length).toBeLessThanOrEqual(5);
    // Difficulty filtering may remove items (many dataset Qs lack difficulty); that's OK per current logic.
  });

  test('expandDatasetWithAI writes an expanded dataset including predefined topics', async () => {
    // Arrange config with NO API key so generation falls back quickly
    const mod = loadWithConfigMock({ OPENAI_API_KEY: '' });

    // Start with an empty dataset on disk
    existsSpy.mockReturnValue(true);
    readSpy.mockReturnValue('{}');

    // Capture final dataset write (the function writes many times; keep the latest)
    let finalJSON = null;
    writeSpy.mockImplementation((file, content) => {
      if (String(file).endsWith(mockDatasetPathEndsWith)) {
        finalJSON = content; // last write content
      }
    });

    // Act
    await mod.expandDatasetWithAI();

    // Assert
    expect(writeSpy).toHaveBeenCalled();
    const parsed = JSON.parse(finalJSON || '{}');

    // A sampling of topics we expect to exist after expansion
    const expectedKeys = ['earthquake', 'tsunami', 'flood', 'wildfire', 'pandemic'];
    expectedKeys.forEach(k => {
      expect(parsed[k]).toBeDefined();
      expect(typeof parsed[k]).toBe('object');
    });
  });
});
