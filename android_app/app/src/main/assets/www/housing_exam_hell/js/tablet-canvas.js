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
        this.penWidth = 2.5;
        this.palmRejection = true;

        this.currentQuestionKey = null;
        this.strokes = []; // [ { tool, color, width, points: [{x, y}] } ]
        this.currentStroke = null;

        this.initEvents();
        this.handleResize();
        window.addEventListener('resize', () => this.handleResize());
    }

    handleResize() {
        if (!this.canvas) return;
        const rect = this.canvas.parentElement.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
        this.redraw();
    }

    initEvents() {
        this.canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e));
        this.canvas.addEventListener('pointermove', (e) => this.onPointerMove(e));
        this.canvas.addEventListener('pointerup', (e) => this.onPointerUp(e));
        this.canvas.addEventListener('pointercancel', (e) => this.onPointerUp(e));
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

        // Palm Rejection: Ignore touch if stylus is active
        if (this.palmRejection && e.pointerType === 'touch' && e.isPrimary === false) {
            return;
        }

        this.isDrawing = true;
        this.canvas.setPointerCapture(e.pointerId);

        const pos = this.getPos(e);
        this.currentStroke = {
            tool: this.currentTool,
            color: this.penColor,
            width: this.currentTool === 'eraser' ? 20 : this.penWidth,
            points: [pos]
        };
        this.strokes.push(this.currentStroke);

        this.ctx.beginPath();
        this.ctx.moveTo(pos.x, pos.y);
    }

    onPointerMove(e) {
        if (!this.isDrawing || !this.currentStroke) return;

        const pos = this.getPos(e);
        this.currentStroke.points.push(pos);

        if (this.currentTool === 'eraser') {
            this.ctx.save();
            this.ctx.globalCompositeOperation = 'destination-out';
            this.ctx.beginPath();
            this.ctx.arc(pos.x, pos.y, 15, 0, Math.PI * 2);
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
        this.currentStroke = null;

        // Save strokes to IndexedDB
        if (this.currentQuestionKey) {
            await IDBStore.saveDrawingStrokes(this.currentQuestionKey, this.strokes);
        }
    }

    redraw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        this.strokes.forEach(stroke => {
            if (!stroke.points || stroke.points.length < 2) return;

            this.ctx.save();
            if (stroke.tool === 'eraser') {
                this.ctx.globalCompositeOperation = 'destination-out';
                this.ctx.lineWidth = stroke.width || 20;
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
        this.redraw();
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
        if (this.toolbar) {
            this.toolbar.classList.toggle('active', this.isEnabled);
        }
        return this.isEnabled;
    }
}
