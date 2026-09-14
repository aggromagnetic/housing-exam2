/**
 * Housing Exam Hell - OMR Sheet & AI Prescription Markdown Generator
 */

export const OMRSheet = {
    /**
     * Render OMR Grid in modal/drawer
     */
    renderGrid(container, questions, userAnswers, results, onSelectQuestion) {
        if (!container) return;
        container.innerHTML = '';

        questions.forEach((q, idx) => {
            const btn = document.createElement('button');
            btn.className = 'omr-cell';
            
            if (q.subject === '관계법규') {
                btn.classList.add('omr-law-cell');
            } else if (q.subject === '관리실무') {
                btn.classList.add('omr-gwanri-cell');
            }

            const isAnswered = userAnswers[idx] !== undefined && userAnswers[idx] !== null && userAnswers[idx] !== '';
            const res = results[idx]; // { isCorrect, ... }

            if (res !== undefined) {
                btn.classList.add(res.isCorrect ? 'correct' : 'wrong');
            } else if (isAnswered) {
                btn.classList.add('answered');
            }

            const subLabel = `<span style="font-size: 0.62rem; font-weight: 700; color: ${q.subject === '관계법규' ? '#38BDF8' : '#34D399'}; opacity: 0.9;">${q.subject === '관계법규' ? '법규' : '실무'}</span>`;

            btn.innerHTML = `
                ${subLabel}
                <span class="num">${idx + 1}</span>
                <span class="status-icon">${
                    res !== undefined 
                        ? (res.isCorrect ? '<i class="fa-solid fa-check"></i>' : '<i class="fa-solid fa-xmark"></i>')
                        : (isAnswered ? '<i class="fa-solid fa-pen"></i>' : '')
                }</span>
            `;

            btn.addEventListener('click', () => {
                onSelectQuestion(idx);
            });

            container.appendChild(btn);
        });
    },

    /**
     * Build AI Prescription Markdown for ChatGPT / Gemini
     */
    buildAIPrompt(sessionData) {
        const { subject, score, correctCount, wrongCount, questions, userAnswers, results } = sessionData;

        let md = `## 📝 [주택관리사 2차] 오답 심층 분석 및 AI 1:1 일타 과외 요청서\n\n`;
        md += `- **응시 과목**: ${subject}\n`;
        md += `- **종합 점수**: ${Math.round(score)}점 / 100점 (${score >= 60 ? '🎉 합격권 (PASS)' : '⚠️ 과락주의 (RE-STUDY)'})\n`;
        md += `- **채점 결과**: 맞춤 ${correctCount}개 / 틀림 ${wrongCount}개\n`;
        md += `- **작성 일시**: ${new Date().toLocaleString('ko-KR')}\n\n`;
        md += `### ⚠️ 틀린 문항 전체 및 상세 분석 데이터\n\n`;

        let wrongIdx = 1;
        questions.forEach((q, idx) => {
            const res = results[idx];
            if (res && !res.isCorrect) {
                const chap = (q.chapterName || '').replace(/^CHAPTER\s+\d+\s*/i, '');
                md += `### [오답 ${wrongIdx}] ${chap ? `${chap} · ` : ''}${q.type === 'choice' ? '객관식 5지선다' : '주관식 단답형'}\n`;
                md += `**[문제]** ${q.question || q.title}\n\n`;

                if (q.passage) {
                    md += `**[지문/보기 박스]**\n\`\`\`\n${q.passage}\n\`\`\`\n\n`;
                }

                if (q.type === 'choice' && Array.isArray(q.options) && q.options.length > 0) {
                    md += `**[선택 보기]**\n`;
                    const CIRCLED_NUMS = ['①', '②', '③', '④', '⑤', '⑥'];
                    q.options.forEach((opt, oIdx) => {
                        const numSym = CIRCLED_NUMS[oIdx] || `(${oIdx + 1})`;
                        md += `${numSym} ${opt}\n`;
                    });
                    md += `\n`;

                    const uChoice = userAnswers[idx];
                    const tChoice = q.answer;
                    md += `- ❌ **나의 선택 오답**: [${uChoice ? `${uChoice}번` : '미선택'}] ${q.options[uChoice - 1] || ''}\n`;
                    md += `- ⭕ **실제 기준 정답**: [${tChoice}번] ${q.options[tChoice - 1] || ''}\n\n`;
                } else {
                    md += `- ❌ **나의 기입 오답**: ${res.userSummary || '(공란)'}\n`;
                    md += `- ⭕ **올바른 기준 답안**: ${res.correctSummary || ''}\n\n`;
                }

                md += `**[정답 및 상세 해설]**\n${q.explanation || '해설 없음'}\n\n`;
                if (q.tip) {
                    md += `💡 **[출제 함정 & 핵심 팁]**\n${q.tip}\n\n`;
                }
                md += `---\n\n`;
                wrongIdx++;
            }
        });

        if (wrongIdx === 1) {
            md += `🎉 축하합니다! 틀린 문제가 전혀 없습니다. 완벽한 실전 합격권입니다!\n`;
        } else {
            md += `### 🤖 [AI 1:1 과외 요청 지침]\n`;
            md += `위 오답 문제들을 하나씩 분석하여 다음을 명확히 과외해 주세요:\n`;
            md += `1. **오답 원인 진단**: 제가 왜 오답 선지를 선택했는지(매력적인 오답 함정 분석)와 어떤 법령/실무 수치·개념을 혼동했는지 짚어주세요.\n`;
            md += `2. **선지별 정오표**: 5개 보기 선지 각각의 옳고 그름(O/X)과 개정 법령 근거를 짚어주세요.\n`;
            md += `3. **1초 족집게 암기 공식**: 실제 시험장에서 절대 틀리지 않도록 핵심 키워드 암기법(두문자/비교 공식)을 제시해 주세요!\n`;
        }

        return md;
    }
};
