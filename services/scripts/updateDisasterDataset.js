const path = require('path');
const fs = require('fs');
const { expandDatasetWithAI } = require('../quizAI');

async function run() {
    const datasetPath = path.join(
        __dirname,
        '../quizAI/datasets/disaster-quizzes.json'
    );

    console.log('Starting disaster quiz dataset generation...');
    try {
        await expandDatasetWithAI();
        console.log(`Done! Dataset saved to:\n${datasetPath}`);
    } catch (err) {
        console.error('Failed to generate dataset:', err);
        process.exit(1);
    }
}
run();
