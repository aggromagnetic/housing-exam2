/**
 * Housing Exam Hell - Exam Engine
 * Generates test sets based on 5-year real exam ratios, weighted spaced repetition sampling,
 * anti-clumping filters, infinite hell-mode generator, and part-by-part full readings.
 */

export const ExamEngine = {
    /**
     * Get the master raw dataset from window.HOUSING_EXAM_BANK
     */
    getBank() {
        return window.HOUSING_EXAM_BANK || null;
    },

    /**
     * Get all questions for a subject and type with a unified key
     */
    getQuestionPool(subject, type) {
        const bank = this.getBank();
        if (!bank || !bank.datasets) return [];

        const key = subject === '관리실무' 
            ? (type === 'choice' ? 'gwanri_mc' : 'gwanri_sa')
            : (type === 'choice' ? 'law_mc' : 'law_sa');

        const dataset = bank.datasets[key];
        if (!dataset || !Array.isArray(dataset.chapters)) return [];

        const pool = [];
        dataset.chapters.forEach(chap => {
            (chap.questions || []).forEach(q => {
                pool.push({
                    ...q,
                    qKey: `${subject}_${type}_${chap.chapter}_${q.id}`,
                    subject,
                    type,
                    chapterName: chap.chapter,
                    sourceFile: chap.source_file || ''
                });
            });
        });

        return pool;
    },

    /**
     * Weighted random selection (Roulette Wheel)
     * Probability of question i: P_i = W_i / sum(W_k)
     */
    weightedPick(items, statsMap, count, excludeKeysSet = new Set()) {
        const available = items.filter(it => !excludeKeysSet.has(it.qKey));
        if (available.length <= count) return available;

        const weights = available.map(it => {
            const stat = statsMap[it.qKey];
            return stat && stat.weight ? stat.weight : 1;
        });

        const selected = [];
        const pickedIndices = new Set();

        for (let step = 0; step < count; step++) {
            let totalWeight = 0;
            for (let i = 0; i < available.length; i++) {
                if (!pickedIndices.has(i)) totalWeight += weights[i];
            }

            if (totalWeight <= 0) break;

            let rnd = Math.random() * totalWeight;
            let current = 0;
            let chosenIdx = -1;

            for (let i = 0; i < available.length; i++) {
                if (pickedIndices.has(i)) continue;
                current += weights[i];
                if (rnd <= current) {
                    chosenIdx = i;
                    break;
                }
            }

            if (chosenIdx !== -1) {
                pickedIndices.add(chosenIdx);
                selected.push(available[chosenIdx]);
            }
        }

        return selected;
    },

    /**
     * 5-Year Exam Blueprint Allocation Table
     */
    getBlueprint(subject) {
        if (subject === '관리실무') {
            return [
                { pattern: /01.*주택의.*정의/, mc: 1, sa: 0, randomSwap: true },
                { pattern: /02.*총칙/, mc: 1, sa: 0, randomSwap: true },
                { pattern: /03.*관리방법/, mc: 2, sa: 1 },
                { pattern: /04.*관리조직/, mc: 2, sa: 2 },
                { pattern: /05.*주택관리사/, mc: 1, sa: 0, randomSwap: true },
                { pattern: /07.*입주자관리/, mc: 1, sa: 0, randomSwap: true },
                { pattern: /08.*사무.*인사/, mc: 4, sa: 3 },
                { pattern: /09.*대외업무.*리모델링/, mc: 1, sa: 0, randomSwap: true },
                { pattern: /11.*회계관리/, mc: 1, sa: 0, randomSwap: true },
                { pattern: /12.*시설관리/, mc: 10, sa: 6 },
                { pattern: /13.*안전관리|14.*환경관리/, mc: 3, sa: 3 }
            ];
        } else {
            // 관계법규 (총 14개 법률)
            return [
                { pattern: /01.*주택법/, mc: 5, sa: 3 },
                { pattern: /02.*공동주택관리법|2-1|2-2/, mc: 5, sa: 3 },
                { pattern: /03.*민간임대주택/, mc: 1, sa: 1 },
                { pattern: /04.*공공주택/, mc: 1, sa: 1 },
                { pattern: /05.*건축법/, mc: 4, sa: 3 },
                { pattern: /06.*도시.*주거환경정비/, mc: 1, sa: 1 },
                { pattern: /07.*도시재정비/, mc: 1, sa: 0, randomSwap: true },
                { pattern: /08.*시설물의.*안전/, mc: 1, sa: 1 },
                { pattern: /09.*소방기본법/, mc: 1, sa: 0, randomSwap: true },
                { pattern: /10.*화재의.*예방/, mc: 1, sa: 0, randomSwap: true },
                { pattern: /11.*소방시설/, mc: 1, sa: 0, randomSwap: true },
                { pattern: /12.*전기사업법/, mc: 1, sa: 1 },
                { pattern: /13.*승강기/, mc: 1, sa: 1 },
                { pattern: /14.*집합건물/, mc: 1, sa: 0, randomSwap: true }
            ];
        }
    },

    /**
     * Generate 40-question Exam (24 MC + 16 Subjective)
     */
    generateExamSet(subject, statsMap = {}, excludeKeysSet = new Set()) {
        const mcPool = this.getQuestionPool(subject, 'choice');
        const saPool = this.getQuestionPool(subject, 'short');
        const blueprint = this.getBlueprint(subject);

        const selectedMC = [];
        const selectedSA = [];

        blueprint.forEach(rule => {
            let targetMc = rule.mc;
            let targetSa = rule.sa;

            // Handle random type swap for single item slots (e.g. 1 question can be MC or SA)
            if (rule.randomSwap && (targetMc + targetSa === 1)) {
                if (Math.random() < 0.5) {
                    targetMc = 0;
                    targetSa = 1;
                } else {
                    targetMc = 1;
                    targetSa = 0;
                }
            }

            const chapterMcList = mcPool.filter(q => rule.pattern.test(q.chapterName));
            const chapterSaList = saPool.filter(q => rule.pattern.test(q.chapterName));

            if (targetMc > 0) {
                const picked = this.weightedPick(chapterMcList, statsMap, targetMc, excludeKeysSet);
                selectedMC.push(...picked);
            }
            if (targetSa > 0) {
                const picked = this.weightedPick(chapterSaList, statsMap, targetSa, excludeKeysSet);
                selectedSA.push(...picked);
            }
        });

        // Ensure exact 24 MC and 16 SA fallback balancing if minor shortfall
        if (selectedMC.length < 24) {
            const remainder = this.weightedPick(mcPool, statsMap, 24 - selectedMC.length, new Set([...excludeKeysSet, ...selectedMC.map(q => q.qKey)]));
            selectedMC.push(...remainder);
        }
        if (selectedSA.length < 16) {
            const remainder = this.weightedPick(saPool, statsMap, 16 - selectedSA.length, new Set([...excludeKeysSet, ...selectedSA.map(q => q.qKey)]));
            selectedSA.push(...remainder);
        }

        // 실전 시험지 순서 (1~24번 객관식 법률/단원순 -> 25~40번 주관식 법률/단원순)
        return [...selectedMC.slice(0, 24), ...selectedSA.slice(0, 16)];
    },

    /**
     * Anti-Clumping Shuffle: Prevents consecutive questions from same chapter / adjacent indexes
     */
    shuffleWithAntiClumping(questions) {
        const shuffled = [...questions].sort(() => Math.random() - 0.5);
        const result = [];

        while (shuffled.length > 0) {
            let bestIdx = 0;
            const last = result[result.length - 1];

            if (last) {
                // Find first candidate that has a different chapter or far index
                const diffIdx = shuffled.findIndex(q => q.chapterName !== last.chapterName);
                if (diffIdx !== -1) bestIdx = diffIdx;
            }

            result.push(shuffled.splice(bestIdx, 1)[0]);
        }

        return result;
    },

    /**
     * Generate Review / Weakness Set (Prioritize Weight >= 2)
     */
    generateReviewSet(subject, statsMap = {}, count = 40) {
        const mcPool = this.getQuestionPool(subject, 'choice');
        const saPool = this.getQuestionPool(subject, 'short');
        const all = [...mcPool, ...saPool];

        // Filter high-weight items
        const weakItems = all.filter(q => (statsMap[q.qKey]?.weight || 1) >= 2);
        
        if (weakItems.length >= count) {
            return this.weightedPick(weakItems, statsMap, count);
        }

        // If high weight items < count, take all weak items and fill remaining with weighted sampling
        const weakSet = new Set(weakItems.map(q => q.qKey));
        const remaining = this.weightedPick(all, statsMap, count - weakItems.length, weakSet);
        return this.shuffleWithAntiClumping([...weakItems, ...remaining]);
    },

    /**
     * Generate Part-by-Part Full Question Set
     */
    generatePartSet(subject, chapterPattern) {
        const mcPool = this.getQuestionPool(subject, 'choice');
        const saPool = this.getQuestionPool(subject, 'short');
        const regex = new RegExp(chapterPattern);

        const mcMatches = mcPool.filter(q => regex.test(q.chapterName));
        const saMatches = saPool.filter(q => regex.test(q.chapterName));

        const all = [...mcMatches, ...saMatches];
        return all.sort(() => Math.random() - 0.5);
    },

    /**
     * Get list of unique chapters for a subject
     */
    getChapterList(subject) {
        const bank = this.getBank();
        if (!bank || !bank.datasets) return [];

        const mcKey = subject === '관리실무' ? 'gwanri_mc' : 'law_mc';
        const dataset = bank.datasets[mcKey];
        if (!dataset || !Array.isArray(dataset.chapters)) return [];

        return dataset.chapters.map(c => ({
            chapter: c.chapter,
            title: c.chapter.replace(/^CHAPTER\s+\d+\s*/i, '')
        }));
    }
};
