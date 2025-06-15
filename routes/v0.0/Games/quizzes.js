const express = require('express');
const bodyParser = require('body-parser');
const { generateQuizFromAI } = require('../../../services/quizAI');

module.exports = (db) => {
    const router = express.Router({ caseSensitive: true });

    router.use(bodyParser.urlencoded({ extended: false }));
    router.use(bodyParser.json());

    // 📌 GET /quizzes - All active quizzes
    router.get('/', async (req, res) => {
        try {
            const [quizzes] = await db.query(
                `SELECT id, title, description, category, xp_reward
                 FROM quizzes WHERE is_active = TRUE ORDER BY created_at DESC`
            );
            res.json({ success: true, quizzes });
        } catch (err) {
            console.error('GET /quizzes error:', err);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch quizzes',
            });
        }
    });

    // 📌 GET /quizzes/user/:user_id - Assigned quizzes only
    router.get('/user/:user_id', async (req, res) => {
        const userId = parseInt(req.params.user_id);
        if (isNaN(userId)) {
            return res
                .status(400)
                .json({ success: false, message: 'Invalid user ID' });
        }

        try {
            const [quizzes] = await db.query(
                `SELECT q.id, q.title, q.description, q.category, q.xp_reward
                 FROM user_assigned_quizzes uaq
                 JOIN quizzes q ON uaq.quiz_id = q.id
                 WHERE uaq.user_id = ? AND q.is_active = TRUE
                 ORDER BY q.created_at DESC`,
                [userId]
            );
            res.json({ success: true, quizzes });
        } catch (err) {
            console.error('GET /quizzes/user/:user_id error:', err);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch assigned quizzes',
            });
        }
    });

    // 📌 GET /quizzes/history/:user_id
    router.get('/history/:user_id', async (req, res) => {
        const userId = parseInt(req.params.user_id);
        if (isNaN(userId))
            return res
                .status(400)
                .json({ success: false, message: 'Invalid user ID' });

        try {
            const [history] = await db.query(
                `SELECT s.quiz_id, q.title, s.score, s.total_questions, s.submitted_at
                 FROM quiz_submissions s
                 JOIN quizzes q ON q.id = s.quiz_id
                 WHERE s.user_id = ?
                 ORDER BY s.submitted_at DESC`,
                [userId]
            );
            res.json({ success: true, history });
        } catch (err) {
            console.error('GET /quizzes/history error:', err);
            res.status(500).json({
                success: false,
                error: 'Failed to load history',
            });
        }
    });

    // 📌 GET /quizzes/:id/stats
    router.get('/:id/stats', async (req, res) => {
        const quizId = parseInt(req.params.id);
        if (isNaN(quizId))
            return res
                .status(400)
                .json({ success: false, message: 'Invalid quiz ID' });

        try {
            const [[stats]] = await db.query(
                `SELECT COUNT(*) AS total_attempts, MAX(score) AS highest_score,
                        ROUND(AVG(score), 2) AS average_score
                 FROM quiz_submissions WHERE quiz_id = ?`,
                [quizId]
            );
            res.json({ success: true, stats });
        } catch (err) {
            console.error('GET /quizzes/stats error:', err);
            res.status(500).json({
                success: false,
                error: 'Failed to load stats',
            });
        }
    });

    // 📌 GET /quizzes/:id - Quiz with questions + options
    router.get('/:id', async (req, res) => {
        const quizId = parseInt(req.params.id);
        if (isNaN(quizId))
            return res
                .status(400)
                .json({ success: false, message: 'Invalid quiz ID' });

        try {
            const [[quiz]] = await db.query(
                `SELECT * FROM quizzes WHERE id = ? AND is_active = TRUE LIMIT 1`,
                [quizId]
            );

            if (!quiz)
                return res
                    .status(404)
                    .json({ success: false, message: 'Quiz not found' });

            const [questions] = await db.query(
                `SELECT id, question, question_type FROM quiz_questions WHERE quiz_id = ?`,
                [quizId]
            );

            for (const q of questions) {
                const [options] = await db.query(
                    `SELECT id, option_text, is_correct FROM quiz_options WHERE question_id = ?`,
                    [q.id]
                );
                q.options = options;
            }

            res.json({ success: true, quiz: { ...quiz, questions } });
        } catch (err) {
            console.error('GET /quizzes/:id error:', err);
            res.status(500).json({
                success: false,
                error: 'Failed to load quiz',
            });
        }
    });

    // 📌 POST /quizzes/:id/submit - Submit quiz answers
    router.post('/:id/submit', async (req, res) => {
        const quizId = parseInt(req.params.id);
        const { user_id, answers } = req.body;

        if (!user_id || !Array.isArray(answers)) {
            return res.status(400).json({
                success: false,
                message: 'user_id and answers[] required',
            });
        }

        try {
            const [[quiz]] = await db.query(
                `SELECT xp_reward FROM quizzes WHERE id = ? AND is_active = TRUE LIMIT 1`,
                [quizId]
            );
            if (!quiz) {
                return res.status(404).json({
                    success: false,
                    message: 'Quiz not found',
                });
            }

            const [questions] = await db.query(
                `SELECT id FROM quiz_questions WHERE quiz_id = ?`,
                [quizId]
            );
            const totalQuestions = questions.length;
            let score = 0;

            for (const { question_id, selected_options } of answers) {
                if (
                    !Array.isArray(selected_options) ||
                    selected_options.length === 0
                ) {
                    continue; // Skip empty selections
                }

                const [correctOptions] = await db.query(
                    `SELECT option_text FROM quiz_options WHERE question_id = ? AND is_correct = TRUE`,
                    [question_id]
                );
                const correctSet = new Set(
                    correctOptions.map((o) => o.option_text)
                );
                const selectedSet = new Set(selected_options);

                const isCorrect =
                    correctSet.size === selectedSet.size &&
                    [...correctSet].every((opt) => selectedSet.has(opt));

                if (isCorrect) score++;
            }

            const perQuestionXP = Math.floor(
                (quiz.xp_reward || 50) / totalQuestions
            );
            const earnedXP = perQuestionXP * score;

            // Check existing submission
            const [existing] = await db.query(
                `SELECT score FROM quiz_submissions WHERE user_id = ? AND quiz_id = ?`,
                [user_id, quizId]
            );

            if (existing.length > 0) {
                const prevScore = existing[0].score;
                if (score > prevScore) {
                    const xpGain = (score - prevScore) * perQuestionXP;
                    await db.query(
                        `UPDATE quiz_submissions SET score = ?, total_questions = ?, submitted_at = CURRENT_TIMESTAMP WHERE user_id = ? AND quiz_id = ?`,
                        [score, totalQuestions, user_id, quizId]
                    );
                    await db.query(
                        `UPDATE user_levels SET xp = xp + ?, level = FLOOR(xp / 100) + 1 WHERE user_id = ?`,
                        [xpGain, user_id]
                    );
                    if (score === totalQuestions && totalQuestions > 0) {
                        const [[badge]] = await db.query(
                            `SELECT id FROM badges WHERE name = 'Quiz Whiz' LIMIT 1`
                        );
                        if (badge) {
                            await db.query(
                                `INSERT IGNORE INTO user_badges (user_id, badge_id) VALUES (?, ?)`,
                                [user_id, badge.id]
                            );
                        }
                    }
                    return res.json({
                        success: true,
                        message: 'Quiz updated with improved score',
                        score,
                        total: totalQuestions,
                        xp_earned: xpGain,
                    });
                } else {
                    return res.json({
                        success: true,
                        message:
                            'Quiz already completed. No higher score achieved.',
                        score: prevScore,
                        total: totalQuestions,
                        xp_earned: 0,
                    });
                }
            } else {
                // First-time submission
                await db.query(
                    `INSERT INTO quiz_submissions (user_id, quiz_id, score, total_questions) VALUES (?, ?, ?, ?)`,
                    [user_id, quizId, score, totalQuestions]
                );
                await db.query(
                    `INSERT INTO user_levels (user_id, xp, level)
                 VALUES (?, ?, FLOOR(? / 100) + 1)
                 ON DUPLICATE KEY UPDATE xp = xp + ?, level = FLOOR((xp + ?) / 100) + 1`,
                    [user_id, earnedXP, earnedXP, earnedXP, earnedXP]
                );
                if (score === totalQuestions && totalQuestions > 0) {
                    const [[badge]] = await db.query(
                        `SELECT id FROM badges WHERE name = 'Quiz Whiz' LIMIT 1`
                    );
                    if (badge) {
                        await db.query(
                            `INSERT IGNORE INTO user_badges (user_id, badge_id) VALUES (?, ?)`,
                            [user_id, badge.id]
                        );
                    }
                }
                return res.json({
                    success: true,
                    message: 'Quiz submitted',
                    score,
                    total: totalQuestions,
                    xp_earned: earnedXP,
                });
            }
        } catch (err) {
            console.error('POST /quizzes/:id/submit error:', err);
            res.status(500).json({
                success: false,
                error: 'Quiz submission failed',
            });
        }
    });

    // 📌 POST /quizzes/ai-generate
    router.post('/ai-generate', async (req, res) => {
        const { topic, difficulty = 'medium', chatId, createdBy } = req.body;
        if (!topic || !chatId || !createdBy) {
            return res
                .status(400)
                .json({ success: false, message: 'Missing required fields' });
        }

        try {
            const quizData = await generateQuizFromAI({ topic, difficulty });

            const [quizResult] = await db.query(
                `INSERT INTO quizzes (title, description, category, xp_reward)
                 VALUES (?, ?, ?, ?)`,
                [
                    quizData.title,
                    quizData.description,
                    quizData.category,
                    quizData.xp_reward || 50,
                ]
            );

            const quizId = quizResult.insertId;

            for (const question of quizData.questions) {
                const [qResult] = await db.query(
                    `INSERT INTO quiz_questions (quiz_id, question, question_type)
                     VALUES (?, ?, ?)`,
                    [
                        quizId,
                        question.question,
                        question.type || 'multiple_choice',
                    ]
                );
                const questionId = qResult.insertId;

                for (const option of question.options) {
                    await db.query(
                        `INSERT INTO quiz_options (question_id, option_text, is_correct)
                         VALUES (?, ?, ?)`,
                        [questionId, option.text, !!option.is_correct]
                    );
                }
            }

            const [members] = await db.query(
                `SELECT user_id FROM chat_members WHERE chat_id = ?`,
                [chatId]
            );

            for (const { user_id } of members) {
                await db.query(
                    `INSERT IGNORE INTO user_assigned_quizzes (user_id, quiz_id)
                     VALUES (?, ?)`,
                    [user_id, quizId]
                );
            }

            return res.json({
                success: true,
                quiz: { id: quizId },
                assigned_to: members.length,
            });
        } catch (err) {
            console.error('POST /ai-generate error:', err);
            res.status(500).json({
                success: false,
                error: 'Failed to generate quiz',
            });
        }
    });

    return router;
};
