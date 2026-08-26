/**
 * Housing Exam Hell - Smart Grader & Text Normalizer
 * Flexible Korean text matching, token cleaning, and subjective blank grading.
 */

export const Grader = {
    parseFraction(str) {
        if (!str) return null;
        const clean = String(str).replace(/[\s\(\)\[\]]/g, '').trim();
        const hangulMatch = clean.match(/^(\d+)분의(\d+)$/);
        if (hangulMatch) {
            return { num: parseInt(hangulMatch[2], 10), den: parseInt(hangulMatch[1], 10) };
        }
        const slashMatch = clean.match(/^(\d+)\/(\d+)$/);
        if (slashMatch) {
            return { num: parseInt(slashMatch[1], 10), den: parseInt(slashMatch[2], 10) };
        }
        return null;
    },

    normalizeText(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/[\s\t\r\n]+/g, '')
            .replace(/[.,·•ㆍ'"`~!?@#$%^&*()_+=\-\[\]{}|\\:;<>/\\]/g, '')
            .replace(/^[은는이가을를의에로으로]+|[은는이가을를의에로으로]+$/g, '')
            .toLowerCase()
            .trim();
    },

    getAnswerVariants(targetStr) {
        if (!targetStr) return [];
        const parts = String(targetStr).split(/[,|]|\b또는\b/).map(s => s.trim()).filter(Boolean);
        const variants = [];

        parts.forEach(part => {
            const frac = this.parseFraction(part);
            if (frac) {
                variants.push(`${frac.num}/${frac.den}`);
                variants.push(`${frac.den}분의${frac.num}`);
            } else {
                if (part.includes('/') && !part.match(/\d+\/\d+/)) {
                    part.split('/').forEach(sub => {
                        const norm = this.normalizeText(sub);
                        if (norm) variants.push(norm);
                    });
                } else {
                    const norm = this.normalizeText(part);
                    if (norm) variants.push(norm);
                }
            }
        });

        return Array.from(new Set(variants));
    },

    isMatch(userAnswer, targetAnswer) {
        if (!userAnswer || !targetAnswer) return false;

        const userFrac = this.parseFraction(userAnswer);
        const targetVariants = this.getAnswerVariants(targetAnswer);
        const isTargetFraction = targetVariants.some(v => this.parseFraction(v) !== null);

        if (userFrac) {
            const userFracKey = `${userFrac.num}/${userFrac.den}`;
            return targetVariants.some(v => {
                const targetFrac = this.parseFraction(v);
                if (targetFrac) {
                    return userFrac.num === targetFrac.num && userFrac.den === targetFrac.den;
                }
                return v === userFracKey || v === `${userFrac.den}분의${userFrac.num}`;
            });
        }

        if (isTargetFraction && !userFrac) {
            return false;
        }

        const normUser = this.normalizeText(userAnswer);
        if (!normUser) return false;

        const isUserNum = /^\d+$/.test(normUser);

        return targetVariants.some(targetVar => {
            const normTarget = this.normalizeText(targetVar);
            const isTargetNum = /^\d+$/.test(normTarget);

            if (isUserNum || isTargetNum) {
                return normUser === normTarget;
            }

            if (normUser === normTarget) return true;

            if (normTarget.length >= 4 && normUser.length >= 4) {
                if (normTarget.includes(normUser) || normUser.includes(normTarget)) {
                    const minLen = Math.min(normUser.length, normTarget.length);
                    const maxLen = Math.max(normUser.length, normTarget.length);
                    if (minLen / maxLen >= 0.75) return true;
                }
            }

            return false;
        });
    },

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
