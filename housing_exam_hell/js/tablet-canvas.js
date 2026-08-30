/**
 * Housing Exam Hell - Tablet Stylus & Palm Rejection Canvas Engine
 * Supports S-Pen, Apple Pencil, palm rejection, stroke caching, and drawing tools.
 */

import { IDBStore } from './idb-store.js';

export class TabletCanvas {
    constructor(canvasElement, toolbarContainer) {
        this.canvas = canvasElement;
        this.ctx = canvasElement.getContext('2d');
        this.toolbar = toolbarContainer;

        this.isEnabled = false;
        this.isDrawing = false;
        this.currentTool = 'pen'; // 'pen' | 'eraser'
        this.penColor = '#38BDF8';
        this.penWidth = 3;
        this.palmRejection = true;

        this.currentQuestionKey = null;
        this.strokes = [];
        this.currentStroke = null;

        this.initEvents();
        this.initResizeObserver();
    }

    initResizeObserver() {
        if (!this.canvas || !this.canvas.parentElement) return;
        if (window.ResizeObserver) {
            this.resizeObserver = new ResizeObserver(() => {
                this.handleResize();
            });
            this.resizeObserver.observe(this.canvas.parentElement);
        }
        window.addEventListener('resize', () => this.handleResize());
        window.addEventListener('orientationchange', () => setTimeout(() => this.handleResize(), 150));
    }

    handleResize() {
        if (!this.canvas || !this.canvas.parentElement) return;
        const rect = this.canvas.parentElement.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;

        const dpr = window.devicePixelRatio || 1;
        const targetWidth = Math.round(rect.width);
        const targetHeight = Math.round(rect.height);

        this.canvas.width = targetWidth * dpr;
        this.canvas.height = targetHeight * dpr;
        this.canvas.style.width = targetWidth + 'px';
        this.canvas.style.height = targetHeight + 'px';

        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.redraw();
    }

    initEvents() {
        this.canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e));
        this.canvas.addEventListener('pointermove', (e) => this.onPointerMove(e));
        this.canvas.addEventListener('pointerup', (e) => this.onPointerUp(e));
        this.canvas.addEventListener('pointercancel', (e) => this.onPointerUp(e));

        if (this.toolbar) {
            this.toolbar.querySelectorAll('.stylus-btn[data-tool]').forEach(btn => {
                btn.addEventListener('click', () => {
                    this.toolbar.querySelectorAll('.stylus-btn[data-tool]').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    this.currentTool = btn.dataset.tool;
                });
            });

            this.toolbar.querySelectorAll('.color-dot').forEach(dot => {
                dot.addEventListener('click', () => {
                    this.toolbar.querySelectorAll('.color-dot').forEach(d => d.classList.remove('selected'));
                    dot.classList.add('selected');
                    this.penColor = dot.dataset.color || '#38BDF8';
                    this.currentTool = 'pen';
                    this.toolbar.querySelectorAll('.stylus-btn[data-tool]').forEach(b => {
                        b.classList.toggle('active', b.dataset.tool === 'pen');
                    });
                });
            });

            const clearBtn = document.getElementById('btn-clear-canvas');
            if (clearBtn) {
                clearBtn.addEventListener('click', () => this.clearCurrentStrokes());
            }

            const closeBtn = document.getElementById('btn-close-stylus');
            if (closeBtn) {
                closeBtn.addEventListener('click', () => {
                    this.togglePen(false);
                    const headerPen = document.getElementById('btn-toggle-pen');
                    if (headerPen) headerPen.classList.remove('active');
                });
            }
        }
    }

    getPos(e) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    }

    onPointerDown(e) {
        if (!this.isEnabled) return;

        if (this.palmRejection && e.pointerType === 'touch' && e.isPrimary === false) return;

        // 주관식 빈칸 입력창이나 필기인식 서랍 영역인 경우 캔버스 캡처를 피하고 네이티브 펜/키보드 입력 허용
        this.canvas.style.pointerEvents = 'none';
        const underEl = document.elementFromPoint(e.clientX, e.clientY);
        this.canvas.style.pointerEvents = 'auto';

        if (underEl) {
            const inputTarget = underEl.closest('.blank-input, .hw-drawer, .btn-toggle-hw, .hw-canvas, .hw-cand-chip, .btn-hw-action');
            if (inputTarget) {
                if (inputTarget.classList.contains('blank-input') || inputTarget.tagName === 'INPUT' || inputTarget.tagName === 'TEXTAREA') {
                    inputTarget.focus();
                }
                return;
            }
        }

        this.isDrawing = true;
        this.pointerDownPos = this.getPos(e);
        this.pointerDownClient = { x: e.clientX, y: e.clientY };
        this.pointerDownTime = Date.now();
        this.pointerMoved = false;

        try {
            this.canvas.setPointerCapture(e.pointerId);
        } catch (err) {}

        const pos = this.pointerDownPos;
        this.currentStroke = {
            tool: this.currentTool,
            color: this.penColor,
            width: this.currentTool === 'eraser' ? 24 : this.penWidth,
            points: [pos]
        };
        this.strokes.push(this.currentStroke);

        this.ctx.beginPath();
        this.ctx.moveTo(pos.x, pos.y);
    }

    onPointerMove(e) {
        if (!this.isDrawing || !this.currentStroke) return;

        const pos = this.getPos(e);
        if (this.pointerDownPos) {
            const dist = Math.hypot(pos.x - this.pointerDownPos.x, pos.y - this.pointerDownPos.y);
            if (dist > 5) {
                this.pointerMoved = true;
            }
        }

        this.currentStroke.points.push(pos);

        if (this.currentTool === 'eraser') {
            this.ctx.save();
            this.ctx.globalCompositeOperation = 'destination-out';
            this.ctx.beginPath();
            this.ctx.arc(pos.x, pos.y, 16, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.restore();
        } else {
            this.ctx.save();
            this.ctx.strokeStyle = this.penColor;
            this.ctx.lineWidth = this.penWidth;
            this.ctx.lineCap = 'round';
            this.ctx.lineJoin = 'round';
            this.ctx.lineTo(pos.x, pos.y);
            this.ctx.stroke();
            this.ctx.restore();
        }
    }

    async onPointerUp(e) {
        if (!this.isDrawing) return;
        this.isDrawing = false;

        const stroke = this.currentStroke;
        this.currentStroke = null;

        try {
            if (e && e.pointerId) this.canvas.releasePointerCapture(e.pointerId);
        } catch (err) {}

        const duration = Date.now() - (this.pointerDownTime || 0);
        const totalDist = (stroke && stroke.points && stroke.points.length > 1) ? 
            Math.hypot(
                stroke.points[stroke.points.length - 1].x - stroke.points[0].x,
                stroke.points[stroke.points.length - 1].y - stroke.points[0].y
            ) : 0;

        // If this was a quick tap (< 8px movement and < 350ms), pass click through to underlying buttons/options/inputs
        if (!this.pointerMoved && totalDist < 8 && duration < 350) {
            this.strokes.pop();
            this.redraw();

            this.canvas.style.pointerEvents = 'none';
            const clientX = (e && e.clientX) ? e.clientX : (this.pointerDownClient ? this.pointerDownClient.x : 0);
            const clientY = (e && e.clientY) ? e.clientY : (this.pointerDownClient ? this.pointerDownClient.y : 0);
            const underEl = document.elementFromPoint(clientX, clientY);
            this.canvas.style.pointerEvents = 'auto';

            if (underEl) {
                // 1. 객관식 선지 영역 터치 시: 필기 모드에서는 번호 원(opt-num) 주변을 터치했을 때만 답 선택!
                const optItem = underEl.closest('.option-item');
                if (optItem) {
                    const optNum = optItem.querySelector('.opt-num');
                    if (optNum) {
                        const numRect = optNum.getBoundingClientRect();
                        const centerX = numRect.left + numRect.width / 2;
                        const centerY = numRect.top + numRect.height / 2;
                        const distToCenter = Math.hypot(clientX - centerX, clientY - centerY);
                        // 번호 원 중심으로부터 40px 반경 이내 또는 원을 직접 터치했을 때만 선택
                        if (distToCenter <= 40 || underEl.closest('.opt-num')) {
                            optItem.click();
                        }
                        // 텍스트/여백 터치는 필기/밑줄용이므로 오답/선택 변경 방지
                    }
                    return;
                }

                // 2. 일반 대화형 버튼/입력창 터치 처리
                const targetInteractive = underEl.closest('button, input, textarea, a, .blank-input, .btn-ctrl, .btn-ctrl-sm, .btn-override, .color-dot, .stylus-btn, .btn-toggle-hw');
                if (targetInteractive) {
                    targetInteractive.click();
                    if (['INPUT', 'TEXTAREA'].includes(targetInteractive.tagName)) {
                        targetInteractive.focus();
                    }
                    return;
                }
            }
        }

        if (this.currentQuestionKey) {
            await IDBStore.saveDrawingStrokes(this.currentQuestionKey, this.strokes);
        }
    }

    redraw() {
        const dpr = window.devicePixelRatio || 1;
        const rect = this.canvas.getBoundingClientRect();
        const w = rect.width || this.canvas.width / dpr;
        const h = rect.height || this.canvas.height / dpr;

        this.ctx.clearRect(0, 0, w, h);

        this.strokes.forEach(stroke => {
            if (!stroke.points || stroke.points.length === 0) return;

            this.ctx.save();
            if (stroke.tool === 'eraser') {
                this.ctx.globalCompositeOperation = 'destination-out';
                this.ctx.lineWidth = stroke.width || 24;
            } else {
                this.ctx.strokeStyle = stroke.color || this.penColor;
                this.ctx.lineWidth = stroke.width || this.penWidth;
            }
            this.ctx.lineCap = 'round';
            this.ctx.lineJoin = 'round';

            this.ctx.beginPath();
            this.ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
            for (let i = 1; i < stroke.points.length; i++) {
                this.ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
            }
            this.ctx.stroke();
            this.ctx.restore();
        });
    }

    async loadQuestionStrokes(qKey) {
        this.currentQuestionKey = qKey;
        this.strokes = (await IDBStore.getDrawingStrokes(qKey)) || [];
        this.handleResize();
    }

    async clearCurrentStrokes() {
        this.strokes = [];
        this.redraw();
        if (this.currentQuestionKey) {
            await IDBStore.clearDrawingStrokes(this.currentQuestionKey);
        }
    }

    togglePen(forceState) {
        this.isEnabled = typeof forceState === 'boolean' ? forceState : !this.isEnabled;
        this.canvas.style.pointerEvents = this.isEnabled ? 'auto' : 'none';
        document.body.classList.toggle('stylus-mode-active', this.isEnabled);
        if (this.toolbar) {
            this.toolbar.classList.toggle('active', this.isEnabled);
        }
        if (this.isEnabled) {
            this.handleResize();
        }
        return this.isEnabled;
    }
}
