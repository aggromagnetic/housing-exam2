/**
 * Housing Exam Hell - Smart Grader & Text Normalizer
 * Flexible Korean text matching, token cleaning, and subjective blank grading.
 */

export const Grader = {
    /**
     * Clean and normalize Korean text for flexible grading:
     * - Strips all whitespaces, periods, commas, quotes
     * - Normalizes hangul symbols (㉠, ㉡, etc.)
     * - Lowercases alphabets
     */
    normalizeText(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/[\s\t\r\n]+/g, '')
            .replace(/[.,·•ㆍ'"`~!?@#$%^&*()_+=\-\[\]{}|\\:;<>/\\]/g, '')
            .replace(/^[은는이가을를의에로으로]+|[은는이가을를의에로으로]+$/g, '')
            .toLowerCase()
            .trim();
    },

    /**
     * Check if user answer matches target answer allowing synonyms / variants
     */
    isMatch(userAnswer, targetAnswer) {
        const normUser = this.normalizeText(userAnswer);
        if (!normUser) return false;

        // Target answer might contain multiple acceptable variants separated by / or , or |
        const variants = String(targetAnswer).split(/[\/,|]/).map(v => this.normalizeText(v)).filter(Boolean);
        if (variants.length === 0) {
            variants.push(this.normalizeText(targetAnswer));
        }

        return variants.some(v => v === normUser || normUser.includes(v) || v.includes(normUser));
    },

    /**
     * Grade a single question (Choice or Subjective)
     * @param {Object} question
     * @param {number|Object} userResponse - Choice index (1-5) or Subjective map { "㉠": "답" }
     * @returns {Object} { isCorrect, details, correctSummary, userSummary }
     */
    grade(question, userResponse) {
        if (question.type === 'choice') {
            const userChoice = parseInt(userResponse, 10);
            const targetChoice = parseInt(question.answer, 10);
            const isCorrect = userChoice === targetChoice;

            return {
                isCorrect,
                userChoice,
                targetChoice,
                userSummary: userChoice ? `${userChoice}번` : '(미선택)',
                correctSummary: `${targetChoice}번`
            };
        } else {
            // Subjective / Short answer with blank keys: { "㉠": "...", "㉡": "..." }
            const targetAnswers = question.answers || {};
            const keys = Object.keys(targetAnswers);

            if (keys.length === 0) {
                return { isCorrect: false, details: {}, userSummary: '', correctSummary: '' };
            }

            const details = {};
            let allCorrect = true;
            const userParts = [];
            const correctParts = [];

            keys.forEach(k => {
                const userVal = (userResponse && userResponse[k]) ? String(userResponse[k]).trim() : '';
                const targetVal = targetAnswers[k] || '';
                const match = this.isMatch(userVal, targetVal);

                if (!match) allCorrect = false;

                details[k] = {
                    key: k,
                    user: userVal,
                    correct: targetVal,
                    isCorrect: match
                };

                userParts.push(`[${k}] ${userVal || '(공란)'}`);
                correctParts.push(`[${k}] ${targetVal}`);
            });

            return {
                isCorrect: allCorrect,
                details,
                userSummary: userParts.join(' | '),
                correctSummary: correctParts.join(' | ')
            };
        }
    }
};
