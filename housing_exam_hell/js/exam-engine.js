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
            "비율", "조문", "출제", "빈출", "유력", "주관식", "객관식", "사람", "이내", "시작",
            "시작한", "예외", "사람에", "있음", "없음", "가능", "불가", "특례", "관련된", "대한",
            "받아야", "하는", "받은", "정기적", "신청", "소유자", "결과", "기한", "설비", "공사",
            "안전관리", "안전관리법", "관리법", "시행규칙", "시행령", "법률", "규칙", "조례",
            "실시", "통보", "작성", "제출", "보고", "검사", "점검", "정기검사", "자체점검", "수시검사",
            "어느", "하나", "각호", "해당", "규정", "또는", "위한", "통해", "대해", "암기", "시기"
        ]),

        SUFFIX_2CHAR_REGEX: /(으로|에서|에게|부터|까지|마다|따라|따른|관한|대한|위한|통해|대해)$/,
        SUFFIX_1CHAR_REGEX: /(은|는|이|을|를|의|에|와|과|도|만|상|별|등|용)$/,

        cleanWord(w) {
            if (!w) return "";
            let cleaned = w.trim();
            cleaned = cleaned.replace(this.SUFFIX_2CHAR_REGEX, "");
            if (cleaned.length >= 3) {
                cleaned = cleaned.replace(this.SUFFIX_1CHAR_REGEX, "");
            }
            return cleaned.trim();
        },

        extractDistinctiveKeywords(topic, note) {
            const text = (topic || "") + " " + (note || "");
            return Array.from(new Set(text
                .replace(/[\(\)·,\.\/vs\-\+vs\:\[\]\<\>\"\'\?\!~]/g, " ")
                .split(/\s+/)
                .map(w => this.cleanWord(w))
                .filter(w => w.length >= 2 && !this.GENERIC_STOP_WORDS.has(w))));
        },

        checkSubcategoryRequirement(category, fullText) {
            if (!category) return true;
            const cat = category.trim();

            if (cat.includes("승강기")) {
                return /승강기|엘리베이터|에스컬레이터|무빙워크|리프트|덤웨이터|권상기|조속기/i.test(fullText);
            }
            if (cat.includes("전기사업") || cat.includes("전기설비")) {
                return /전기|전력|변전|수전|발전|배전|전압|전류|자가용|배선|접지|누전/i.test(fullText);
            }
            if (cat.includes("가스")) {
                return /가스|도시가스|LPG|LNG|가스누설|가스배관/i.test(fullText);
            }
            if (cat.includes("소방") || cat.includes("화재")) {
                return /소방|화재|소화|스프링클러|감지기|유도등|경보|비상벨|방화/i.test(fullText);
            }
            if (cat.includes("급수")) {
                return /급수|수조|저수조|수도|수질|물탱크|부스터|수격|워터해머|크로스커넥션|위생점검|급수관/i.test(fullText);
            }
            if (cat.includes("급탕")) {
                return /급탕|온수|가열기|서큘레이터|리버스|환수관/i.test(fullText);
            }
            if (cat.includes("난방") || cat.includes("보일러")) {
                return /난방|보일러|방열기|라디에이터|지역난방|개별난방|중앙난방|열교환기|팽창탱크|난방코일/i.test(fullText);
            }
            if (cat.includes("오수") || cat.includes("정화조")) {
                return /오수|정화조|하수|BOD|생물학적|침전|폭기|부패탱크/i.test(fullText);
            }
            if (cat.includes("배수") || cat.includes("통기") || cat.includes("환기")) {
                return /배수|통기|환기|트랩|봉수|루프통기|각개통기|드레인|환기설비|송풍기/i.test(fullText);
            }
            if (cat.includes("회계")) {
                return /회계|예산|결산|재무제표|대차대조표|손익계산서|관리비|잡수입|장기수선충당금|예치금|감사/i.test(fullText);
            }
            if (cat.includes("노동") || cat.includes("인사") || cat.includes("사무")) {
                return /근로|임금|퇴직|퇴직금|휴가|연차|취업규칙|근로계약|최저임금|수습|산업재해|고용보험|국민연금|건강보험|노동조합/i.test(fullText);
            }
            if (cat.includes("주택관리사")) {
                return /주택관리사|보증보험|공제|자격증|손해배상책임|배치신고|행정처분|자격취소|자격정지/i.test(fullText);
            }
            if (cat.includes("입주자대표회의") || cat.includes("선거관리위원회")) {
                return /입주자대표회의|동별\s*대표자|선거관리위원회|임원|회장|감사|해임|의결/i.test(fullText);
            }
            if (cat.includes("민간임대")) {
                return /민간임대|임대사업자|임차인대표회의|임대보증금|임대차계약|표준임대차|특별수선충당금/i.test(fullText);
            }
            if (cat.includes("공공주택")) {
                return /공공주택|공공임대|영구임대|국민임대|행복주택|장기전세|통합공공임대|임대의무기간/i.test(fullText);
            }
            if (cat.includes("정비") || cat.includes("도시및주거환경")) {
                return /정비사업|재건축|재개발|주거환경개선|조합설립|관리처분|사업시행|안전진단/i.test(fullText);
            }
            if (cat.includes("시설물의안전") || cat.includes("시특법")) {
                return /시설물|시특법|안전점검|정밀안전진단|제1종|제2종|제3종|중대한\s*결함/i.test(fullText);
            }
            if (cat.includes("집합건물")) {
                return /집합건물|구분소유|관리단|관리인|규약|관리단집회|공용부분|대지사용권/i.test(fullText);
            }
            return true;
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
            if (cat.includes("관리기준") && (chap.includes("총칙") || chap.includes("관리기준") || chap.includes("관리규약"))) return true;
            if (cat.includes("관리방법") && chap.includes("관리방법")) return true;
            if (cat.includes("관리조직") && (chap.includes("관리조직") || chap.includes("입주자대표회의"))) return true;
            if (cat.includes("주택관리사") && chap.includes("주택관리사")) return true;
            if (cat.includes("벌칙") && chap.includes("벌칙")) return true;
            if (cat.includes("입주자관리") && (chap.includes("입주자관리") || chap.includes("자치규약") || chap.includes("규약"))) return true;
            if (cat.includes("사무") && (chap.includes("사무") || chap.includes("인사") || chap.includes("노동"))) return true;
            if (cat.includes("대외업무") && (chap.includes("대외업무") || chap.includes("리모델링"))) return true;
            if (cat.includes("회계관리") && chap.includes("회계관리")) return true;
            if (cat.includes("시설관리") && chap.includes("시설관리")) return true;
            if (cat.includes("환경안전방재") && (chap.includes("환경") || chap.includes("안전"))) return true;

            return false;
        },

        matchQuestionKeywords(q, subject) {
            const subjectKeywords = this.getCoreKeywordsDB(subject);
            if (!subjectKeywords || subjectKeywords.length === 0) return [];

            // Search question, title, passage, answers ONLY (excluding explanation/tip to prevent dilution)
            const ansText = q.answers ? Object.values(q.answers).join(' ') : (q.answer || '');
            const fullText = [
                q.question || '',
                q.title || '',
                q.passage || '',
                ansText,
                (q.options || []).join(' '),
                q.keyword || ''
            ].join(' ');

            const matches = [];
            for (const item of subjectKeywords) {
                if (!this.isCategoryMatch(q.chapterName, item.category)) continue;
                if (!this.checkSubcategoryRequirement(item.category, fullText)) continue;

                const distinctiveKws = this.extractDistinctiveKeywords(item.topic, item.note);
                if (distinctiveKws.length === 0) continue;

                const matched = distinctiveKws.filter(kw => fullText.includes(kw));
                const exactTopicMatch = item.topic && fullText.includes(item.topic);

                let score = 0;
                if (exactTopicMatch) score += 3;
                if (matched.length >= 3) score += 3;
                else if (matched.length === 2) score += 2;
                else if (matched.length === 1) score += 1;

                const isChapterMatch = this.isCategoryMatch(q.chapterName, item.category);
                if (isChapterMatch && score > 0) score += 1;

                if (score >= 2) {
                    matches.push({
                        item,
                        matched,
                        score,
                        isChapterMatch
                    });
                }
            }

            matches.sort((a, b) => b.score - a.score || (b.isChapterMatch ? 1 : 0) - (a.isChapterMatch ? 1 : 0));
            return matches;
        },

    /**
     * Get all questions for a subject and type with a unified key
     */
    _poolCache: {},

    getQuestionPool(subject, type) {
        const cacheKey = `${subject}_${type}`;
        if (this._poolCache[cacheKey]) return this._poolCache[cacheKey];

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
                const topMatch = matches.length > 0 ? matches[0] : null;
                // ⭐ 핵심 300선 뱃지는 score >= 4 (상위 ~36% 초핵심)에만 부착
                const isHighYield = topMatch !== null && topMatch.score >= 4;
                pool.push({
                    ...q,
                    qKey: `${subject}_${type}_${chap.chapter}_${q.id}`,
                    subject,
                    type,
                    chapterName: chap.chapter,
                    sourceFile: chap.source_file || '',
                    coreMatches: matches,
                    topCoreMatch: topMatch,
                    isHighYield: isHighYield,
                    primaryCoreItem: isHighYield ? topMatch.item : null
                });
            });
        });

        this._poolCache[cacheKey] = pool;
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
            const userWeight = (stat && stat.weight) ? stat.weight : 1.0;
            
            // 적중 점수(score) 비례 확률 가중치 (완만한 스케일링, 최대 5.4배 캡):
            // score >= 4 (⭐ 뱃지 부착, 초핵심): 1.8배
            // score === 3 (준핵심 빈출, 뱃지 미부착): 1.3배
            // score <= 2 (일반/지엽, 뱃지 미부착): 1.0배
            const coreScore = (it.topCoreMatch && it.topCoreMatch.score) ? it.topCoreMatch.score : 1;
            const scoreWeight = coreScore >= 4 ? 1.8 : (coreScore === 3 ? 1.3 : 1.0);
            
            return userWeight * scoreWeight;
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
                { pattern: /06.*벌칙/, mc: 0, sa: 1, randomSwap: true },
                { pattern: /07.*입주자관리/, mc: 1, sa: 1 },
                { pattern: /08.*사무.*인사/, mc: 3, sa: 3 },
                { pattern: /09.*대외업무/, mc: 1, sa: 0 },
                { pattern: /10.*회계관리/, mc: 1, sa: 0 },
                { pattern: /11.*시설관리/, mc: 9, sa: 6 },
                { pattern: /12.*환경.*안전/, mc: 2, sa: 3 }
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
     * Generate 40-question Exam (24 MC + 16 Subjective) with at least 40% Core 300 guaranteed + natural random selection
     */
    generateExamSet(subject, statsMap = {}, excludeKeysSet = new Set(), highYieldRatio = 0.40) {
        const mcPool = this.getQuestionPool(subject, 'choice');
        const saPool = this.getQuestionPool(subject, 'short');
        const blueprint = this.getBlueprint(subject);

        const selectedMC = [];
        const selectedSA = [];
        const pickedKeys = new Set(excludeKeysSet);

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

            // 1) MC: Guaranteed at least 40% high yield from core 300 candidates
            if (targetMc > 0) {
                const hyCandidates = chapterMcList.filter(q => q.isHighYield);
                const targetHyMc = Math.min(hyCandidates.length, Math.ceil(targetMc * highYieldRatio));
                const pickedHy = this.weightedPick(hyCandidates, statsMap, targetHyMc, pickedKeys);

                pickedHy.forEach(q => {
                    pickedKeys.add(q.qKey);
                    selectedMC.push(q);
                });

                // 2) Remaining quota picked randomly/weighted from all chapter questions
                const remainingMcCount = targetMc - pickedHy.length;
                if (remainingMcCount > 0) {
                    const pickedRest = this.weightedPick(chapterMcList, statsMap, remainingMcCount, pickedKeys);
                    pickedRest.forEach(q => {
                        pickedKeys.add(q.qKey);
                        selectedMC.push(q);
                    });
                }
            }

            // 2) SA: Guaranteed at least 40% high yield from core 300 candidates
            if (targetSa > 0) {
                const hyCandidates = chapterSaList.filter(q => q.isHighYield);
                const targetHySa = Math.min(hyCandidates.length, Math.ceil(targetSa * highYieldRatio));
                const pickedHy = this.weightedPick(hyCandidates, statsMap, targetHySa, pickedKeys);

                pickedHy.forEach(q => {
                    pickedKeys.add(q.qKey);
                    selectedSA.push(q);
                });

                // Remaining quota picked from all chapter questions
                const remainingSaCount = targetSa - pickedHy.length;
                if (remainingSaCount > 0) {
                    const pickedRest = this.weightedPick(chapterSaList, statsMap, remainingSaCount, pickedKeys);
                    pickedRest.forEach(q => {
                        pickedKeys.add(q.qKey);
                        selectedSA.push(q);
                    });
                }
            }
        });

        if (selectedMC.length < 24) {
            const remainderAll = this.weightedPick(mcPool, statsMap, 24 - selectedMC.length, pickedKeys);
            remainderAll.forEach(q => {
                pickedKeys.add(q.qKey);
                selectedMC.push(q);
            });
        }
        if (selectedSA.length < 16) {
            const remainderAll = this.weightedPick(saPool, statsMap, 16 - selectedSA.length, pickedKeys);
            remainderAll.forEach(q => {
                pickedKeys.add(q.qKey);
                selectedSA.push(q);
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
     * Generate Review / Weakness Set
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

        return this.shuffleWithAntiClumping(picked);
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
     * Generate Infinite Hell Mode Set (80 questions: Mixed 40 Law + 40 Gwanri, Blueprint Guaranteed)
     */
    generateInfiniteHellSet(statsMap = {}, excludeKeysSet = new Set(), highYieldRatio = 0.40) {
        // 1. 관계법규 40문항 (객관식 24 + 주관식 16: 14대 법률 블루프린트 100% 반영)
        const lawSet = this.generateExamSet('관계법규', statsMap, excludeKeysSet, highYieldRatio);
        
        // 2. 중복 방지를 위한 키 누적
        const lawKeys = new Set(excludeKeysSet);
        lawSet.forEach(q => lawKeys.add(q.qKey));

        // 3. 관리실무 40문항 (객관식 24 + 주관식 16: 12대 단원 블루프린트 100% 반영)
        const gwanriSet = this.generateExamSet('관리실무', statsMap, lawKeys, highYieldRatio);

        // 4. 총 80문항 융합 및 군집 방지 셔플 (관계법규 + 관리실무 50:50)
        const combined = [...lawSet, ...gwanriSet];
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
