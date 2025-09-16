// services/scripts/generateDisasterDataset.js
/**
 * generateDisasterDataset.js
 *
 * This script is a **standalone runner** that triggers expansion of the
 * disaster quiz dataset using the AI-powered quiz generator in `quizAI.js`.
 *
 * Key functionalities:
 * - **Dataset Expansion**: Calls `expandDatasetWithAI()` which augments the
 *   existing quiz dataset with additional generated content.
 * - **File Path Resolution**: Dynamically resolves the dataset JSON file path
 *   (`quizAI/datasets/disaster-quizzes.json`) relative to the project root.
 * - **Execution Flow**:
 *    1. Logs start message for dataset generation.
 *    2. Invokes AI expansion logic.
 *    3. On success: logs confirmation + dataset save path.
 *    4. On error: prints failure message and exits process with code `1`.
 *
 * Notes:
 * - Intended to be run as a **manual utility** (e.g., via `node` or an npm script).
 * - Uses `process.exit(1)` to signal failure in CI/CD or automated environments.
 *
 * Author: Sunidhi Abhange
 */

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
