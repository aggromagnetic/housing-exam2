/**
 * Housing Exam Hell - Tablet Stylus & Palm Rejection Canvas Engine
 * Supports S-Pen, Apple Pencil, palm rejection, stroke caching, and drawing tools.
 */

import { IDBStore } from './idb-store.js';

export class TabletCanvas {
    constructor(canvasElement, toolbarContainer) {
        this.canvas = canvasElement;
        try {
            // Low-latency canvas mode: bypasses Android display loop for instantaneous stylus response
            this.ctx = canvasElement.getContext('2d', { desynchronized: true, alpha: true }) || canvasElement.getContext('2d');
        } catch (e) {
            this.ctx = canvasElement.getContext('2d');
        }
        this.toolbar = toolbarContainer;

        this.isEnabled = false;
        this.isDrawing = false;
        this.currentTool = 'pen'; // 'pen' | 'eraser'
        this.penColor = '#38BDF8';
        this.penWidth = 3;
        this.palmRejection = true;
        this.stylusOnly = typeof localStorage !== 'undefined' && localStorage.getItem('housing_exam_stylus_only') === 'true';

        this.currentQuestionKey = null;
        this.strokes = [];
        this.currentStroke = null;
        this.saveTimeout = null;

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

        // Cap DPR at 1.75 on high-density tablet screens to save 60%+ VRAM and fillrate without loss of sharpness
        const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
        const targetWidth = Math.round(rect.width);
        const targetHeight = Math.round(rect.height);

        const newPixelW = Math.round(targetWidth * dpr);
        const newPixelH = Math.round(targetHeight * dpr);

        // Guard against unnecessary buffer clears if pixel dimensions are already identical
        if (this.canvas.width === newPixelW && this.canvas.height === newPixelH) {
            return;
        }

        this.canvas.width = newPixelW;
        this.canvas.height = newPixelH;
        this.canvas.style.width = targetWidth + 'px';
        this.canvas.style.height = targetHeight + 'px';

        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.redraw();
    }

    initEvents() {
        this.canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e));
        this.canvas.addEventListener('pointermove', (e) => this.onPointerMove(e), { passive: true });
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

            const stylusOnlyBtn = document.getElementById('btn-stylus-only');
            if (stylusOnlyBtn) {
                stylusOnlyBtn.classList.toggle('active', this.stylusOnly);
                stylusOnlyBtn.title = this.stylusOnly ? 'S펜 전용 모드 ON (손터치 방지)' : 'S펜 전용 모드 (손터치 방지)';
                stylusOnlyBtn.addEventListener('click', () => {
                    this.stylusOnly = !this.stylusOnly;
                    localStorage.setItem('housing_exam_stylus_only', this.stylusOnly ? 'true' : 'false');
                    stylusOnlyBtn.classList.toggle('active', this.stylusOnly);
                    stylusOnlyBtn.title = this.stylusOnly ? 'S펜 전용 모드 ON (손터치 방지)' : 'S펜 전용 모드 (손터치 방지)';
                    if (typeof showToast === 'function') {
                        showToast(this.stylusOnly ? '✋ S펜 전용 필기 모드 ON (손터치 무시)' : '🖐 터치 필기 허용 모드 ON');
                    }
                });
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

        // S-Pen / Stylus Only Palm Rejection: Ignore touch drawing, allow interactive taps
        if (this.stylusOnly && e.pointerType === 'touch') {
            this.canvas.style.pointerEvents = 'none';
            const underEl = document.elementFromPoint(e.clientX, e.clientY);
            this.canvas.style.pointerEvents = 'auto';
            if (underEl) {
                const interactive = underEl.closest('.opt-num, button, input, textarea, a, .blank-input, .btn-ctrl, .btn-ctrl-sm, .btn-override, .color-dot, .stylus-btn, .btn-toggle-hw');
                if (interactive) {
                    interactive.click();
                    if (['INPUT', 'TEXTAREA'].includes(interactive.tagName)) {
                        interactive.focus();
                    }
                }
            }
            return;
        }

        // 주관식 빈칸 입력창이나 필기인식 서랍 영역인 경우 캔버스 캡처를 피하고 네이티브 펜/키보드 입력 허용
        this.canvas.style.pointerEvents = 'none';
        const underEl = document.elementFromPoint(e.clientX, e.clientY);
        this.canvas.style.pointerEvents = 'auto';

        if (underEl) {
            const inputTarget = underEl.closest('.subjective-container, .blank-row-wrapper, .blank-input, .hw-drawer, .btn-toggle-hw, .hw-canvas, .hw-cand-chip, .btn-hw-action');
            if (inputTarget) {
                this.isDrawing = false;
                this.currentStroke = null;
                const realInput = underEl.closest('input, textarea') || inputTarget.querySelector('input, textarea');
                if (realInput) {
                    realInput.focus();
                }
                return;
            }
        }

        // Hit-test interactive target (option circles, buttons, toolbar dots, controls)
        let interactiveTarget = null;
        if (underEl) {
            const optItem = underEl.closest('.option-item');
            if (optItem) {
                const optNum = optItem.querySelector('.opt-num');
                if (optNum) {
                    const numRect = optNum.getBoundingClientRect();
                    const centerX = numRect.left + numRect.width / 2;
                    const centerY = numRect.top + numRect.height / 2;
                    const distToCenter = Math.hypot(e.clientX - centerX, e.clientY - centerY);
                    if (distToCenter <= 36 || underEl.closest('.opt-num')) {
                        interactiveTarget = optNum;
                    }
                }
            } else {
                const btn = underEl.closest('button, input, textarea, a, .blank-input, .btn-ctrl, .btn-ctrl-sm, .btn-override, .color-dot, .stylus-btn, .btn-toggle-hw, .stylus-drag-handle, .nav-btn, .tab-btn');
                if (btn) {
                    interactiveTarget = btn;
                }
            }
        }

        this.isDrawing = true;
        this.pointerDownPos = this.getPos(e);
        this.pointerDownClient = { x: e.clientX, y: e.clientY };
        this.pointerDownTime = Date.now();
        this.pointerMoved = false;
        this.targetInteractiveEl = interactiveTarget;
        this.isPendingInteractive = !!interactiveTarget;

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

        // If starting on a button or option number, suppress live ink preview until deliberate movement (>26px)
        if (!this.isPendingInteractive) {
            this.strokes.push(this.currentStroke);
            this.ctx.beginPath();
            this.ctx.moveTo(pos.x, pos.y);
        }
    }

    onPointerMove(e) {
        if (!this.isDrawing || !this.currentStroke) return;
        if (this.stylusOnly && e.pointerType === 'touch') return;

        const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [e];
        for (const subEvent of events) {
            const pos = this.getPos(subEvent);
            let dist = 0;
            if (this.pointerDownPos) {
                dist = Math.hypot(pos.x - this.pointerDownPos.x, pos.y - this.pointerDownPos.y);
                if (dist > 5) {
                    this.pointerMoved = true;
                }
            }

            // If started on an interactive element:
            if (this.isPendingInteractive) {
                if (dist > 26) {
                    // Stylus moved more than 26px: intentional scratch/cross-out gesture! Convert to drawing stroke
                    this.isPendingInteractive = false;
                    this.targetInteractiveEl = null;
                    this.strokes.push(this.currentStroke);
                    this.ctx.beginPath();
                    this.ctx.moveTo(this.pointerDownPos.x, this.pointerDownPos.y);
                } else {
                    // Small stylus tip slip on tablet glass: suppress ink drawing
                    return;
                }
            }

            this.currentStroke.points.push(pos);

            if (this.currentTool === 'eraser') {
                this.ctx.save();
                this.ctx.globalCompositeOperation = 'destination-out';
                this.ctx.beginPath();
                this.ctx.arc(pos.x, pos.y, 18, 0, Math.PI * 2);
                this.ctx.fill();
                this.ctx.restore();
            } else {
                const pts = this.currentStroke.points;
                const prev = pts.length >= 2 ? pts[pts.length - 2] : pos;
                this.ctx.save();
                this.ctx.strokeStyle = this.penColor;
                this.ctx.lineWidth = this.penWidth;
                this.ctx.lineCap = 'round';
                this.ctx.lineJoin = 'round';
                this.ctx.beginPath();
                this.ctx.moveTo(prev.x, prev.y);
                this.ctx.lineTo(pos.x, pos.y);
                this.ctx.stroke();
                this.ctx.restore();
            }
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
        const clientX = (e && e.clientX) ? e.clientX : (this.pointerDownClient ? this.pointerDownClient.x : 0);
        const clientY = (e && e.clientY) ? e.clientY : (this.pointerDownClient ? this.pointerDownClient.y : 0);
        const totalDist = (this.pointerDownPos && e) ? 
            Math.hypot(this.getPos(e).x - this.pointerDownPos.x, this.getPos(e).y - this.pointerDownPos.y) : 0;

        // 1. Pending Interactive Target (Button / Option circle tapped directly)
        if (this.isPendingInteractive && this.targetInteractiveEl) {
            const target = this.targetInteractiveEl;
            this.isPendingInteractive = false;
            this.targetInteractiveEl = null;

            if (totalDist <= 26 && duration <= 650) {
                target.click();
                if (['INPUT', 'TEXTAREA'].includes(target.tagName)) {
                    target.focus();
                }
                return;
            } else {
                // Exceeded threshold without previous move promotion: restore stroke
                this.strokes.push(stroke);
                this.redraw();
            }
        }

        // 2. Fallback quick tap check for empty canvas or small stylus taps (< 14px movement and < 400ms)
        if ((!this.pointerMoved || totalDist < 14) && duration < 400) {
            this.canvas.style.pointerEvents = 'none';
            const underEl = document.elementFromPoint(clientX, clientY);
            this.canvas.style.pointerEvents = 'auto';

            if (underEl) {
                const optItem = underEl.closest('.option-item');
                if (optItem) {
                    const optNum = optItem.querySelector('.opt-num');
                    let isNumClicked = false;
                    if (optNum) {
                        const numRect = optNum.getBoundingClientRect();
                        const centerX = numRect.left + numRect.width / 2;
                        const centerY = numRect.top + numRect.height / 2;
                        const distToCenter = Math.hypot(clientX - centerX, clientY - centerY);
                        if (distToCenter <= 36 || underEl.closest('.opt-num')) {
                            isNumClicked = true;
                        }
                    }
                    if (isNumClicked && optNum) {
                        // Discard accidental ink dot and cleanly select option
                        const idx = this.strokes.indexOf(stroke);
                        if (idx !== -1) this.strokes.splice(idx, 1);
                        this.redraw();
                        optNum.click();
                        return;
                    }
                } else {
                    const targetInteractive = underEl.closest('button, input, textarea, a, .blank-input, .btn-ctrl, .btn-ctrl-sm, .btn-override, .color-dot, .stylus-btn, .btn-toggle-hw, .stylus-drag-handle, .nav-btn, .tab-btn');
                    if (targetInteractive) {
                        const idx = this.strokes.indexOf(stroke);
                        if (idx !== -1) this.strokes.splice(idx, 1);
                        this.redraw();
                        targetInteractive.click();
                        if (['INPUT', 'TEXTAREA'].includes(targetInteractive.tagName)) {
                            targetInteractive.focus();
                        }
                        return;
                    }
                }
            }
        }

        if (this.currentQuestionKey) {
            if (this.saveTimeout) clearTimeout(this.saveTimeout);
            const qKey = this.currentQuestionKey;
            const currentStrokes = [...this.strokes];
            this.saveTimeout = setTimeout(async () => {
                await IDBStore.saveDrawingStrokes(qKey, currentStrokes);
            }, 300);
        }
    }

    redraw() {
        const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
        const rect = this.canvas.getBoundingClientRect();
        const w = rect.width || (this.canvas.width / dpr);
        const h = rect.height || (this.canvas.height / dpr);

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
        if (this.saveTimeout && this.currentQuestionKey) {
            clearTimeout(this.saveTimeout);
            this.saveTimeout = null;
            await IDBStore.saveDrawingStrokes(this.currentQuestionKey, this.strokes);
        }
        this.currentQuestionKey = qKey;
        this.strokes = (await IDBStore.getDrawingStrokes(qKey)) || [];
        this.handleResize();
    }

    async clearCurrentStrokes() {
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
            this.saveTimeout = null;
        }
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
