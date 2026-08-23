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
            
            const isAnswered = userAnswers[idx] !== undefined && userAnswers[idx] !== null && userAnswers[idx] !== '';
            const res = results[idx]; // { isCorrect, ... }

            if (res !== undefined) {
                btn.classList.add(res.isCorrect ? 'correct' : 'wrong');
            } else if (isAnswered) {
                btn.classList.add('answered');
            }

            btn.innerHTML = `
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

        let md = `## 📝 [주택관리사 2차] 오답 분석 및 AI 일타 과외 요청서\n\n`;
        md += `- **응시 과목**: ${subject}\n`;
        md += `- **종합 점수**: ${Math.round(score)}점 / 100점 (${score >= 60 ? '🎉 합격권 (PASS)' : '⚠️ 과락주의 (RE-STUDY)'})\n`;
        md += `- **채점 결과**: 맞춤 ${correctCount}개 / 틀림 ${wrongCount}개\n`;
        md += `- **작성 일시**: ${new Date().toLocaleString('ko-KR')}\n\n`;
        md += `### ⚠️ 틀린 문항 정보 및 취약 포인트 목록\n\n`;

        let wrongIdx = 1;
        questions.forEach((q, idx) => {
            const res = results[idx];
            if (res && !res.isCorrect) {
                md += `#### [오답 ${wrongIdx}] (단원: ${q.chapterName}) ${q.question}\n`;
                if (q.passage) {
                    md += `\`\`\`\n${q.passage}\n\`\`\`\n`;
                }

                if (q.type === 'choice') {
                    const uChoice = userAnswers[idx];
                    const tChoice = q.answer;
                    md += `- **나의 선택 오답**: [${uChoice || '미선택'}번] ${q.options[uChoice - 1] || ''}\n`;
                    md += `- **실제 기준 정답**: [${tChoice}번] ${q.options[tChoice - 1] || ''}\n`;
                } else {
                    md += `- **나의 기입 오답**: ${res.userSummary || '(공란)'}\n`;
                    md += `- **올바른 기준 답안**: ${res.correctSummary || ''}\n`;
                }

                md += `- **정답 해설**: ${q.explanation}\n`;
                if (q.tip) {
                    md += `- **출제 함정 팁**: ${q.tip}\n`;
                }
                md += `\n---\n\n`;
                wrongIdx++;
            }
        });

        if (wrongIdx === 1) {
            md += `🎉 축하합니다! 틀린 문제가 전혀 없습니다. 완벽한 실전 합격권입니다!\n`;
        } else {
            md += `### 🤖 [AI 과외 요청 지침]\n`;
            md += `위 오답 데이터들을 분석하여 제가 주로 어떤 법령/실무 개념에서 함정에 빠졌는지 취약점을 짚어주시고, 시험장에서 절대 틀리지 않도록 1문장 핵심 암기 공식과 유사 변형 출제 포인트를 요약해 주세요!\n`;
        }

        return md;
    }
};
