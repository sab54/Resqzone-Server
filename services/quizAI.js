const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const Config = require('../../config');

const OPENAI_API_KEY = Config.OPENAI_API_KEY;
const datasetPath = path.join(__dirname, 'datasets', 'disaster-quizzes.json');

// List of defined topics
const disasterTopics = [
    'earthquake',
    'tsunami',
    'flood',
    'wildfire',
    'pandemic',
    'hurricane',
    'volcano',
    'emergency kit',
    'evacuation plan',
    'disaster preparedness',
    'fire safety',
    'cyberattack',
    'blackout',
    'theft',
    'asteroid',
];

// Step 2: Public API
module.exports = {
    generateQuizFromAI,
    expandDatasetWithAI,
};

// Step 3: Core
async function generateQuizFromAI({ topic, difficulty = 'medium' }) {
    // Try GPT
    if (OPENAI_API_KEY) {
        const quiz = await tryGenerateWithGPT(topic);
        if (quiz?.questions?.length) {
            saveToDataset(topic, quiz);
            return formatQuiz(quiz, difficulty);
        }
    }

    // Fallback to local
    return generateLocalQuiz(topic, difficulty);
}

// Step 4: Try GPT
async function tryGenerateWithGPT(topic) {
    try {
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${OPENAI_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'gpt-3.5-turbo',
                temperature: 0.7,
                messages: [
                    {
                        role: 'system',
                        content:
                            'You are a quiz generator for a disaster app. Respond only in raw JSON.',
                    },
                    {
                        role: 'user',
                        content: `Generate a multiple-choice quiz on "${topic}" with 5 questions, each with 4 options. Mark correct answers. Include title, description, category, XP reward, and difficulty label.`,
                    },
                ],
            }),
        });

        const data = await res.json();
        const text = data.choices?.[0]?.message?.content;
        return JSON.parse(text);
    } catch (e) {
        console.warn('GPT generation failed:', e.message);
        return null;
    }
}

// Step 5: Fallback to Local
function generateLocalQuiz(topic, difficulty) {
    const dataset = loadDataset();
    const fallback = dataset[topic.toLowerCase()];

    if (!fallback) {
        console.warn(`No data for "${topic}". Using random fallback.`);
        return mixedQuizFromDataset(topic, dataset);
    }

    return formatQuiz(fallback, difficulty);
}

// Step 6: Mixed fallback
function mixedQuizFromDataset(topic, dataset) {
    const allQuestions = Object.values(dataset).flatMap(
        (q) => q.questions || []
    );
    const questions = allQuestions.sort(() => 0.5 - Math.random()).slice(0, 5);

    return {
        title: `Mixed Quiz: ${topic}`,
        description: `Fallback quiz for "${topic}"`,
        category: 'Preparedness',
        xp_reward: 40,
        questions,
    };
}

// Step 7: Format quiz
function formatQuiz(raw, difficulty) {
    const questions =
        raw.questions?.filter((q) => q.difficulty === difficulty) ||
        raw.questions ||
        [];

    return {
        title: raw.title,
        description: raw.description,
        category: raw.category || 'Preparedness',
        xp_reward: raw.xp_reward || 50,
        questions: questions.slice(0, 5),
    };
}

// Step 8: Dataset management
function loadDataset() {
    try {
        return fs.existsSync(datasetPath)
            ? JSON.parse(fs.readFileSync(datasetPath, 'utf-8'))
            : {};
    } catch {
        return {};
    }
}

function saveToDataset(topic, quiz) {
    try {
        const key = topic.toLowerCase();
        const dataset = loadDataset();
        dataset[key] = quiz;
        fs.writeFileSync(datasetPath, JSON.stringify(dataset, null, 2));
        console.log(`Saved "${key}" to local dataset.`);
    } catch (e) {
        console.error('Failed to save dataset:', e.message);
    }
}

// Step 9: Expand all topics
async function expandDatasetWithAI() {
    const dataset = loadDataset();
    const allTopics = disasterTopics;

    for (const topic of allTopics) {
        const key = topic.toLowerCase();
        const existing = dataset[key];

        if (!existing || (existing?.questions?.length || 0) < 5) {
            console.log(`Generating quiz for "${topic}"...`);
            const quiz = await generateQuizFromAI({ topic });
            dataset[key] = quiz;
        } else {
            console.log(`Skipped "${topic}", already has data.`);
        }
    }

    fs.writeFileSync(datasetPath, JSON.stringify(dataset, null, 2));
    console.log('Dataset expansion complete.');
}
