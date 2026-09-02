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
        const slashMatch = clean.match(/^(\d{1,2})\/(\d{1,3})$/);
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
            .replace(/(?:만원|천원|백만원|억원|천|만|백|원|년|월|일|개월|인|명|회|퍼센트|%|점)$/, '')
            .toLowerCase()
            .trim();
    },

    expandNumberSynonyms(rawStr) {
        if (!rawStr) return [];
        const clean = String(rawStr).replace(/[\s,]/g, '');
        const results = [clean];

        const chunMatch = clean.match(/^(\d+)천$/);
        if (chunMatch) results.push(String(parseInt(chunMatch[1], 10) * 1000));
        const numChunMatch = clean.match(/^(\d+)000$/);
        if (numChunMatch) results.push(numChunMatch[1] + '천');

        const manMatch = clean.match(/^(\d+)만$/);
        if (manMatch) results.push(String(parseInt(manMatch[1], 10) * 10000));
        const numManMatch = clean.match(/^(\d+)0000$/);
        if (numManMatch) results.push(numManMatch[1] + '만');

        const baekMatch = clean.match(/^(\d+)백$/);
        if (baekMatch) results.push(String(parseInt(baekMatch[1], 10) * 100));
        const numBaekMatch = clean.match(/^(\d+)00$/);
        if (numBaekMatch) results.push(numBaekMatch[1] + '백');

        return Array.from(new Set(results));
    },

    getAnswerVariants(targetStr) {
        if (!targetStr) return [];
        let splitParts = [];
        const rawParts = String(targetStr).split(/[|]|\b또는\b|\b혹은\b/).map(s => s.trim()).filter(Boolean);
        
        rawParts.forEach(rp => {
            const frac = this.parseFraction(rp);
            if (frac) {
                splitParts.push(rp);
            } else if (rp.includes('/')) {
                rp.split('/').map(s => s.trim()).filter(Boolean).forEach(sub => splitParts.push(sub));
            } else {
                splitParts.push(rp);
            }
        });

        const variants = [];

        splitParts.forEach(part => {
            const frac = this.parseFraction(part);
            if (frac) {
                variants.push(`${frac.num}/${frac.den}`);
                variants.push(`${frac.den}분의${frac.num}`);
            } else {
                const expansions = this.expandNumberSynonyms(part);
                expansions.forEach(exp => {
                    const norm = this.normalizeText(exp);
                    if (norm) variants.push(norm);
                    variants.push(exp);
                });
            }
        });

        return Array.from(new Set(variants));
    },

    isMatch(userAnswer, targetAnswer) {
        if (!userAnswer || !targetAnswer) return false;

        const userFrac = this.parseFraction(userAnswer);
        const targetVariants = this.getAnswerVariants(targetAnswer);

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

        const userExpansions = this.expandNumberSynonyms(userAnswer);
        const userNorms = userExpansions.map(u => this.normalizeText(u)).concat(userExpansions);

        return targetVariants.some(targetVar => {
            const normTarget = this.normalizeText(targetVar);
            const isTargetNum = /^\d+$/.test(normTarget);

            return userNorms.some(uNorm => {
                const normUser = this.normalizeText(uNorm);
                const isUserNum = /^\d+$/.test(normUser);

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
