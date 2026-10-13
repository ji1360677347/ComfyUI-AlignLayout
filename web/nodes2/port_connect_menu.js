import { app } from "../../../scripts/app.js";
import { isEditing } from "../runtime.js";

function getSetting(id, defaultValue) {
    const value = app.extensionManager.setting.get(id);
    return value !== undefined ? value : defaultValue;
}

const slotName = (slot) => slot.label || slot.localized_name || slot.name;

const menuStyle = `
.port-connect-menu-grab, .port-connect-menu-grab * { cursor: grab !important; }
.port-connect-menu-panning, .port-connect-menu-panning * { cursor: grabbing !important; }
.port-connect-menu-overlay { position: fixed; inset: 0; z-index: 10000; pointer-events: none; }
.port-connect-menu {
    position: fixed; box-sizing: border-box; pointer-events: auto; display: flex; flex-direction: column;
    background: var(--comfy-menu-bg, #252525); color: var(--fg-color, #eee);
    border: 1px solid var(--border-color, #555); border-radius: 8px;
    box-shadow: 0 6px 24px #0008; padding: 10px; gap: 8px;
    font: var(--port-connect-font-size, 12px)/var(--port-connect-line-height, 14px) Arial, sans-serif;
    max-height: calc(100vh - 16px); max-width: min(var(--port-connect-max-width, 360px), calc(100vw - 16px));
}
.port-connect-menu-title { overflow-wrap: anywhere; font-weight: bold; }
.port-connect-menu-filter { width: 100%; box-sizing: border-box; padding: 7px 9px; border-radius: 4px;
    border: 1px solid var(--border-color, #555); background: var(--comfy-input-bg, #171717); color: inherit; flex-shrink: 0; }
.port-connect-menu-list { overflow-y: auto; max-height: 55vh; min-height: 0; }
.port-connect-menu-item { display: grid; grid-template-columns: calc(var(--port-connect-id-width) + 8px) minmax(0, 1fr);
    gap: 4px; width: 100%; box-sizing: border-box; text-align: left; padding: 6px 8px; border: 0; border-radius: 4px;
    background: transparent; font: inherit; cursor: pointer; color: #aaa; }
.port-connect-menu-item:hover, .port-connect-menu-item:focus-visible { background: #2a60a8; }
.port-connect-menu-id { font-variant-numeric: tabular-nums; }
.port-connect-menu-node { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.port-connect-menu-message { color: var(--descrip-text, #aaa); line-height: 16px; }
.port-connect-menu-wire { position: fixed; inset: 0; z-index: 10002; width: 100vw; height: 100vh; pointer-events: none; }
.port-connect-menu-target { position: fixed; z-index: 9999; pointer-events: none; border: 2px solid #66ccff;
    border-radius: 8px; box-shadow: 0 0 8px #66ccff88; box-sizing: border-box; }
`;

export const createPortConnectMenu = (scope) => ({
    name: "Comfy.PortConnectMenu",

    setup() {
        const canvas = app.canvas;
        let connection = null, pressed = null, nativeDrag = null, handingOff = false, pan = null, overlay = null, menu = null;
        let savedView = null, focusView = null, focus = null, animation = null, returnView = null, frame = null;
        let positionMenu = null, updateMenuStyle = null, hoverTimer = null, hoverNode = null, hoverPoint = null;
        let leaveTimer = null, lastPointer = null, spacePressed = false, spaceHandled = false, suppressContextMenu = false, suppressClick = false;
        const enabled = () => getSetting("PortConnectMenu.Enabled", true);
        const sourceHoverZoom = () => getSetting("PortConnectMenu.SourceHoverZoom", true);
        const targetHoverZoom = () => getSetting("PortConnectMenu.TargetHoverZoom", true);
        const interactive = (allowPan = false) => enabled() && (!canvas.read_only || allowPan) && !canvas.selectOnly && canvas.allow_interaction
            && canvas.state.ghostNodeId == null;
        const text = (zh, en) => getSetting("Comfy.Locale", "en").startsWith("zh") ? zh : en;
        const style = document.createElement("style"); style.textContent = menuStyle; document.head.append(style);
        const wire = document.createElement("canvas"); wire.className = "port-connect-menu-wire";
        const wireCtx = wire.getContext("2d");
        const targetGlow = document.createElement("div"); targetGlow.className = "port-connect-menu-target";
        const updateGlow = () => {
            const value = getSetting("PortConnectMenu.HighlightColor", "#66CCFF");
            const color = CSS.supports("color", value) ? value : "#66CCFF";
            const strength = getSetting("PortConnectMenu.GlowStrength", 8);
            targetGlow.style.borderColor = color;
            targetGlow.style.boxShadow = strength ? `0 0 ${strength}px color-mix(in srgb, ${color} 53.3333%, transparent)` : "none";
        };
        updateGlow();
        const consume = event => { event.preventDefault(); event.stopImmediatePropagation(); };
        const cancelHover = () => { clearTimeout(hoverTimer); hoverTimer = hoverNode = hoverPoint = null; };
        const cancelLeave = () => { clearTimeout(leaveTimer); leaveTimer = null; };
        const rememberPointer = event => { lastPointer = { clientX: event.clientX, clientY: event.clientY, ctrlKey: event.ctrlKey,
            shiftKey: event.shiftKey, altKey: event.altKey, metaKey: event.metaKey, buttons: event.buttons || 0 }; };
        const validPort = port => port.graph === canvas.graph && port.graph.getNodeById(port.node.id) === port.node
            && (port.input ? port.node.inputs : port.node.outputs)[port.index] === port.slot;
        const compatible = (from, to) => from.input !== to.input && from.node !== to.node
            && LiteGraph.isValidConnection(from.input ? to.slot.type : from.slot.type, from.input ? from.slot.type : to.slot.type);
        const nodeElement = node => document.querySelector(`.lg-node[data-node-id="${CSS.escape(String(node.id))}"]`);
        const boundsOf = node => {
            const element = getSetting("Comfy.VueNodes.Enabled", false) && nodeElement(node);
            if (element) {
                const rect = element.getBoundingClientRect(), main = canvas.canvas.getBoundingClientRect();
                if (rect.width && rect.height) return [(rect.left - main.left) / canvas.ds.scale - canvas.ds.offset[0],
                    (rect.top - main.top) / canvas.ds.scale - canvas.ds.offset[1], rect.width / canvas.ds.scale, rect.height / canvas.ds.scale];
            }
            return node.getBounding();
        };
        const slotPosition = (node, input, index) => {
            const dot = getSetting("Comfy.VueNodes.Enabled", false) && nodeElement(node)
                ?.querySelector(`[data-slot-key="${CSS.escape(`${node.id}-${input ? "in" : "out"}-${index}`)}"]`);
            if (!dot) return input ? node.getInputPos(index) : node.getOutputPos(index);
            const rect = dot.getBoundingClientRect(), main = canvas.canvas.getBoundingClientRect();
            return [(rect.left + rect.width / 2 - main.left) / canvas.ds.scale - canvas.ds.offset[0],
                (rect.top + rect.height / 2 - main.top) / canvas.ds.scale - canvas.ds.offset[1]];
        };
        const nodeAt = event => {
            const element = document.elementFromPoint(event.clientX, event.clientY);
            if (!element || element.closest(".port-connect-menu-overlay")) return null;
            const native = element.closest(".lg-node[data-node-id]");
            if (native) return canvas.graph._nodes.find(node => String(node.id) === native.dataset.nodeId) || null;
            const node = canvas.graph.getNodeOnPos(...canvas.convertEventToCanvasOffset(event));
            if (element === canvas.canvas) return node;
            if (node && ((node.widgets || []).some(widget => widget.element?.contains(element))
                || Object.values(node).some(value => value instanceof HTMLElement && value.contains(element)))) return node;
            return null;
        };
        const portAt = event => {
            const element = document.elementFromPoint(event.clientX, event.clientY), node = nodeAt(event);
            if (!node || node.flags.collapsed) return null;
            const dot = element?.closest(connection && !connection.from.input ? ".lg-slot, .lg-node-widget" : ".lg-slot")
                ?.querySelector("[data-slot-key]");
            if (dot) {
                const parts = dot.dataset.slotKey.split("-");
                const input = parts.at(-2) === "in", index = Number(parts.at(-1));
                const slot = (input ? node.inputs : node.outputs)[index];
                if (slot) return { graph: canvas.graph, node, input, index, slot };
            }
            const point = canvas.convertEventToCanvasOffset(event);
            const hit = node.getSlotInPosition(...point);
            if (hit) return { graph: canvas.graph, node, slot: hit.input || hit.output, index: hit.slot, input: !!hit.input };
            if (connection && !connection.from.input) {
                const slot = node.getSlotFromWidget(node.getWidgetOnPos(...point, true));
                if (slot) return { graph: canvas.graph, node, input: true, index: node.inputs.indexOf(slot), slot };
            }
            return null;
        };
        const releasePointer = () => {
            const id = pressed?.pointerId; pressed = null;
            if (id != null && canvas.canvas.hasPointerCapture(id)) canvas.canvas.releasePointerCapture(id);
        };
        const readView = () => ({ graph: canvas.graph, scale: canvas.ds.scale, offset: [...canvas.ds.offset] });
        const saveView = () => { if (!savedView) savedView = readView(); };
        const viewArea = () => {
            const rect = canvas.canvas.getBoundingClientRect();
            const panel = document.querySelector(".graph-canvas-panel")?.getBoundingClientRect();
            return panel?.width && panel.height ? { left: Math.max(rect.left, panel.left), top: Math.max(rect.top, panel.top),
                right: Math.min(rect.right, panel.right, window.innerWidth), bottom: Math.min(rect.bottom, panel.bottom, window.innerHeight) } : rect;
        };
        const applyView = (scale, offset) => {
            canvas.ds.scale = scale; canvas.ds.offset[0] = offset[0]; canvas.ds.offset[1] = offset[1];
            canvas.setDirty(true, true);
        };
        const animateTo = (scale, offset) => {
            const duration = getSetting("PortConnectMenu.AnimationDuration", 180);
            animation = duration > 0 && (canvas.ds.scale !== scale || offset.some((value, i) => value !== canvas.ds.offset[i]))
                ? { started: performance.now(), duration, scale: canvas.ds.scale, offset: [...canvas.ds.offset],
                    toScale: scale, toOffset: [...offset] } : null;
            if (animation) startPaint();
            else applyView(scale, offset);
        };
        const cancelReturn = () => {
            if (!returnView) return;
            returnView = animation = null;
            if (frame !== null) cancelAnimationFrame(frame);
            frame = null;
        };
        const updateGrabCursor = () => {
            document.body.classList.toggle("port-connect-menu-grab", !!connection && spacePressed);
            document.body.classList.toggle("port-connect-menu-panning", !!pan);
        };
        const endPan = () => {
            if (!pan) return;
            const { pointerId, cursor, dragging } = pan;
            pan = null;
            updateGrabCursor();
            canvas.dragging_canvas = dragging;
            canvas.canvas.style.cursor = cursor;
            if (canvas.canvas.hasPointerCapture(pointerId)) canvas.canvas.releasePointerCapture(pointerId);
        };
        const beginPan = (event, button) => {
            // 插件接线没有启动原生 pointer 状态，独立处理抓手，避免 Ctrl＋空格被框选截获。
            cancelHover(); cancelLeave(); closeMenu();
            focusView = focus = animation = null; targetGlow.remove();
            pan = { pointerId: event.pointerId, button, x: event.clientX, y: event.clientY,
                cursor: canvas.canvas.style.cursor, dragging: canvas.dragging_canvas };
            pressed = null;
            updateGrabCursor();
            canvas.canvas.setPointerCapture(event.pointerId);
            canvas.dragging_canvas = true;
            canvas.canvas.style.cursor = "grabbing";
            canvas.canvas.focus({ preventScroll: true });
        };
        const restoreView = (finish = false, smooth = false) => {
            const view = finish ? savedView || returnView : focusView;
            returnView = null;
            cancelLeave(); animation = focus = null; targetGlow.remove();
            if (view?.graph === canvas.graph) {
                if (smooth === true) {
                    returnView = view;
                    animateTo(view.scale, view.offset);
                    if (!animation) returnView = null;
                } else applyView(view.scale, view.offset);
            }
            focusView = null;
            if (!connection) savedView = null;
            paintWire();
        };
        const closeMenu = () => { menu?.remove(); menu = null; positionMenu = updateMenuStyle = null; };
        const reset = (smooth = false) => {
            nativeDrag = null;
            cancelHover(); endPan(); releasePointer(); connection = null; updateGrabCursor(); restoreView(true, smooth); closeMenu();
            overlay?.remove(); overlay = null; wire.remove();
            if (!animation) {
                if (frame !== null) cancelAnimationFrame(frame);
                frame = null;
            }
            canvas.setDirty(true, true);
        };
        const ensureOverlay = () => {
            if (overlay) return;
            overlay = document.createElement("div"); overlay.className = "port-connect-menu-overlay"; document.body.append(overlay);
        };
        const insideFocus = event => {
            if (!focus) return false;
            const [x, y, width, height] = boundsOf(focus.node), rect = canvas.canvas.getBoundingClientRect();
            const left = rect.left + (x + canvas.ds.offset[0]) * canvas.ds.scale;
            const top = rect.top + (y + canvas.ds.offset[1]) * canvas.ds.scale;
            return event.clientX >= left - 18 && event.clientX <= left + width * canvas.ds.scale + 18
                && event.clientY >= top - 18 && event.clientY <= top + height * canvas.ds.scale + 18;
        };
        const paintCompatiblePorts = () => {
            const node = nodeAt(lastPointer);
            if (!node || node === connection.from.node || node.flags.collapsed || pan || spacePressed) return;
            const input = !connection.from.input, slots = input ? node.inputs : node.outputs;
            const main = canvas.canvas.getBoundingClientRect(), scale = canvas.ds.scale;
            const active = portAt(lastPointer), element = getSetting("Comfy.VueNodes.Enabled", false) ? nodeElement(node) : null;
            const color = targetGlow.style.borderColor, glow = getSetting("PortConnectMenu.GlowStrength", 8);
            wireCtx.save();
            wireCtx.strokeStyle = wireCtx.fillStyle = wireCtx.shadowColor = color;
            wireCtx.shadowBlur = glow * (window.devicePixelRatio || 1);
            wireCtx.lineWidth = 1.5;
            for (let index = 0; index < slots.length; index++) {
                const slot = slots[index];
                if (!compatible(connection.from, { node, input, index, slot })) continue;
                const selected = active?.input === input && active.index === index;
                const point = slotPosition(node, input, index);
                const x = main.left + (point[0] + canvas.ds.offset[0]) * scale;
                const y = main.top + (point[1] + canvas.ds.offset[1]) * scale;
                wireCtx.lineWidth = selected ? 2.5 : 1.5;
                wireCtx.beginPath(); wireCtx.arc(x, y, selected ? 7 : 5, 0, Math.PI * 2);
                wireCtx.globalAlpha = selected ? .4 : .2; wireCtx.fill();
                wireCtx.globalAlpha = 1; wireCtx.stroke();
                const widget = input && node.getWidgetFromSlot(slot);
                if (!widget || !node.isWidgetVisible(widget)) continue;
                const row = element?.querySelector(`[data-slot-key="${CSS.escape(`${node.id}-in-${index}`)}"]`)
                    ?.closest(".lg-node-widget")?.getBoundingClientRect();
                const left = row ? row.left + 12 : main.left + (node.pos[0] + 6 + canvas.ds.offset[0]) * scale;
                const top = row ? row.top : main.top + (node.pos[1] + (widget.last_y ?? widget.y) + canvas.ds.offset[1]) * scale;
                const width = row ? row.width - 16 : ((widget.width || node.size[0]) - 12) * scale;
                const height = row ? row.height : (widget.computedHeight ?? widget.computeSize?.(node.size[0])[1] ?? LiteGraph.NODE_WIDGET_HEIGHT) * scale;
                if (!(width > 0 && height > 0 && Number.isFinite(top))) continue;
                wireCtx.globalAlpha = selected ? 1 : .65;
                wireCtx.beginPath(); wireCtx.roundRect(left, top, width, height, Math.min(4, height / 2)); wireCtx.stroke();
                wireCtx.globalAlpha = 1;
            }
            wireCtx.restore();
        };
        const paintWire = () => {
            if (!connection || !lastPointer) return;
            const dpr = window.devicePixelRatio || 1;
            const width = Math.round(window.innerWidth * dpr), height = Math.round(window.innerHeight * dpr);
            if (wire.width !== width || wire.height !== height) { wire.width = width; wire.height = height; }
            wireCtx.setTransform(1, 0, 0, 1, 0, 0);
            wireCtx.clearRect(0, 0, width, height);
            wireCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
            paintCompatiblePorts();
            const from = connection.from, main = canvas.canvas.getBoundingClientRect();
            const point = slotPosition(from.node, from.input, from.index);
            let start = [main.left + (point[0] + canvas.ds.offset[0]) * canvas.ds.scale,
                main.top + (point[1] + canvas.ds.offset[1]) * canvas.ds.scale];
            const end = [lastPointer.clientX, lastPointer.clientY];
            const output = from.input ? end : start, input = from.input ? start : end;
            const renderer = Object.create(canvas);
            renderer.ds = { scale: 1 };
            Object.defineProperty(renderer, "low_quality", { value: false });
            renderer.render_connection_arrows = false;
            const color = canvas.constructor.link_type_colors[from.slot.type] || "#66CCFF";
            renderer.renderLink(wireCtx, output, input, null, false, 0, color, LiteGraph.RIGHT, LiteGraph.LEFT);
            wireCtx.fillStyle = color;
            wireCtx.beginPath(); wireCtx.arc(...end, 4, 0, Math.PI * 2); wireCtx.fill();
            wire.dataset.pointerX = end[0]; wire.dataset.pointerY = end[1];
        };
        const connectPorts = (from, to) => {
            if (!interactive() || !validPort(from) || !validPort(to) || !compatible(from, to)) return null;
            const output = from.input ? to : from, input = from.input ? from : to;
            const existing = from.graph.links[input.slot.link];
            if (existing?.origin_id === output.node.id && existing.origin_slot === output.index) return existing;
            app.extensionManager.workflow.activeWorkflow?.changeTracker.captureCanvasState();
            canvas.emitBeforeChange();
            try { return output.node.connect(output.index, input.node, input.index); }
            finally { canvas.emitAfterChange(); canvas.setDirty(true, true); }
        };
        const paint = time => {
            frame = null;
            if (returnView ? returnView.graph !== canvas.graph
                : !interactive(!!connection && (spacePressed || !!pan)) || (connection && !validPort(connection.from)) || (savedView && savedView.graph !== canvas.graph)) { reset(); return; }
            if (focus && canvas.graph.getNodeById(focus.node.id) !== focus.node) restoreView();
            if (animation) {
                const t = Math.min(1, (time - animation.started) / animation.duration), eased = 1 - (1 - t) ** 3;
                const scale = animation.scale + (animation.toScale - animation.scale) * eased;
                applyView(scale, animation.offset.map((value, i) =>
                    (value * animation.scale * (1 - eased) + animation.toOffset[i] * animation.toScale * eased) / scale));
                if (t === 1) { applyView(animation.toScale, animation.toOffset); animation = returnView = null; }
            }
            if (focus) {
                const [x, y, width, height] = boundsOf(focus.node), rect = canvas.canvas.getBoundingClientRect();
                Object.assign(targetGlow.style, { left: `${rect.left + (x + canvas.ds.offset[0]) * canvas.ds.scale}px`,
                    top: `${rect.top + (y + canvas.ds.offset[1]) * canvas.ds.scale}px`,
                    width: `${width * canvas.ds.scale}px`, height: `${height * canvas.ds.scale}px` });
                if (!targetGlow.isConnected) document.body.append(targetGlow);
            }
            paintWire();
            if (connection || focus || animation) frame = requestAnimationFrame(paint);
        };
        const startPaint = () => { if (frame === null) frame = requestAnimationFrame(paint); };
        const focusNode = (node, anchor, reason) => {
            if (!interactive() || canvas.graph.getNodeById(node.id) !== node) return;
            if (focus?.node === node && focus.reason === reason) { cancelLeave(); return; }
            cancelLeave(); saveView();
            if (!focusView) focusView = readView();
            const rect = canvas.canvas.getBoundingClientRect(), area = viewArea(), [x, y, width, height] = boundsOf(node);
            const menuRect = menu?.getBoundingClientRect();
            const left = menuRect ? Math.max(area.left + 16, menuRect.right + 24) : area.left + 24;
            const right = area.right - 24;
            const top = Math.max(area.top, 0) + 24, bottom = area.bottom - 24;
            const scale = Math.max(.1, Math.min(Math.max(getSetting("PortConnectMenu.PreviewZoom", 125) / 100, focusView.scale), Math.max(40, right - left) / width));
            let screenX, screenY;
            if (menuRect) {
                screenX = left;
                screenY = Math.max(top, Math.min(menuRect.top, bottom - height * scale));
            } else {
                const point = canvas.convertEventToCanvasOffset(anchor);
                screenX = anchor.clientX - (point[0] - x) * scale;
                screenY = anchor.clientY - (point[1] - y) * scale;
                screenX = Math.max(left, Math.min(screenX, right - width * scale));
                const anchoredTop = Math.min(top, Math.max(rect.top + 24, screenY));
                screenY = Math.max(anchoredTop, Math.min(screenY, bottom - Math.min(height * scale, bottom - anchoredTop)));
            }
            const duration = getSetting("PortConnectMenu.AnimationDuration", 180);
            const offset = [(screenX - rect.left) / scale - x, (screenY - rect.top) / scale - y];
            focus = { node, reason, anchor: { clientX: anchor.clientX, clientY: anchor.clientY },
                settled: performance.now() + Math.max(250, duration + 70) };
            animateTo(scale, offset);
            startPaint();
        };
        const refocus = () => {
            if (focus) { const previous = focus; focus = null; focusNode(previous.node, previous.anchor, previous.reason); }
        };
        const confirm = to => {
            if (!connection || !validPort(to) || !compatible(connection.from, to)) return false;
            const previousView = readView(), previousFocus = focus, previousFocusView = focusView, previousAnimation = animation;
            // 在原视图记录撤销状态，避免 Ctrl+Z 跳回临时放大的位置。
            restoreView(true);
            if (connectPorts(connection.from, to)) {
                applyView(previousView.scale, previousView.offset);
                reset(true); canvas.canvas.focus(); return true;
            }
            connection.error = text("无法连接：端口已变化，或节点拒绝了连接。", "Unable to connect: ports changed or the node rejected the connection.");
            const message = menu?.querySelector(".port-connect-menu-message");
            if (message) message.textContent = connection.error;
            if (previousView.graph === canvas.graph) {
                applyView(previousView.scale, previousView.offset);
                focus = previousFocus; focusView = previousFocusView; animation = previousAnimation;
                paintWire();
            }
            return false;
        };
        const begin = (from, event) => {
            if (!validPort(from)) return;
            cancelHover(); cancelLeave(); closeMenu(); saveView();
            connection = { from };
            updateGrabCursor();
            rememberPointer(event);
            pressed = { pointerId: event.pointerId, start: [event.clientX, event.clientY], initial: true };
            canvas.canvas.setPointerCapture(event.pointerId); document.body.append(wire);
            paintWire(); startPaint(); canvas.canvas.focus();
        };
        const lockNativeDrag = () => {
            if (!nativeDrag || connection || !interactive() || !validPort(nativeDrag.from)
                || lastPointer?.buttons !== 1 || !canvas.linkConnector.isConnecting || spacePressed) return false;
            const drag = nativeDrag;
            nativeDrag = null;
            // Vue 端口拖线有独立的监听和自动平移，取消其会话后再接管，原有连线保留。
            handingOff = true;
            try {
                window.dispatchEvent(new PointerEvent("pointercancel", { pointerId: drag.pointerId,
                    clientX: lastPointer.clientX, clientY: lastPointer.clientY }));
                canvas.pointer.reset();
                canvas.linkConnector.reset(true);
            } finally { handingOff = false; }
            savedView = drag.view;
            begin(drag.from, { ...lastPointer, ctrlKey: true, pointerId: drag.pointerId });
            canvas.setDirty(true, true);
            return true;
        };
        const showMenu = event => {
            cancelHover(); closeMenu(); restoreView(); ensureOverlay();
            const from = connection.from;
            const candidates = from.graph._nodes.filter(node => node !== from.node && (from.input ? node.outputs : node.inputs)
                .some((slot, index) => compatible(from, { node, input: !from.input, index, slot })));
            candidates.sort((a, b) => a.title.localeCompare(b.title) || String(a.id).localeCompare(String(b.id), undefined, { numeric: true }));
            menu = document.createElement("div"); menu.className = "port-connect-menu";
            menu.setAttribute("role", "dialog"); menu.setAttribute("aria-label", text("选择目标节点", "Choose a target node"));
            const title = document.createElement("div"); title.className = "port-connect-menu-title";
            title.textContent = `#${from.node.id} ${from.node.title} · ${slotName(from.slot)} (${from.slot.type})`;
            const filter = document.createElement("input"); filter.type = "search"; filter.className = "port-connect-menu-filter";
            filter.placeholder = text("筛选节点名称或编号…", "Filter node names or IDs…"); filter.setAttribute("aria-label", filter.placeholder);
            const list = document.createElement("div"); list.className = "port-connect-menu-list";
            const idWidth = candidates.reduce((width, node) => Math.max(width, String(node.id).length + 1), 2);
            list.style.setProperty("--port-connect-id-width", `${idWidth}ch`);
            const message = document.createElement("div"); message.className = "port-connect-menu-message";
            const anchor = { clientX: event.clientX, clientY: event.clientY };
            let naturalWidth = 160;
            positionMenu = () => {
                const area = viewArea();
                menu.style.width = `${Math.min(naturalWidth, Math.max(80, area.right - area.left - 160))}px`;
                const rect = menu.getBoundingClientRect();
                const remaining = area.right - area.left - rect.width - 48;
                const reserved = Math.max(0, Math.min(420, remaining));
                Object.assign(menu.style, { left: `${Math.max(8, area.left + 8, Math.min(anchor.clientX, area.right - rect.width - reserved - 8))}px`,
                    top: `${Math.max(8, area.top + 8, Math.min(anchor.clientY, area.bottom - rect.height - 8))}px` });
            };
            updateMenuStyle = () => {
                const fontSize = getSetting("PortConnectMenu.MenuFontSize", 12);
                const maxWidth = getSetting("PortConnectMenu.MenuMaxWidth", 360);
                menu.style.setProperty("--port-connect-font-size", `${fontSize}px`);
                menu.style.setProperty("--port-connect-line-height", `${fontSize + 2}px`);
                menu.style.setProperty("--port-connect-max-width", `${maxWidth}px`);
                wireCtx.font = `${fontSize}px Arial, sans-serif`;
                const width = candidates.reduce((width, node) => Math.max(width, wireCtx.measureText("0").width * idWidth + wireCtx.measureText(node.title).width + 42), 160);
                naturalWidth = Math.ceil(Math.min(maxWidth, width));
                positionMenu();
            };
            const render = () => {
                cancelHover(); restoreView(); list.replaceChildren();
                const query = filter.value.trim().toLocaleLowerCase();
                const matches = candidates.filter(node => from.graph.getNodeById(node.id) === node && `${node.title} #${node.id}`.toLocaleLowerCase().includes(query));
                for (const node of matches) {
                    const button = document.createElement("button"); button.type = "button"; button.className = "port-connect-menu-item";
                    button.dataset.nodeId = node.id; button.title = `#${node.id} ${node.title}`;
                    const id = document.createElement("span"); id.className = "port-connect-menu-id"; id.textContent = `#${node.id}`;
                    const name = document.createElement("span"); name.className = "port-connect-menu-node"; name.textContent = node.title;
                    button.append(id, name);
                    const open = () => scheduleFocus(node, lastPointer || anchor, "menu");
                    button.addEventListener("pointerenter", open); button.addEventListener("focus", open);
                    button.addEventListener("pointerleave", () => { if (hoverNode === node) cancelHover(); });
                    button.addEventListener("click", () => { cancelHover(); focusNode(node, lastPointer || anchor, "menu"); });
                    list.append(button);
                }
                message.textContent = matches.length ? "" : text("没有兼容或符合筛选条件的节点。", "No compatible nodes match this filter.");
                updateMenuStyle();
            };
            filter.addEventListener("input", render);
            filter.addEventListener("keydown", event => {
                if (event.key === "Enter") { consume(event); list.querySelector("button")?.focus(); }
            });
            menu.append(title, filter, list, message); overlay.append(menu); render(); filter.focus();
        };
        const scheduleFocus = (node, event, reason) => {
            if (reason === "direct") { cancelHover(); focusNode(node, event, reason); return; }
            if (focus?.node === node && focus.reason === reason) { cancelHover(); cancelLeave(); return; }
            if (hoverNode === node) { hoverPoint = { clientX: event.clientX, clientY: event.clientY }; return; }
            cancelHover(); hoverNode = node; hoverPoint = { clientX: event.clientX, clientY: event.clientY };
            hoverTimer = setTimeout(() => {
                const anchor = hoverPoint; cancelHover();
                if (interactive() && node.graph === canvas.graph && (connection || (sourceHoverZoom() && lastPointer?.ctrlKey))) focusNode(node, anchor, reason);
            }, getSetting("PortConnectMenu.HoverDelay", 200));
        };
        const scheduleRestore = () => {
            if (leaveTimer !== null) return;
            leaveTimer = setTimeout(() => {
                leaveTimer = null;
                if (focus && focus.reason !== "menu" && lastPointer && !insideFocus(lastPointer)) {
                    cancelHover(); restoreView();
                    updatePointer(lastPointer);
                }
            }, Math.max(160, (focus?.settled || 0) - performance.now()));
        };
        const updatePointer = event => {
            rememberPointer(event);
            if (returnView) return;
            if (connection && !validPort(connection.from)) { reset(); return; }
            if (connection) paintWire();
            if (pan || spacePressed || canvas.dragging_canvas) { cancelHover(); cancelLeave(); return; }
            if (connection && focus?.reason === "direct" && !event.ctrlKey) restoreView();
            const element = document.elementFromPoint(event.clientX, event.clientY);
            if (element?.closest(".port-connect-menu-overlay")) {
                if (hoverNode && element.closest(".port-connect-menu-item")?.dataset.nodeId !== String(hoverNode.id)) cancelHover();
                cancelLeave(); return;
            }
            const node = nodeAt(event);
            if (connection && document.activeElement?.closest(".port-connect-menu-overlay")) canvas.canvas.focus({ preventScroll: true });
            if (focus) {
                if (insideFocus(event) && (!connection || !node || node === focus.node)) { cancelLeave(); cancelHover(); return; }
                if (connection && node && event.ctrlKey && !(event.buttons & ~1)) cancelLeave();
                else if (focus.reason === "menu") { cancelHover(); return; }
                else if (connection || !event.ctrlKey) scheduleRestore();
            }
            const canTarget = node && connection && targetHoverZoom() && event.ctrlKey && !(event.buttons & ~1) && !event.shiftKey && !event.altKey && !event.metaKey;
            const canSource = node && !connection && sourceHoverZoom() && event.ctrlKey && !event.buttons && !event.shiftKey && !event.altKey && !event.metaKey
                && !isEditing(element) && !canvas.linkConnector.isConnecting;
            if (interactive() && (canTarget || (!menu && canSource))) scheduleFocus(node, event, connection ? "direct" : "source");
            else cancelHover();
        };

        scope.listen(window, "pointerdown", event => {
            cancelReturn();
            rememberPointer(event);
            cancelHover();
            suppressClick = false;
            if (event.button === 2 && (connection || focus)) { consume(event); suppressContextMenu = true; reset(!!connection); return; }
            if (connection && (event.button === 1 || (event.button === 0 && spacePressed))) {
                consume(event); beginPan(event, event.button); updatePointer(event); return;
            }
            if (event.button !== 0) return;
            nativeDrag = null;
            if (connection) {
                if (event.target.closest?.(".port-connect-menu")) return;
                if (!nodeAt(event) && event.target !== canvas.canvas && !insideFocus(event)) { reset(); return; }
                consume(event); pressed = { pointerId: event.pointerId, start: [event.clientX, event.clientY], initial: false };
                canvas.canvas.setPointerCapture(event.pointerId); updatePointer(event); return;
            }
            const from = portAt(event);
            if (!from || !interactive() || canvas.linkConnector.isConnecting || event.shiftKey || event.altKey || event.metaKey
                || isEditing(event.target)) {
                if (focus && insideFocus(event) && !spacePressed) { suppressClick = true; consume(event); }
                else if (focus) { cancelHover(); restoreView(); }
                return;
            }
            if (focus?.reason === "source" && insideFocus(event)) { consume(event); begin(from, event); }
            else {
                nativeDrag = { from, pointerId: event.pointerId, view: readView() };
            }
        }, true);
        scope.listen(window, "pointermove", event => {
            if (nativeDrag && (!(event.buttons & 1) || !validPort(nativeDrag.from))) nativeDrag = null;
            // 左键已按住时再按中键只会产生 pointermove，不会再产生 pointerdown。
            if (connection && !pan && ((event.buttons & 4) || (spacePressed && (event.buttons & 1)))) {
                beginPan(event, event.buttons & 4 ? 1 : 0);
            }
            if (pan) {
                if (event.pointerId !== pan.pointerId) return;
                consume(event);
                const held = event.buttons & (pan.button === 1 ? 4 : 1);
                if (held) {
                    applyView(canvas.ds.scale, [canvas.ds.offset[0] + (event.clientX - pan.x) / canvas.ds.scale,
                        canvas.ds.offset[1] + (event.clientY - pan.y) / canvas.ds.scale]);
                    pan.x = event.clientX; pan.y = event.clientY;
                } else endPan();
                updatePointer(event); return;
            }
            if (pressed && event.pointerId !== pressed.pointerId) return;
            if (connection && !(event.buttons & 4) && !spacePressed && !canvas.dragging_canvas
                && !event.target.closest?.(".port-connect-menu")) event.stopImmediatePropagation();
            updatePointer(event);
        }, true);
        scope.listen(window, "pointerup", event => {
            if (nativeDrag?.pointerId === event.pointerId && event.button === 0) nativeDrag = null;
            rememberPointer(event);
            if (pan && event.pointerId === pan.pointerId) {
                consume(event); suppressClick = true;
                endPan(); paintWire(); return;
            }
            if (connection && !pressed && event.button === 0 && !event.target.closest?.(".port-connect-menu")) {
                consume(event); suppressClick = true; return;
            }
            if (!connection || !pressed || event.pointerId !== pressed.pointerId || event.button !== 0) return;
            suppressClick = true;
            consume(event);
            const wasInitial = pressed.initial, start = pressed.start, to = portAt(event);
            releasePointer(); updatePointer(event);
            if (!connection) return;
            if (to && compatible(connection.from, to)) { confirm(to); return; }
            const node = nodeAt(event);
            if (node) {
                cancelHover();
            } else if (!wasInitial && start && Math.hypot(event.clientX - start[0], event.clientY - start[1]) < 6
                && !document.elementFromPoint(event.clientX, event.clientY)?.closest(".port-connect-menu-overlay") && !insideFocus(event)) {
                showMenu(event);
            }
        }, true);
        scope.listen(window, "click", event => {
            if (suppressClick || (connection && !event.target.closest?.(".port-connect-menu"))) consume(event);
            suppressClick = false;
        }, true);
        scope.listen(window, "keydown", event => {
            if (returnView && event.key !== "Control") {
                if ((event.ctrlKey || event.metaKey) && ["z", "y"].includes(event.key.toLowerCase())) reset();
                else cancelReturn();
            }
            if (event.key === "Control" && !event.repeat && !event.shiftKey && !event.altKey && !event.metaKey
                && lockNativeDrag()) consume(event);
            if (event.key === " " && !isEditing(event.target)) {
                spacePressed = true;
                if (connection) {
                    spaceHandled = true; consume(event); cancelHover(); cancelLeave();
                    if (pressed && !pan) beginPan({ ...lastPointer, pointerId: pressed.pointerId }, 0);
                }
                updateGrabCursor();
            }
            if (event.key === "Escape" && (connection || focus || menu || hoverTimer)) { consume(event); reset(!!connection); }
            if (event.key === "Control" && (!isEditing(event.target) || connection) && lastPointer) updatePointer({ ...lastPointer, ctrlKey: true,
                shiftKey: event.shiftKey, altKey: event.altKey, metaKey: event.metaKey });
        }, true);
        scope.listen(window, "keyup", event => {
            if (event.key === " ") {
                spacePressed = false;
                if (pan?.button === 0) endPan();
                updateGrabCursor();
                if (spaceHandled) { consume(event); spaceHandled = false; }
            }
            if (event.key !== "Control") return;
            if (lastPointer) lastPointer.ctrlKey = false;
            cancelHover();
            if (!connection && !nativeDrag && !returnView) reset();
            else if (focus?.reason === "source" || focus?.reason === "direct") restoreView();
        }, true);
        scope.listen(window, "contextmenu", event => {
            if (suppressContextMenu) { consume(event); suppressContextMenu = false; }
        }, true);
        scope.listen(window, "wheel", event => {
            cancelReturn();
            cancelHover();
            if (!event.target.closest?.(".port-connect-menu")) {
                animation = null;
                if (connection) { cancelLeave(); focusView = focus = null; targetGlow.remove(); }
                else if (focus) focus.settled = performance.now() + 250;
            }
            requestAnimationFrame(paintWire);
        }, { passive: true, capture: true });
        scope.listen(window, "resize", () => {
            positionMenu?.();
            refocus();
            paintWire();
        });
        scope.listen(canvas.canvas, "lostpointercapture", event => {
            if (pressed?.pointerId === event.pointerId || pan?.pointerId === event.pointerId) reset();
        });
        scope.listen(window, "pointercancel", () => { if (!handingOff) reset(); });
        for (const name of ["subgraph-opening", "litegraph:set-graph"]) scope.listen(canvas.canvas, name, reset);
        scope.listen(window, "blur", () => { reset(); lastPointer = null; spacePressed = spaceHandled = false; });
        scope.listen(app.ui.settings, "PortConnectMenu.Enabled.change", reset);
        scope.listen(app.ui.settings, "PortConnectMenu.SourceHoverZoom.change", () => {
            cancelHover();
            if (!sourceHoverZoom() && focus?.reason === "source") restoreView();
        });
        scope.listen(app.ui.settings, "PortConnectMenu.TargetHoverZoom.change", () => {
            if (!targetHoverZoom() && focus?.reason === "direct") restoreView();
        });
        scope.listen(app.ui.settings, "PortConnectMenu.HoverDelay.change", cancelHover);
        for (const id of ["PreviewZoom", "AnimationDuration"]) scope.listen(app.ui.settings, `PortConnectMenu.${id}.change`, refocus);
        for (const id of ["HighlightColor", "GlowStrength"]) scope.listen(app.ui.settings, `PortConnectMenu.${id}.change`, updateGlow);
        for (const id of ["MenuMaxWidth", "MenuFontSize"]) scope.listen(app.ui.settings, `PortConnectMenu.${id}.change`, () => {
            if (menu) { updateMenuStyle(); refocus(); }
        });
        scope.add(() => { reset(); style.remove(); });
    }
});
