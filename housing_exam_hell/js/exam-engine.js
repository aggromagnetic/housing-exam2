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

    GENERIC_STOP_WORDS: new Set([
        "공동주택", "주택", "주택법", "건축법", "공동주택관리법", "관리실무", "관계법규",
        "관리", "관리의", "기준", "요건", "구분", "비교", "산정", "의무", "절차", "규정",
        "종류", "범위", "특성", "적용", "경우", "사항", "설치", "확인", "대상", "내용",
        "대통령령", "국토교통부령", "시장", "군수", "구청장", "시도지사", "장관", "특별시장",
        "광역시장", "특별자치시", "도지사", "특별자치도", "방법", "조치", "행위", "제외",
        "포함", "관련", "대하여", "따른", "의한", "모두", "옳은", "옳지", "틀린", "것은",
        "골라", "다음", "아래", "설명", "규정된", "해당하는", "이하", "이상", "초과", "미만",
        "비율", "조문", "출제", "빈출", "유력", "주관식", "객관식"
    ]),

    extractDistinctiveKeywords(topic, note) {
        const text = (topic || "") + " " + (note || "");
        return Array.from(new Set(text
            .replace(/[\(\)·,\.\/vs\-\+vs\:\[\]\<\>\"\'\?\!~]/g, " ")
            .split(/\s+/)
            .map(w => w.trim())
            .filter(w => w.length >= 2 && !this.GENERIC_STOP_WORDS.has(w))));
    },

    isCategoryMatch(chapterName, itemCategory) {
        if (!itemCategory) return true;
        const chap = (chapterName || "").replace(/^CHAPTER\s+\d+\s*/i, "").trim();
        const cat = itemCategory.trim();

        if (chap.includes(cat) || cat.includes(chap)) return true;
        
        // Specific mappings for 관계법규
        if (cat === "주택법" && chap.includes("주택법")) return true;
        if (cat.includes("공동주택관리법") && chap.includes("공동주택관리법")) return true;
        if (cat === "건축법" && chap.includes("건축법")) return true;
        if (cat.includes("민간임대") && chap.includes("민간임대")) return true;
        if (cat.includes("공공주택") && chap.includes("공공주택")) return true;
        if (cat.includes("정비") && chap.includes("정비")) return true;
        if (cat.includes("시설물의안전") && (chap.includes("시설물의") || chap.includes("시특법") || chap.includes("안전점검"))) return true;
        if (cat.includes("전기사업") && chap.includes("전기")) return true;
        if (cat.includes("승강기") && chap.includes("승강기")) return true;
        if (cat.includes("소방기본") && chap.includes("소방기본")) return true;
        if (cat.includes("화재") && chap.includes("화재")) return true;
        if (cat.includes("소방시설") && chap.includes("소방시설")) return true;
        if (cat.includes("집합건물") && chap.includes("집합건물")) return true;

        // 관리실무 mappings
        if (cat.includes("주택의") && chap.includes("주택의")) return true;
        if (cat.includes("관리기준") && (chap.includes("총칙") || chap.includes("관리기준"))) return true;
        if (cat.includes("관리방법") && chap.includes("관리방법")) return true;
        if (cat.includes("관리조직") && chap.includes("관리조직")) return true;
        if (cat.includes("주택관리사") && chap.includes("주택관리사")) return true;
        if (cat.includes("입주자관리") && chap.includes("입주자관리")) return true;
        if (cat.includes("사무") && (chap.includes("사무") || chap.includes("인사"))) return true;
        if (cat.includes("대외업무") && (chap.includes("대외업무") || chap.includes("리모델링"))) return true;
        if (cat.includes("회계관리") && chap.includes("회계관리")) return true;
        if (cat.includes("시설관리") && chap.includes("시설관리")) return true;
        if (cat.includes("환경안전방재") && (chap.includes("안전관리") || chap.includes("환경관리"))) return true;

        return false;
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
            if (!this.isCategoryMatch(q.chapterName, item.category)) continue;

            const distinctiveKws = this.extractDistinctiveKeywords(item.topic, item.note);
            if (distinctiveKws.length === 0) continue;

            const matched = distinctiveKws.filter(kw => fullText.includes(kw));
            const strongMatch = matched.some(kw => kw.length >= 4);
            const multiMatch = matched.filter(kw => kw.length >= 3).length >= 2;

            if (strongMatch || multiMatch) {
                matches.push({
                    item,
                    matched,
                    score: matched.length + (strongMatch ? 2 : 0)
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
                const matches = this.matchQuestionKeywords({ ...q, chapterName: chap.chapter }, subject);
                pool.push({
                    ...q,
                    qKey: `${subject}_${type}_${chap.chapter}_${q.id}`,
                    subject,
                    type,
                    chapterName: chap.chapter,
                    sourceFile: chap.source_file || '',
                    coreMatches: matches,
                    topCoreMatch: matches.length > 0 ? matches[0] : null,
                    isHighYield: false,
                    primaryCoreItem: null
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
     * Generate 40-question Exam (24 MC + 16 Subjective) with EXACT ~40% Core 300 Guarantee (16 Core + 24 Standard)
     */
    generateExamSet(subject, statsMap = {}, excludeKeysSet = new Set(), highYieldRatio = 0.40) {
        const mcPool = this.getQuestionPool(subject, 'choice');
        const saPool = this.getQuestionPool(subject, 'short');
        const blueprint = this.getBlueprint(subject);

        const selectedMC = [];
        const selectedSA = [];
        const pickedKeys = new Set(excludeKeysSet);

        // Target exactly ~40% Core 300 questions (10 MC out of 24, 6 SA out of 16 = 16 / 40 questions)
        let mcHyRemaining = Math.round(24 * highYieldRatio); // 10
        let saHyRemaining = Math.round(16 * highYieldRatio); // 6

        blueprint.forEach(rule => {
            let targetMc = rule.mc;
            let targetSa = rule.sa;

            if (rule.randomSwap && (targetMc + targetSa === 1)) {
                if (Math.random() < 0.5) {
                    targetMc = 0; targetSa = 1;
                } else {
                    targetMc = 1; targetSa = 0;
                }
            }

            const chapterMcList = mcPool.filter(q => rule.pattern.test(q.chapterName));
            const chapterSaList = saPool.filter(q => rule.pattern.test(q.chapterName));

            // MC Pick: exactly proportional core items
            if (targetMc > 0) {
                let hyToPick = 0;
                if (mcHyRemaining > 0) {
                    hyToPick = Math.min(targetMc, Math.ceil(targetMc * highYieldRatio));
                    hyToPick = Math.min(hyToPick, mcHyRemaining);
                }

                const hyCandidates = chapterMcList.filter(q => q.topCoreMatch !== null).sort((a, b) => (b.topCoreMatch.score - a.topCoreMatch.score));
                const pickedHy = this.weightedPick(hyCandidates.slice(0, Math.max(hyToPick * 3, 5)), statsMap, hyToPick, pickedKeys);

                pickedHy.forEach(q => {
                    pickedKeys.add(q.qKey);
                    selectedMC.push({
                        ...q,
                        isHighYield: true,
                        primaryCoreItem: q.topCoreMatch.item
                    });
                });
                mcHyRemaining -= pickedHy.length;

                // Pick the rest as STANDARD questions (isHighYield = false)
                const remainingMcCount = targetMc - pickedHy.length;
                if (remainingMcCount > 0) {
                    const pickedRest = this.weightedPick(chapterMcList, statsMap, remainingMcCount, pickedKeys);
                    pickedRest.forEach(q => {
                        pickedKeys.add(q.qKey);
                        selectedMC.push({
                            ...q,
                            isHighYield: false,
                            primaryCoreItem: null
                        });
                    });
                }
            }

            // SA Pick: exactly proportional core items
            if (targetSa > 0) {
                let hyToPick = 0;
                if (saHyRemaining > 0) {
                    hyToPick = Math.min(targetSa, Math.ceil(targetSa * highYieldRatio));
                    hyToPick = Math.min(hyToPick, saHyRemaining);
                }

                const hyCandidates = chapterSaList.filter(q => q.topCoreMatch !== null).sort((a, b) => (b.topCoreMatch.score - a.topCoreMatch.score));
                const pickedHy = this.weightedPick(hyCandidates.slice(0, Math.max(hyToPick * 3, 5)), statsMap, hyToPick, pickedKeys);

                pickedHy.forEach(q => {
                    pickedKeys.add(q.qKey);
                    selectedSA.push({
                        ...q,
                        isHighYield: true,
                        primaryCoreItem: q.topCoreMatch.item
                    });
                });
                saHyRemaining -= pickedHy.length;

                // Pick the rest as STANDARD questions (isHighYield = false)
                const remainingSaCount = targetSa - pickedHy.length;
                if (remainingSaCount > 0) {
                    const pickedRest = this.weightedPick(chapterSaList, statsMap, remainingSaCount, pickedKeys);
                    pickedRest.forEach(q => {
                        pickedKeys.add(q.qKey);
                        selectedSA.push({
                            ...q,
                            isHighYield: false,
                            primaryCoreItem: null
                        });
                    });
                }
            }
        });

        if (selectedMC.length < 24) {
            const remainderAll = this.weightedPick(mcPool, statsMap, 24 - selectedMC.length, pickedKeys);
            remainderAll.forEach(q => {
                pickedKeys.add(q.qKey);
                selectedMC.push({ ...q, isHighYield: false, primaryCoreItem: null });
            });
        }
        if (selectedSA.length < 16) {
            const remainderAll = this.weightedPick(saPool, statsMap, 16 - selectedSA.length, pickedKeys);
            remainderAll.forEach(q => {
                pickedKeys.add(q.qKey);
                selectedSA.push({ ...q, isHighYield: false, primaryCoreItem: null });
            });
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
                const diffIdx = shuffled.findIndex(q => q.chapterName !== last.chapterName);
                if (diffIdx !== -1) bestIdx = diffIdx;
            }

            result.push(shuffled.splice(bestIdx, 1)[0]);
        }

        return result;
    },

    /**
     * Generate Review / Weakness Set (Tag 40% with Core 300)
     */
    generateReviewSet(subject, statsMap = {}, count = 40) {
        const mcPool = this.getQuestionPool(subject, 'choice');
        const saPool = this.getQuestionPool(subject, 'short');
        const all = [...mcPool, ...saPool];

        const weakItems = all.filter(q => (statsMap[q.qKey]?.weight || 1) >= 2);
        let picked = [];

        if (weakItems.length >= count) {
            picked = this.weightedPick(weakItems, statsMap, count);
        } else {
            const weakSet = new Set(weakItems.map(q => q.qKey));
            const remaining = this.weightedPick(all, statsMap, count - weakItems.length, weakSet);
            picked = [...weakItems, ...remaining];
        }

        // Tag top 40% (16 questions) as Core 300 if matched
        const targetHyCount = Math.round(count * 0.40);
        let taggedHy = 0;

        const processed = picked.map(q => {
            if (taggedHy < targetHyCount && q.topCoreMatch !== null) {
                taggedHy++;
                return { ...q, isHighYield: true, primaryCoreItem: q.topCoreMatch.item };
            }
            return { ...q, isHighYield: false, primaryCoreItem: null };
        });

        return this.shuffleWithAntiClumping(processed);
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

        const all = [...mcMatches, ...saMatches].map(q => {
            const isStrongCore = q.topCoreMatch && q.topCoreMatch.score >= 3;
            return {
                ...q,
                isHighYield: isStrongCore,
                primaryCoreItem: isStrongCore ? q.topCoreMatch.item : null
            };
        });
        return all.sort(() => Math.random() - 0.5);
    },

    /**
     * Generate Infinite Hell Mode Set (40 questions: 16 Core 300 + 24 Standard)
     */
    generateInfiniteHellSet(statsMap = {}, excludeKeysSet = new Set()) {
        const lawMC = this.getQuestionPool('관계법규', 'choice');
        const lawSA = this.getQuestionPool('관계법규', 'short');
        const gwanriMC = this.getQuestionPool('관리실무', 'choice');
        const gwanriSA = this.getQuestionPool('관리실무', 'short');

        const pickedLawMC = this.weightedPick(lawMC, statsMap, 12, excludeKeysSet);
        const pickedLawSA = this.weightedPick(lawSA, statsMap, 8, excludeKeysSet);
        const pickedGwanriMC = this.weightedPick(gwanriMC, statsMap, 12, excludeKeysSet);
        const pickedGwanriSA = this.weightedPick(gwanriSA, statsMap, 8, excludeKeysSet);

        const combined = [...pickedLawMC, ...pickedLawSA, ...pickedGwanriMC, ...pickedGwanriSA];
        
        let taggedHy = 0;
        const processed = combined.map(q => {
            if (taggedHy < 16 && q.topCoreMatch !== null) {
                taggedHy++;
                return { ...q, isHighYield: true, primaryCoreItem: q.topCoreMatch.item };
            }
            return { ...q, isHighYield: false, primaryCoreItem: null };
        });

        return this.shuffleWithAntiClumping(processed);
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
