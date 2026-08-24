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
     * Get Core Keywords DB (관계법규 300 / 관리실무 300)
     */
    getCoreKeywordsDB(subject) {
        if (!window.HOUSING_CORE_KEYWORDS_DB) return [];
        return window.HOUSING_CORE_KEYWORDS_DB[subject] || [];
    },

    getTopicKeywords(topic) {
        const stopWords = new Set(["관한", "기준", "요건", "구분", "비교", "산정", "의무", "절차", "규정", "종류", "범위", "특성", "적용", "경우", "사항", "설치", "관리", "확인"]);
        return topic
            .replace(/[\(\)·,\.\/vs\-\+vs\:]/g, " ")
            .split(/\s+/)
            .map(t => t.trim())
            .filter(t => t.length >= 2 && !stopWords.has(t));
    },

    matchQuestionKeywords(q, subject) {
        const subjectKeywords = this.getCoreKeywordsDB(subject);
        if (!subjectKeywords || subjectKeywords.length === 0) return [];

        const fullText = [
            q.question || "",
            q.title || "",
            q.passage || "",
            (q.options || []).join(" "),
            q.explanation || "",
            q.tip || "",
            q.keyword || ""
        ].join(" ");

        const matches = [];
        for (const item of subjectKeywords) {
            const topicKws = this.getTopicKeywords(item.topic);
            if (topicKws.length === 0) continue;

            let matchedKws = topicKws.filter(kw => fullText.includes(kw));
            const hasStrongMatch = matchedKws.some(kw => kw.length >= 4);
            if (hasStrongMatch || matchedKws.length >= 2) {
                matches.push({
                    item,
                    matchedKws,
                    score: matchedKws.length + (hasStrongMatch ? 2 : 0)
                });
            }
        }

        matches.sort((a, b) => b.score - a.score);
        return matches;
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
                const matches = this.matchQuestionKeywords(q, subject);
                pool.push({
                    ...q,
                    qKey: `${subject}_${type}_${chap.chapter}_${q.id}`,
                    subject,
                    type,
                    chapterName: chap.chapter,
                    sourceFile: chap.source_file || '',
                    coreMatches: matches,
                    isHighYield: matches.length > 0,
                    primaryCoreItem: matches.length > 0 ? matches[0].item : null
                });
            });
        });

        return pool;
    },

    /**
     * Weighted random selection (Roulette Wheel)
     * Probability of question i: P_i = W_i / sum(W_k)
     */
    weightedPick(items, statsMap = {}, count, excludeKeysSet = new Set()) {
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
                { pattern: /01.*주택의.*정의/, mc: 1, sa: 0 },
                { pattern: /02.*총칙/, mc: 1, sa: 0 },
                { pattern: /03.*관리방법/, mc: 2, sa: 1 },
                { pattern: /04.*관리조직/, mc: 2, sa: 2 },
                { pattern: /05.*주택관리사/, mc: 1, sa: 0 },
                { pattern: /07.*입주자관리/, mc: 1, sa: 1 },
                { pattern: /08.*사무.*인사/, mc: 3, sa: 3 },
                { pattern: /09.*대외업무.*리모델링/, mc: 1, sa: 0 },
                { pattern: /11.*회계관리|10.*회계관리/, mc: 1, sa: 0 },
                { pattern: /12.*시설관리|11.*시설관리/, mc: 9, sa: 6 },
                { pattern: /13.*안전관리|14.*환경관리|12.*환경관리/, mc: 2, sa: 3 }
            ];
        } else {
            // 관계법규 (총 14개 법률)
            return [
                { pattern: /01.*주택법/, mc: 5, sa: 3 },
                { pattern: /02.*공동주택관리법/, mc: 5, sa: 3 },
                { pattern: /03.*민간임대주택/, mc: 1, sa: 1 },
                { pattern: /04.*공공주택/, mc: 1, sa: 1 },
                { pattern: /05.*건축법/, mc: 4, sa: 3 },
                { pattern: /06.*도시.*주거환경정비/, mc: 1, sa: 1 },
                { pattern: /07.*도시재정비/, mc: 1, sa: 0 },
                { pattern: /08.*시설물의.*안전/, mc: 1, sa: 1 },
                { pattern: /09.*소방기본법/, mc: 1, sa: 0 },
                { pattern: /10.*화재의.*예방/, mc: 1, sa: 0 },
                { pattern: /11.*소방시설/, mc: 1, sa: 0 },
                { pattern: /12.*전기사업법/, mc: 1, sa: 1 },
                { pattern: /13.*승강기/, mc: 1, sa: 1 },
                { pattern: /14.*집합건물/, mc: 0, sa: 1 }
            ];
        }
    },

    /**
     * Generate 40-question Exam (24 MC + 16 Subjective) with 40%+ High-Yield Core 300 Guarantee
     */
    generateExamSet(subject, statsMap = {}, excludeKeysSet = new Set(), highYieldRatio = 0.40) {
        const mcPool = this.getQuestionPool(subject, 'choice');
        const saPool = this.getQuestionPool(subject, 'short');
        const blueprint = this.getBlueprint(subject);

        const selectedMC = [];
        const selectedSA = [];

        blueprint.forEach(rule => {
            let targetMc = rule.mc;
            let targetSa = rule.sa;

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

            // MC Pick with High-Yield Priority (40%+)
            if (targetMc > 0) {
                const hyMC = chapterMcList.filter(q => q.isHighYield);
                const targetHyMc = Math.min(hyMC.length, Math.ceil(targetMc * highYieldRatio));

                const pickedHy = this.weightedPick(hyMC, statsMap, targetHyMc, excludeKeysSet);
                selectedMC.push(...pickedHy);

                const remainingMcCount = targetMc - pickedHy.length;
                if (remainingMcCount > 0) {
                    const pickedKeys = new Set([...excludeKeysSet, ...pickedHy.map(q => q.qKey)]);
                    const pickedRest = this.weightedPick(chapterMcList, statsMap, remainingMcCount, pickedKeys);
                    selectedMC.push(...pickedRest);
                }
            }

            // SA Pick with High-Yield Priority (40%+)
            if (targetSa > 0) {
                const hySA = chapterSaList.filter(q => q.isHighYield);
                const targetHySa = Math.min(hySA.length, Math.ceil(targetSa * highYieldRatio));

                const pickedHy = this.weightedPick(hySA, statsMap, targetHySa, excludeKeysSet);
                selectedSA.push(...pickedHy);

                const remainingSaCount = targetSa - pickedHy.length;
                if (remainingSaCount > 0) {
                    const pickedKeys = new Set([...excludeKeysSet, ...pickedHy.map(q => q.qKey)]);
                    const pickedRest = this.weightedPick(chapterSaList, statsMap, remainingSaCount, pickedKeys);
                    selectedSA.push(...pickedRest);
                }
            }
        });

        if (selectedMC.length < 24) {
            const pickedKeys = new Set([...excludeKeysSet, ...selectedMC.map(q => q.qKey)]);
            const hyMcPool = mcPool.filter(q => q.isHighYield);
            const remainderHy = this.weightedPick(hyMcPool, statsMap, 24 - selectedMC.length, pickedKeys);
            selectedMC.push(...remainderHy);

            if (selectedMC.length < 24) {
                const allPicked = new Set([...excludeKeysSet, ...selectedMC.map(q => q.qKey)]);
                const remainderAll = this.weightedPick(mcPool, statsMap, 24 - selectedMC.length, allPicked);
                selectedMC.push(...remainderAll);
            }
        }
        if (selectedSA.length < 16) {
            const pickedKeys = new Set([...excludeKeysSet, ...selectedSA.map(q => q.qKey)]);
            const hySaPool = saPool.filter(q => q.isHighYield);
            const remainderHy = this.weightedPick(hySaPool, statsMap, 16 - selectedSA.length, pickedKeys);
            selectedSA.push(...remainderHy);

            if (selectedSA.length < 16) {
                const allPicked = new Set([...excludeKeysSet, ...selectedSA.map(q => q.qKey)]);
                const remainderAll = this.weightedPick(saPool, statsMap, 16 - selectedSA.length, allPicked);
                selectedSA.push(...remainderAll);
            }
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
     * Generate Review / Weakness Set (Prioritize Weight >= 2 & High-Yield Core 300)
     */
    generateReviewSet(subject, statsMap = {}, count = 40) {
        const mcPool = this.getQuestionPool(subject, 'choice');
        const saPool = this.getQuestionPool(subject, 'short');
        const all = [...mcPool, ...saPool];

        // Filter high-weight items
        const weakItems = all.filter(q => (statsMap[q.qKey]?.weight || 1) >= 2);
        const weakHy = weakItems.filter(q => q.isHighYield);
        
        if (weakItems.length >= count) {
            const targetHyCount = Math.min(weakHy.length, Math.ceil(count * 0.5));
            const pickedHy = this.weightedPick(weakHy, statsMap, targetHyCount);
            const pickedRest = this.weightedPick(weakItems, statsMap, count - pickedHy.length, new Set(pickedHy.map(q => q.qKey)));
            return this.shuffleWithAntiClumping([...pickedHy, ...pickedRest]);
        }

        const weakSet = new Set(weakItems.map(q => q.qKey));
        const hyRemaining = all.filter(q => q.isHighYield && !weakSet.has(q.qKey));
        const targetRemainingHy = Math.min(hyRemaining.length, Math.ceil((count - weakItems.length) * 0.5));
        const pickedRemainingHy = this.weightedPick(hyRemaining, statsMap, targetRemainingHy, weakSet);

        const allPickedSet = new Set([...weakItems.map(q => q.qKey), ...pickedRemainingHy.map(q => q.qKey)]);
        const remaining = this.weightedPick(all, statsMap, count - weakItems.length - pickedRemainingHy.length, allPickedSet);

        return this.shuffleWithAntiClumping([...weakItems, ...pickedRemainingHy, ...remaining]);
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
     * Generate Infinite Hell Mode Set (40 questions: Mixed Subjects + Mixed MC/SA + Fully Shuffled)
     */
    generateInfiniteHellSet(statsMap = {}, excludeKeysSet = new Set()) {
        const lawMC = this.getQuestionPool('관계법규', 'choice');
        const lawSA = this.getQuestionPool('관계법규', 'short');
        const gwanriMC = this.getQuestionPool('관리실무', 'choice');
        const gwanriSA = this.getQuestionPool('관리실무', 'short');

        // Target: 20 관계법규 (12 MC + 8 SA) + 20 관리실무 (12 MC + 8 SA) = 40 questions
        const pickedLawMC = this.weightedPick(lawMC, statsMap, 12, excludeKeysSet);
        const pickedLawSA = this.weightedPick(lawSA, statsMap, 8, excludeKeysSet);
        const pickedGwanriMC = this.weightedPick(gwanriMC, statsMap, 12, excludeKeysSet);
        const pickedGwanriSA = this.weightedPick(gwanriSA, statsMap, 8, excludeKeysSet);

        const combined = [...pickedLawMC, ...pickedLawSA, ...pickedGwanriMC, ...pickedGwanriSA];
        
        // If shortfall due to exclusion, fill from remaining pool
        if (combined.length < 40) {
            const allPool = [...lawMC, ...lawSA, ...gwanriMC, ...gwanriSA];
            const usedKeys = new Set([...excludeKeysSet, ...combined.map(q => q.qKey)]);
            const remainder = this.weightedPick(allPool, statsMap, 40 - combined.length, usedKeys);
            combined.push(...remainder);
        }

        // Fully shuffle and anti-clump so subjects and question types are completely intermixed!
        return this.shuffleWithAntiClumping(combined);
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
