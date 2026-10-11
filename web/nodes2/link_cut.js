import { app } from "../../../scripts/app.js";

function getSetting(id, defaultValue) {
    const value = app.extensionManager.setting.get(id);
    return value !== undefined ? value : defaultValue;
}

export const createLinkCut = (scope) => ({
    name: "Comfy.LinkCut",

    setup() {
        const canvas = app.canvas;
        let gesture = null;
        let suppressContextMenu = false;
        let ctrlPressed = false;
        let lastPointer = null;
        let pointer = null;
        let highlighted = false;
        const enabled = () => getSetting("LinkCut.Enabled", true);
        const cutDistance = () => getSetting("LinkCut.CutDistance", 4);
        const highlightDistance = () => Math.max(getSetting("LinkCut.HighlightDistance", 12), cutDistance() + 1);
        const trail = document.createElement("canvas");
        trail.className = "link-cut-trail";
        Object.assign(trail.style, { position: "fixed", pointerEvents: "none", zIndex: "10000" });
        const trailCtx = trail.getContext("2d");

        // 命中实际绘制路径，切断宽度默认为 8 个屏幕像素。
        const findSegments = (points, screenWidth = cutDistance() * 2) => {
            const graph = canvas.graph;
            const matches = [];
            const ctx = canvas.ctx;
            const uncovered = points.filter(([x, y]) => !graph.getNodeOnPos(x, y));
            if (!uncovered.length) return matches;
            ctx.save();
            try {
                ctx.setTransform(1, 0, 0, 1, 0, 0);
                ctx.setLineDash([]);
                ctx.lineWidth = screenWidth / canvas.ds.scale;
                ctx.lineCap = "round";
                ctx.lineJoin = "round";
                for (const segment of canvas.renderedPaths) {
                    const exists = segment.linkIds
                        ? [...segment.linkIds].some(id => graph.links[id])
                        : graph.links[segment.id];
                    if (exists && segment.path && uncovered.some(([x, y]) => ctx.isPointInStroke(segment.path, x, y))) {
                        matches.push(segment);
                    }
                }
            } finally {
                ctx.restore();
            }
            return matches;
        };
        const clearHighlight = () => {
            pointer = null;
            if (highlighted) canvas.setDirty(true, false);
            highlighted = false;
        };
        const updatePointer = (event) => {
            lastPointer = { clientX: event.clientX, clientY: event.clientY, target: event.target };
            ctrlPressed = event.ctrlKey;
            const rect = canvas.canvas.getBoundingClientRect();
            if (!ctrlPressed || !enabled() || event.target !== canvas.canvas
                || event.clientX < rect.left || event.clientX >= rect.right
                || event.clientY < rect.top || event.clientY >= rect.bottom) {
                clearHighlight();
                return;
            }
            pointer = { clientX: event.clientX, clientY: event.clientY };
            // 未命中时不重绘；离开连线则立即清除高亮。
            if (highlighted || findSegments([canvas.convertEventToCanvasOffset(pointer)], highlightDistance() * 2).length) {
                canvas.setDirty(true, false);
            } else {
                clearHighlight();
            }
        };
        const previousForeground = canvas.onDrawForeground;
        const drawHighlight = function (ctx, ...args) {
            previousForeground?.call(this, ctx, ...args);
            if (!pointer || !ctrlPressed || !enabled()) return;
            if (document.elementFromPoint(pointer.clientX, pointer.clientY) !== canvas.canvas) {
                clearHighlight();
                return;
            }
            const point = canvas.convertEventToCanvasOffset(pointer);
            const inner = cutDistance(), outer = highlightDistance();
            const segments = findSegments([point], outer * 2);
            if (!segments.length) {
                clearHighlight();
                return;
            }
            highlighted = true;
            // 距离按屏幕像素计算，接近切断边界时最亮。
            // 对实际 Path2D 扩大描边并二分，曲线、折线和转接点使用相同规则。
            const strengths = [];
            ctx.save();
            try {
                ctx.setTransform(1, 0, 0, 1, 0, 0);
                ctx.setLineDash([]);
                ctx.lineCap = ctx.lineJoin = "round";
                for (const segment of segments) {
                    let near = inner;
                    let far = outer;
                    for (let i = 0; i < 6; i++) {
                        const distance = (near + far) / 2;
                        ctx.lineWidth = distance * 2 / canvas.ds.scale;
                        if (ctx.isPointInStroke(segment.path, ...point)) far = distance;
                        else near = distance;
                    }
                    const progress = (outer - far) / (outer - inner);
                    strengths.push(progress * progress * (3 - 2 * progress));
                }
            } finally {
                ctx.restore();
            }
            const color = getSetting("LinkCut.HighlightColor", "#66CCFF");
            const glow = getSetting("LinkCut.GlowStrength", 8);
            ctx.save();
            try {
                // 前景高亮仍遵守节点遮挡，不把被节点盖住的连线画到节点上。
                if (!canvas.graph.config.links_ontop) {
                    for (const node of canvas.visible_nodes) {
                        const clip = new Path2D();
                        clip.rect(...canvas.visible_area);
                        clip.rect(...node.getBounding());
                        ctx.clip(clip, "evenodd");
                    }
                }
                ctx.strokeStyle = color;
                ctx.shadowColor = color;
                // shadowBlur 不随画布变换缩放，单独补偿高 DPI。
                const transform = ctx.getTransform();
                ctx.shadowBlur = glow * Math.hypot(transform.a, transform.b) / canvas.ds.scale;
                ctx.shadowOffsetX = ctx.shadowOffsetY = 0;
                ctx.lineWidth = 3 / canvas.ds.scale;
                ctx.lineCap = ctx.lineJoin = "round";
                ctx.setLineDash([]);
                for (let i = 0; i < segments.length; i++) {
                    ctx.globalAlpha = strengths[i];
                    ctx.stroke(segments[i].path);
                }
            } finally {
                ctx.restore();
            }
        };
        canvas.onDrawForeground = drawHighlight;

        const stopCutting = () => {
            if (!gesture?.cutting) return;
            gesture.cutting = false;
            trail.remove();
            clearHighlight();
            if (gesture.changed) canvas.emitAfterChange();
        };
        const finishGesture = () => {
            if (!gesture) return;
            stopCutting();
            const { element, pointerId, cursor } = gesture;
            gesture = null;
            element.style.cursor = cursor;
            if (element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId);
        };
        const consume = (event) => {
            event.preventDefault();
            event.stopImmediatePropagation();
        };
        const cutSegment = (event) => {
            const end = canvas.convertEventToCanvasOffset(event);
            const next = [event.clientX - gesture.trailRect.left, event.clientY - gesture.trailRect.top];
            if (trail.isConnected) {
                trailCtx.beginPath();
                trailCtx.moveTo(...gesture.trailPoint);
                trailCtx.lineTo(...next);
                trailCtx.stroke();
            }
            gesture.trailPoint = next;
            const { graph, point: start } = gesture;
            const steps = Math.max(1, Math.ceil(Math.hypot(end[0] - start[0], end[1] - start[1]) * canvas.ds.scale / Math.min(3, cutDistance())));
            const points = [];
            for (let i = 0; i <= steps; i++) {
                points.push([start[0] + (end[0] - start[0]) * i / steps, start[1] + (end[1] - start[1]) * i / steps]);
            }
            const linkIds = new Set();
            for (const segment of findSegments(points)) {
                // 转接点前的共用路径可能对应多条逻辑连接。
                if (segment.linkIds) {
                    for (const id of segment.linkIds) linkIds.add(id);
                } else {
                    linkIds.add(segment.id);
                }
            }
            for (const id of linkIds) {
                if (!graph.links[id]) continue;
                if (!gesture.changed) {
                    canvas.emitBeforeChange();
                    gesture.changed = true;
                }
                graph.removeLink(id);
            }
            if (linkIds.size) {
                clearHighlight();
                graph.setDirtyCanvas(true, true);
            }
            gesture.point = end;
        };

        scope.listen(window, "pointerdown", (event) => {
            finishGesture();
            clearHighlight();
            updatePointer(event);
            suppressContextMenu = false;
            if (!enabled()) return;
            if (event.button !== 2 || event.buttons !== 2 || !event.ctrlKey || event.shiftKey || event.altKey || event.metaKey) return;
            if (event.target !== canvas.canvas || canvas.read_only || canvas.selectOnly || !canvas.allow_interaction) return;
            if (canvas.state.ghostNodeId != null) return;
            const point = canvas.convertEventToCanvasOffset(event);
            if (canvas.graph.getNodeOnPos(...point)) return;
            consume(event);
            canvas.canvas.focus();
            app.extensionManager.workflow.activeWorkflow?.changeTracker.captureCanvasState();
            const rect = canvas.canvas.getBoundingClientRect();
            if (getSetting("LinkCut.TrailEnabled", true)) {
                const ratio = window.devicePixelRatio || 1;
                trail.width = Math.ceil(rect.width * ratio);
                trail.height = Math.ceil(rect.height * ratio);
                Object.assign(trail.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
                trailCtx.setTransform(ratio, 0, 0, ratio, 0, 0);
                const color = getSetting("LinkCut.TrailColor", "#FFFFFF");
                trailCtx.strokeStyle = CSS.supports("color", color) ? color : "#FFFFFF";
                trailCtx.lineWidth = getSetting("LinkCut.TrailWidth", 2);
                trailCtx.lineCap = trailCtx.lineJoin = "round";
                document.body.append(trail);
            }
            gesture = {
                graph: canvas.graph, point, cutting: true, changed: false,
                trailRect: rect, trailPoint: [event.clientX - rect.left, event.clientY - rect.top],
                element: canvas.canvas, pointerId: event.pointerId, cursor: canvas.canvas.style.cursor
            };
            suppressContextMenu = true;
            canvas.canvas.style.cursor = "crosshair";
            canvas.canvas.setPointerCapture(event.pointerId);
            updatePointer(event);
        }, true);
        scope.listen(window, "pointermove", (event) => {
            if (!gesture) {
                updatePointer(event);
                return;
            }
            if (event.pointerId !== gesture.pointerId) return;
            consume(event);
            if (!(event.buttons & 2) || canvas.graph !== gesture.graph) {
                finishGesture();
                clearHighlight();
                return;
            }
            if (!event.ctrlKey || !enabled()) stopCutting();
            if (gesture.cutting) {
                for (const sample of event.getCoalescedEvents?.() || []) {
                    cutSegment(sample);
                }
                cutSegment(event);
            }
            updatePointer(event);
        }, true);
        scope.listen(window, "pointerup", (event) => {
            if (!gesture || event.pointerId !== gesture.pointerId) {
                updatePointer(event);
                return;
            }
            consume(event);
            if (gesture.cutting && event.ctrlKey && canvas.graph === gesture.graph) {
                cutSegment(event);
            }
            finishGesture();
            updatePointer(event);
        }, true);
        scope.listen(window, "contextmenu", (event) => {
            if (!suppressContextMenu || event.target !== canvas.canvas) return;
            consume(event);
            suppressContextMenu = false;
        }, true);
        scope.listen(window, "wheel", (event) => {
            clearHighlight();
            if (gesture) consume(event);
        }, { capture: true, passive: false });
        scope.listen(window, "keyup", (event) => {
            if (event.key !== "Control") return;
            ctrlPressed = event.ctrlKey;
            if (!ctrlPressed) {
                stopCutting();
                clearHighlight();
            }
        }, true);
        scope.listen(window, "keydown", (event) => {
            if (event.key === "Control") {
                ctrlPressed = true;
                if (lastPointer) updatePointer({ ...lastPointer, ctrlKey: true });
            }
            if (gesture && event.key !== "Control") finishGesture();
        }, true);
        const resetInteraction = () => { finishGesture(); clearHighlight(); };
        for (const eventName of ["pointercancel", "subgraph-opening", "litegraph:set-graph"]) {
            scope.listen(canvas.canvas, eventName, resetInteraction);
        }
        scope.listen(canvas.canvas, "lostpointercapture", (event) => {
            if (gesture?.pointerId === event.pointerId) resetInteraction();
        });
        scope.listen(canvas.canvas, "pointerleave", () => {
            lastPointer = null;
            clearHighlight();
        });
        scope.listen(window, "blur", () => {
            ctrlPressed = false;
            lastPointer = null;
            resetInteraction();
        });
        scope.listen(window, "resize", resetInteraction);
        scope.listen(app.ui.settings, "LinkCut.Enabled.change", resetInteraction);
        for (const id of ["LinkCut.HighlightColor", "LinkCut.GlowStrength"]) {
            scope.listen(app.ui.settings, `${id}.change`, () => canvas.setDirty(true, false));
        }
        for (const id of ["LinkCut.CutDistance", "LinkCut.HighlightDistance"]) {
            scope.listen(app.ui.settings, `${id}.change`, () => {
                if (lastPointer) updatePointer({ ...lastPointer, ctrlKey: ctrlPressed });
            });
        }
        scope.add(() => {
            resetInteraction();
            if (canvas.onDrawForeground === drawHighlight) canvas.onDrawForeground = previousForeground;
        });
    }
});
