import { app } from "../../../scripts/app.js";
import { isEditing } from "../runtime.js";

function getSetting(id, defaultValue) {
    const value = app.extensionManager.setting.get(id);
    return value !== undefined ? value : defaultValue;
}

const slotName = (slot) => slot.label || slot.localized_name || slot.name;

function drawPreviewNode(ctx, node, selectedPort) {
    const [x, y, width, height] = node.getBounding();
    const titleHeight = LiteGraph.NODE_TITLE_HEIGHT;
    ctx.save();
    ctx.globalAlpha = node.mode === 2 ? 0.5 : 1;
    ctx.fillStyle = node.renderingBgColor;
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, node.renderingShape === 1 ? 0 : 8);
    ctx.fill();
    ctx.fillStyle = node.renderingColor;
    ctx.fillRect(x, y, width, Math.min(titleHeight, height));
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 8, y, Math.max(0, width - 16), titleHeight);
    ctx.clip();
    ctx.font = "14px Arial, sans-serif";
    ctx.fillStyle = LiteGraph.NODE_TITLE_COLOR;
    ctx.fillText(node.title, x + 8, y + titleHeight * 0.7);
    ctx.restore();
    if (!node.flags.collapsed) {
        ctx.font = "12px Arial, sans-serif";
        for (const input of [true, false]) {
            const slots = input ? node.inputs : node.outputs;
            for (const [index, slot] of slots.entries()) {
                const point = input ? node.getInputPos(index) : node.getOutputPos(index);
                const connected = input ? slot.link != null : slot.links?.length;
                const active = selectedPort?.node === node && selectedPort.input === input && selectedPort.index === index;
                ctx.strokeStyle = ctx.fillStyle = active ? "#66CCFF" : app.canvas.constructor.link_type_colors[slot.type] || "#aaa";
                ctx.beginPath();
                ctx.arc(...point, 4, 0, Math.PI * 2);
                if (connected) ctx.fill();
                else ctx.stroke();
                ctx.save();
                ctx.beginPath();
                const labelWidth = Math.max(0, width / 2 - 20);
                ctx.rect(input ? point[0] + 10 : point[0] - 10 - labelWidth, point[1] - 9, labelWidth, 18);
                ctx.clip();
                ctx.textAlign = input ? "left" : "right";
                ctx.fillStyle = active ? "#66CCFF" : LiteGraph.NODE_TEXT_COLOR;
                ctx.fillText(slotName(slot), point[0] + (input ? 10 : -10), point[1] + 4);
                ctx.restore();
            }
        }
        ctx.textAlign = "left";
        let widgetY = node.pos[1] + 12 + Math.max(node.inputs.filter(slot => !slot.widget).length, node.outputs.length) * LiteGraph.NODE_SLOT_HEIGHT;
        for (const widget of node.widgets || []) {
            if (!node.isWidgetVisible(widget)) continue;
            const rowY = getSetting("Comfy.VueNodes.Enabled", false) ? widgetY : node.pos[1] + widget.y;
            if (rowY + 20 > y + height) break;
            ctx.fillStyle = LiteGraph.WIDGET_BGCOLOR;
            ctx.fillRect(x + 10, rowY, Math.max(0, width - 20), 20);
            ctx.save();
            ctx.beginPath();
            ctx.rect(x + 14, rowY, Math.max(0, width - 28), 20);
            ctx.clip();
            ctx.fillStyle = LiteGraph.WIDGET_TEXT_COLOR;
            ctx.fillText(`${widget.label || widget.name}: ${String(widget.value ?? "")}`, x + 14, rowY + 14);
            ctx.restore();
            widgetY += 24;
        }
    }
    if (node.selected || node.mode === 4) {
        ctx.strokeStyle = node.mode === 4 ? "#FF00FF" : LiteGraph.NODE_BOX_OUTLINE_COLOR;
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, width, height);
    }
    ctx.restore();
}

const menuStyle = `
.port-connect-menu-overlay { position: fixed; inset: 0; z-index: 10000; }
.port-connect-menu {
    position: fixed; box-sizing: border-box; max-width: min(360px, calc(100vw - 16px));
    max-height: calc(100vh - 16px); display: flex; flex-direction: column;
    background: var(--comfy-menu-bg, #252525); color: var(--fg-color, #eee);
    border: 1px solid var(--border-color, #555); border-radius: 8px;
    box-shadow: 0 6px 24px #0008; padding: 10px; gap: 8px; font: 13px sans-serif;
}
.port-connect-menu-title { overflow-wrap: anywhere; font-weight: bold; }
.port-connect-menu-preview {
    position: fixed; box-sizing: border-box; padding: 10px; display: flex; flex-direction: column; gap: 8px;
    background: var(--comfy-menu-bg, #252525); color: var(--fg-color, #eee); pointer-events: none;
    border: 1px solid var(--border-color, #555); border-radius: 8px; box-shadow: 0 6px 24px #0008;
    font: 12px/16px Arial, sans-serif;
}
.port-connect-menu-preview[hidden] { display: none; }
.port-connect-menu-preview-title { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-weight: bold; }
.port-connect-menu-preview-stage { position: relative; isolation: isolate; overflow: hidden; border-radius: 4px; }
.port-connect-menu-preview-stage canvas { display: block; width: 100%; height: 100%; }
.port-connect-menu-preview-world { position: absolute; inset: 0; transform-origin: 0 0; z-index: 1; }
.port-connect-menu-preview-marker { position: absolute; inset: 0; z-index: 2; }
.port-connect-menu-preview-status { color: #aaa; white-space: pre-line; max-height: 64px; overflow: hidden; overflow-wrap: anywhere; }
.port-connect-menu-filter {
    width: 100%; box-sizing: border-box; padding: 7px 9px; border-radius: 4px;
    border: 1px solid var(--border-color, #555); background: var(--comfy-input-bg, #171717);
    color: inherit; flex-shrink: 0;
}
.port-connect-menu-list { overflow-y: auto; max-height: 55vh; min-height: 0; }
.port-connect-menu-item {
    display: grid; grid-template-columns: calc(var(--port-connect-id-width) + 8px) minmax(0, var(--port-connect-name-width)) auto minmax(0, 1fr);
    column-gap: 4px; font: 12px/14px Arial, sans-serif;
}
.port-connect-menu-option {
    display: grid; grid-template-columns: subgrid; grid-column: 1 / -1; align-items: center;
    min-width: 0; text-align: left; padding: 6px 8px; border: 0; border-radius: 4px;
    background: transparent; font: inherit; cursor: pointer; white-space: nowrap;
}
.port-connect-menu-option:hover, .port-connect-menu-option:focus-visible { background: #2a60a8; }
.port-connect-menu-option:disabled { cursor: default; background: transparent; }
.port-connect-menu-node, .port-connect-menu-port { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.port-connect-menu-id, .port-connect-menu-node, .port-connect-menu-arrow { color: #aaa; }
.port-connect-menu-id { font-variant-numeric: tabular-nums; }
.port-connect-menu-port { grid-column: 4; color: #fff; }
.port-connect-menu-message { padding: 6px; color: var(--descrip-text, #aaa); }
`;

export const createPortConnectMenu = (scope) => ({
    name: "Comfy.PortConnectMenu",

    setup() {
        const canvas = app.canvas;
        const connector = canvas.linkConnector;
        let gesture = null;
        let overlay = null;
        let stopPreview = null;
        let repositionMenu = null;
        const enabled = () => getSetting("PortConnectMenu.Enabled", true);
        const text = (zh, en) => getSetting("Comfy.Locale", "en").startsWith("zh") ? zh : en;
        const style = document.createElement("style");
        style.textContent = menuStyle;
        document.head.append(style);

        const closeMenu = () => {
            if (!overlay) return;
            stopPreview?.();
            stopPreview = repositionMenu = null;
            overlay.remove();
            overlay = null;
            canvas.canvas.focus();
        };
        const finishGesture = () => {
            if (!gesture) return;
            const { pointerId } = gesture;
            gesture = null;
            connector.reset(true);
            canvas.setDirty(true, true);
            if (canvas.canvas.hasPointerCapture(pointerId)) canvas.canvas.releasePointerCapture(pointerId);
        };
        const consume = (event) => {
            event.preventDefault();
            event.stopImmediatePropagation();
        };
        const updatePreview = (event) => {
            const point = canvas.convertEventToCanvasOffset(event);
            canvas.graph_mouse[0] = point[0];
            canvas.graph_mouse[1] = point[1];
            connector.state.snapLinksPos = point;
            canvas.setDirty(true, true);
        };
        const portAt = (point) => {
            const graph = canvas.graph;
            const front = graph.getNodeOnPos(...point);
            const nodes = front ? [front] : [...canvas.visible_nodes].reverse();
            for (const node of nodes) {
                if (node.flags.collapsed) continue;
                const hit = node.getSlotInPosition(...point);
                if (hit) return { graph, node, slot: hit.input || hit.output, index: hit.slot, input: !!hit.input };
            }
            return null;
        };
        const compatible = (from, to) => from.input !== to.input && from.node !== to.node
            && LiteGraph.isValidConnection(from.input ? to.slot.type : from.slot.type, from.input ? from.slot.type : to.slot.type);
        const connectPorts = (from, to) => {
            if (canvas.graph !== from.graph || from.graph.getNodeById(from.node.id) !== from.node
                || from.graph.getNodeById(to.node.id) !== to.node
                || (from.input ? from.node.inputs : from.node.outputs)[from.index] !== from.slot
                || (to.input ? to.node.inputs : to.node.outputs)[to.index] !== to.slot
                || !compatible(from, to) || canvas.read_only || !canvas.allow_interaction || !enabled()) return null;
            const output = from.input ? to : from;
            const input = from.input ? from : to;
            const existing = from.graph.links[input.slot.link];
            if (existing?.origin_id === output.node.id && existing.origin_slot === output.index) return existing;
            app.extensionManager.workflow.activeWorkflow?.changeTracker.captureCanvasState();
            canvas.emitBeforeChange();
            try {
                // 由原生 connect 验证并替换输入旧线，拒绝连接时保留旧线。
                return output.node.connect(output.index, input.node, input.index);
            } finally {
                canvas.emitAfterChange();
                canvas.setDirty(true, true);
            }
        };
        const showMenu = (from, event) => {
            closeMenu();
            const candidates = [];
            for (const node of from.graph._nodes) {
                if (node === from.node) continue;
                const slots = from.input ? node.outputs : node.inputs;
                for (const [index, slot] of slots.entries()) {
                    const to = { node, slot, index, input: !from.input };
                    if (compatible(from, to)) candidates.push(to);
                }
            }
            candidates.sort((a, b) => a.node.title.localeCompare(b.node.title)
                || String(a.node.id).localeCompare(String(b.node.id), undefined, { numeric: true }) || a.index - b.index);
            overlay = document.createElement("div");
            overlay.className = "port-connect-menu-overlay";
            const menu = document.createElement("div");
            menu.className = "port-connect-menu";
            menu.setAttribute("role", "dialog");
            menu.setAttribute("aria-label", text("端口连接菜单", "Connect Existing Ports"));
            const title = document.createElement("div");
            title.className = "port-connect-menu-title";
            title.textContent = `${from.node.title} #${from.node.id} · ${slotName(from.slot)} (${from.slot.type})`;
            const filter = document.createElement("input");
            filter.className = "port-connect-menu-filter";
            filter.type = "search";
            filter.placeholder = text("筛选节点或端口…", "Filter nodes or ports…");
            filter.setAttribute("aria-label", filter.placeholder);
            const list = document.createElement("div");
            list.className = "port-connect-menu-list";
            const idWidth = candidates.reduce((width, to) => Math.max(width, String(to.node.id).length + 1), 2);
            list.style.setProperty("--port-connect-id-width", `${idWidth}ch`);
            const message = document.createElement("div");
            message.className = "port-connect-menu-message";
            const preview = document.createElement("div");
            preview.className = "port-connect-menu-preview";
            preview.hidden = true;
            const previewTitle = document.createElement("div");
            previewTitle.className = "port-connect-menu-preview-title";
            const stage = document.createElement("div");
            stage.className = "port-connect-menu-preview-stage";
            const previewCanvas = document.createElement("canvas");
            const world = document.createElement("div");
            world.className = "port-connect-menu-preview-world";
            world.inert = true;
            const marker = document.createElement("canvas");
            marker.className = "port-connect-menu-preview-marker";
            stage.append(previewCanvas, world, marker);
            const status = document.createElement("div");
            status.className = "port-connect-menu-preview-status";
            preview.append(previewTitle, stage, status);
            const ctx = previewCanvas.getContext("2d");
            const markerCtx = marker.getContext("2d");
            let previewPort = null;
            let previewFrame = null;
            let lastPaint = 0;
            let sidePreviewWidth = 0;
            const snapshots = new Map();
            const hidePreview = () => {
                if (previewFrame !== null) cancelAnimationFrame(previewFrame);
                previewFrame = null;
                previewPort = null;
                preview.hidden = true;
                world.replaceChildren();
                snapshots.clear();
            };
            stopPreview = hidePreview;
            const measureItems = () => {
                ctx.font = "12px Arial, sans-serif";
                const prefixWidth = ctx.measureText("0").width * idWidth + ctx.measureText("▸").width + 28;
                return [...list.children].map(item => ({
                    item,
                    prefixWidth,
                    nameWidth: ctx.measureText(item.querySelector(".port-connect-menu-node").textContent).width,
                    portWidth: [...item.querySelectorAll(".port-connect-menu-port")].reduce((width, label) => Math.max(width, ctx.measureText(label.textContent).width), 0)
                }));
            };
            const fitColumns = () => {
                for (const { item, prefixWidth, nameWidth, portWidth } of measureItems()) {
                    const available = Math.max(0, list.clientWidth - prefixWidth);
                    const ratio = Math.min(1, available / Math.max(1, nameWidth + portWidth));
                    item.style.setProperty("--port-connect-name-width", `${nameWidth * ratio}px`);
                }
            };
            const positionMenu = () => {
                fitColumns();
                const rect = menu.getBoundingClientRect();
                const remaining = window.innerWidth - rect.width - 24;
                sidePreviewWidth = remaining >= 200 ? Math.min(320, remaining) : 0;
                const reserved = sidePreviewWidth ? sidePreviewWidth + 8 : 0;
                menu.style.left = `${Math.max(8, Math.min(event.clientX, window.innerWidth - rect.width - reserved - 8))}px`;
                menu.style.top = `${Math.max(8, Math.min(event.clientY, window.innerHeight - rect.height - 8))}px`;
            };
            repositionMenu = positionMenu;
            const paintPreview = (time) => {
                if (!previewPort) return;
                if (time - lastPaint < 80) {
                    previewFrame = requestAnimationFrame(paintPreview);
                    return;
                }
                lastPaint = time;
                const to = previewPort;
                if (canvas.graph !== from.graph || from.graph.getNodeById(to.node.id) !== to.node
                    || (to.input ? to.node.inputs : to.node.outputs)[to.index] !== to.slot) {
                    hidePreview();
                    return;
                }
                const graph = from.graph;
                const mainRect = canvas.canvas.getBoundingClientRect();
                const originals = new Map();
                if (getSetting("Comfy.VueNodes.Enabled", false)) {
                    for (const element of document.querySelectorAll(".lg-node[data-node-id]")) originals.set(element.dataset.nodeId, element);
                }
                const boundsOf = (node) => {
                    const element = originals.get(String(node.id));
                    if (!element) return node.getBounding();
                    const rect = element.getBoundingClientRect();
                    return [(rect.left - mainRect.left) / canvas.ds.scale - canvas.ds.offset[0],
                        (rect.top - mainRect.top) / canvas.ds.scale - canvas.ds.offset[1], rect.width / canvas.ds.scale, rect.height / canvas.ds.scale];
                };
                const slotPosition = (node, input, index) => {
                    const key = `${node.id}-${input ? "in" : "out"}-${index}`;
                    const dot = originals.get(String(node.id))?.querySelector(`[data-slot-key="${CSS.escape(key)}"]`);
                    if (!dot) return input ? node.getInputPos(index) : node.getOutputPos(index);
                    const rect = dot.getBoundingClientRect();
                    return [(rect.left + rect.width / 2 - mainRect.left) / canvas.ds.scale - canvas.ds.offset[0],
                        (rect.top + rect.height / 2 - mainRect.top) / canvas.ds.scale - canvas.ds.offset[1]];
                };
                const [x, y, nodeWidth, nodeHeight] = boundsOf(to.node);
                const point = slotPosition(to.node, to.input, to.index);
                const links = [...graph.links.values()].filter(link => to.input
                    ? link.target_id === to.node.id && link.target_slot === to.index
                    : link.origin_id === to.node.id && link.origin_slot === to.index);
                previewTitle.textContent = `#${to.node.id} ${to.node.title}`;
                status.textContent = `${slotName(to.slot)} · ${links.length ? text("已有连接", "Connected") : text("未连接", "Not connected")}`;
                for (const link of links) {
                    const peer = graph.getNodeById(to.input ? link.origin_id : link.target_id);
                    if (peer) {
                        const slot = to.input ? peer.outputs[link.origin_slot] : peer.inputs[link.target_slot];
                        if (!slot) continue;
                        status.textContent += `\n${to.input ? "←" : "→"} #${peer.id} ${peer.title} ▸ ${slotName(slot)}`;
                    } else {
                        const slot = to.input ? graph.inputNode?.slots[link.origin_slot] : graph.outputNode?.slots[link.target_slot];
                        if (slot) status.textContent += `\n${to.input ? "←" : "→"} ${to.input ? text("子图输入", "Subgraph input") : text("子图输出", "Subgraph output")} ▸ ${slotName(slot)}`;
                    }
                }
                status.title = status.textContent;
                preview.dataset.nodeId = to.node.id;
                preview.dataset.slotIndex = to.index;
                preview.dataset.direction = to.input ? "input" : "output";
                const menuRect = menu.getBoundingClientRect();
                preview.style.width = `${sidePreviewWidth || Math.min(320, window.innerWidth - 16)}px`;
                const below = window.innerHeight - menuRect.bottom - 16;
                const above = menuRect.top - 16;
                const space = sidePreviewWidth ? window.innerHeight - 16 : Math.max(below, above);
                const previewWidth = preview.clientWidth - 20;
                const chromeHeight = previewTitle.offsetHeight + status.offsetHeight + 36;
                const previewHeight = Math.max(40, Math.min(360, space - chromeHeight));
                const scale = Math.min(1, previewWidth / (nodeWidth + 120), previewHeight / (nodeHeight + 80));
                const height = Math.max(80, Math.min(previewHeight, (nodeHeight + 80) * scale));
                stage.style.height = `${height}px`;
                const originX = x + nodeWidth / 2 - previewWidth / scale / 2;
                const originY = y + nodeHeight / 2 - height / scale / 2;
                const dpr = window.devicePixelRatio || 1;
                for (const image of [previewCanvas, marker]) {
                    const width = Math.round(previewWidth * dpr);
                    const bitmapHeight = Math.round(height * dpr);
                    if (image.width !== width || image.height !== bitmapHeight) {
                        image.width = width;
                        image.height = bitmapHeight;
                    }
                }
                ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
                ctx.fillStyle = "#171717";
                ctx.fillRect(0, 0, previewWidth, height);
                ctx.setTransform(dpr * scale, 0, 0, dpr * scale, -originX * dpr * scale, -originY * dpr * scale);
                const nodes = graph._nodes.filter(node => {
                    const [nx, ny, nw, nh] = boundsOf(node);
                    return nx < originX + previewWidth / scale && nx + nw > originX
                        && ny < originY + height / scale && ny + nh > originY;
                });
                const renderer = Object.create(canvas);
                renderer.ds = { scale };
                Object.defineProperty(renderer, "low_quality", { value: false });
                renderer.render_connection_arrows = false;
                for (const link of graph.links.values()) {
                    const source = graph.getNodeById(link.origin_id);
                    const target = graph.getNodeById(link.target_id);
                    const output = source ? source.outputs[link.origin_slot] : graph.inputNode?.slots[link.origin_slot];
                    const input = target ? target.inputs[link.target_slot] : graph.outputNode?.slots[link.target_slot];
                    if (!output || !input) continue;
                    const start = source ? slotPosition(source, false, link.origin_slot) : output.pos;
                    const end = target ? slotPosition(target, true, link.target_slot) : input.pos;
                    const reroutes = link.constructor.getReroutes(graph, link);
                    const points = [start, ...reroutes.map(route => route.pos), end];
                    const bounds = points.reduce((bounds, point) => [Math.min(bounds[0], point[0]), Math.min(bounds[1], point[1]),
                        Math.max(bounds[2], point[0]), Math.max(bounds[3], point[1])], [Infinity, Infinity, -Infinity, -Infinity]);
                    if (bounds[0] > originX + previewWidth / scale + 80 || bounds[2] < originX - 80
                        || bounds[1] > originY + height / scale + 80 || bounds[3] < originY - 80) continue;
                    const color = link.color || canvas.constructor.link_type_colors[link.type] || canvas.default_link_color;
                    let startControl;
                    for (let i = 1; i < points.length; i++) {
                        const route = reroutes[i - 1];
                        // 空 link 只绘制，避免改写原连线的 Path2D 和命中区域。
                        renderer.renderLink(ctx, points[i - 1], points[i], null, false, 0, color,
                            i === 1 ? output.dir : LiteGraph.CENTER,
                            route ? LiteGraph.CENTER : input.dir,
                            { startControl, endControl: route?.controlPoint });
                        if (route) {
                            const next = points[i + 1];
                            const distance = Math.min(route.constructor.maxSplineOffset, Math.hypot(route.pos[0] - next[0], route.pos[1] - next[1]) * 0.25);
                            startControl = [distance * route.cos, distance * route.sin];
                        }
                    }
                }
                for (const node of nodes.filter(node => node !== to.node)) drawPreviewNode(ctx, node, to);
                drawPreviewNode(ctx, to.node, to);
                // 已在视野内的画布使用当前像素；视野外节点按实时图数据绘制。
                ctx.drawImage(canvas.canvas, -canvas.ds.offset[0], -canvas.ds.offset[1], mainRect.width / canvas.ds.scale, mainRect.height / canvas.ds.scale);
                world.style.transform = `scale(${scale}) translate(${-originX}px, ${-originY}px)`;
                const visible = new Set();
                if (getSetting("Comfy.VueNodes.Enabled", false)) {
                    for (const node of nodes) {
                        const original = originals.get(String(node.id));
                        if (!original) continue;
                        visible.add(node);
                        const html = original.outerHTML;
                        let snapshot = snapshots.get(node);
                        if (!snapshot || snapshot.html !== html) {
                            snapshot?.clone.remove();
                            const clone = original.cloneNode(true);
                            clone.classList.remove("lg-node");
                            clone.dataset.previewNodeId = node.id;
                            const imageCanvases = [...clone.querySelectorAll("canvas")];
                            const videoCanvases = [...clone.querySelectorAll("video")].map(video => {
                                const image = document.createElement("canvas");
                                image.className = video.className;
                                image.style.cssText = video.style.cssText;
                                video.replaceWith(image);
                                return image;
                            });
                            for (const audio of clone.querySelectorAll("audio")) {
                                audio.removeAttribute("autoplay");
                                audio.removeAttribute("src");
                                audio.querySelectorAll("source").forEach(source => source.remove());
                            }
                            for (const frame of clone.querySelectorAll("iframe")) {
                                const placeholder = document.createElement("div");
                                placeholder.className = frame.className;
                                placeholder.style.cssText = frame.style.cssText;
                                placeholder.textContent = text("自定义控件", "Custom widget");
                                frame.replaceWith(placeholder);
                            }
                            const ids = new Map();
                            for (const element of clone.querySelectorAll("svg [id]")) {
                                const id = element.id;
                                const renamed = `port-connect-preview-${node.id}-${id}`;
                                ids.set(id, renamed);
                                element.id = renamed;
                            }
                            for (const element of clone.querySelectorAll("svg, svg *")) {
                                for (const attr of [...element.attributes]) {
                                    if (attr.name === "id") continue;
                                    for (const [id, renamed] of ids) {
                                        if (attr.value === `#${id}`) element.setAttribute(attr.name, `#${renamed}`);
                                        else if (attr.value.includes(`url(#${id})`)) element.setAttribute(attr.name, attr.value.replaceAll(`url(#${id})`, `url(#${renamed})`));
                                    }
                                }
                            }
                            if (node === to.node) {
                                const dot = clone.querySelector(`[data-slot-key="${CSS.escape(`${node.id}-${to.input ? "in" : "out"}-${to.index}`)}"]`);
                                const slot = dot?.closest(".lg-slot");
                                if (slot) {
                                    slot.style.background = "#66CCFF22";
                                    for (const label of slot.querySelectorAll("span")) label.style.color = "#66CCFF";
                                }
                            }
                            for (const element of [clone, ...clone.querySelectorAll("[id], [data-node-id], [data-slot-key], [autofocus]")]) {
                                if (element.namespaceURI !== "http://www.w3.org/2000/svg") element.removeAttribute("id");
                                element.removeAttribute("data-node-id");
                                element.removeAttribute("data-slot-key");
                                element.removeAttribute("autofocus");
                            }
                            clone.inert = true;
                            world.append(clone);
                            snapshot = { clone, html, imageCanvases, videoCanvases };
                            snapshots.set(node, snapshot);
                        }
                        const controls = snapshot.clone.querySelectorAll("input, textarea, select");
                        original.querySelectorAll("input, textarea, select").forEach((control, i) => {
                            if (!(control instanceof HTMLInputElement) || control.type !== "file") controls[i].value = control.value;
                            if (control instanceof HTMLInputElement) controls[i].checked = control.checked;
                        });
                        original.querySelectorAll("canvas").forEach((image, i) => {
                            if (!image.width || !image.height) return;
                            const copy = snapshot.imageCanvases[i];
                            copy.width = image.width;
                            copy.height = image.height;
                            copy.getContext("2d").drawImage(image, 0, 0);
                        });
                        original.querySelectorAll("video").forEach((video, i) => {
                            const copy = snapshot.videoCanvases[i];
                            if (video.readyState < 2) return;
                            copy.width = video.videoWidth;
                            copy.height = video.videoHeight;
                            copy.getContext("2d").drawImage(video, 0, 0);
                        });
                    }
                }
                for (const [node, snapshot] of snapshots) {
                    if (!visible.has(node)) { snapshot.clone.remove(); snapshots.delete(node); }
                }
                markerCtx.setTransform(1, 0, 0, 1, 0, 0);
                markerCtx.clearRect(0, 0, marker.width, marker.height);
                markerCtx.setTransform(dpr * scale, 0, 0, dpr * scale, -originX * dpr * scale, -originY * dpr * scale);
                markerCtx.strokeStyle = markerCtx.shadowColor = "#66CCFF";
                markerCtx.lineWidth = 2 / scale;
                markerCtx.shadowBlur = 8 * dpr;
                markerCtx.beginPath();
                markerCtx.arc(...point, 7 / scale, 0, Math.PI * 2);
                markerCtx.stroke();
                const previewRect = preview.getBoundingClientRect();
                preview.style.left = `${sidePreviewWidth ? menuRect.right + 8 : Math.min(menuRect.left, window.innerWidth - previewRect.width - 8)}px`;
                const top = sidePreviewWidth ? menuRect.top : below >= above ? menuRect.bottom + 8 : menuRect.top - previewRect.height - 8;
                preview.style.top = `${Math.max(8, Math.min(top, window.innerHeight - previewRect.height - 8))}px`;
                previewFrame = requestAnimationFrame(paintPreview);
            };
            const showPreview = (to) => {
                hidePreview();
                previewPort = to;
                preview.hidden = false;
                lastPaint = -Infinity;
                paintPreview(performance.now());
            };
            const render = () => {
                hidePreview();
                list.replaceChildren();
                const query = filter.value.trim().toLocaleLowerCase();
                const matches = candidates.filter(to => `${to.node.title} #${to.node.id} ${slotName(to.slot)} ${to.slot.name} ${to.slot.type}`.toLocaleLowerCase().includes(query));
                const groups = new Map();
                for (const to of matches) {
                    if (!groups.has(to.node)) groups.set(to.node, []);
                    groups.get(to.node).push(to);
                }
                for (const [node, ports] of groups) {
                    const item = document.createElement("div");
                    item.className = "port-connect-menu-item";
                    item.setAttribute("role", "group");
                    item.setAttribute("aria-label", `#${node.id} ${node.title}`);
                    for (const to of ports) {
                        const button = document.createElement("button");
                        button.type = "button";
                        button.className = "port-connect-menu-option";
                        if (to === ports[0]) {
                            const id = document.createElement("span");
                            id.className = "port-connect-menu-id";
                            id.textContent = `#${node.id}`;
                            const nodeLabel = document.createElement("span");
                            nodeLabel.className = "port-connect-menu-node";
                            nodeLabel.textContent = node.title;
                            const arrow = document.createElement("span");
                            arrow.className = "port-connect-menu-arrow";
                            arrow.textContent = "▸";
                            button.append(id, nodeLabel, arrow);
                        }
                        const portLabel = document.createElement("span");
                        portLabel.className = "port-connect-menu-port";
                        const input = from.input ? from : to;
                        const output = from.input ? to : from;
                        const oldLink = from.graph.links[input.slot.link];
                        const same = oldLink?.origin_id === output.node.id && oldLink.origin_slot === output.index;
                        portLabel.textContent = slotName(to.slot);
                        if (oldLink) portLabel.textContent += text("（已有连接）", " (Already connected)");
                        button.disabled = same;
                        button.append(portLabel);
                        button.title = `#${node.id} ${node.title} ▸ ${portLabel.textContent}`;
                        button.setAttribute("aria-label", button.title);
                        button.addEventListener("pointerenter", () => showPreview(to));
                        button.addEventListener("pointerleave", hidePreview);
                        button.addEventListener("focus", () => showPreview(to));
                        button.addEventListener("blur", hidePreview);
                        button.addEventListener("click", () => {
                            if (connectPorts(from, to)) closeMenu();
                            else {
                                message.textContent = text("无法连接：节点或端口已变化，或节点拒绝了连接。", "Unable to connect: ports changed or the node rejected the connection.");
                                positionMenu();
                            }
                        });
                        item.append(button);
                    }
                    list.append(item);
                }
                message.textContent = matches.length ? "" : candidates.length
                    ? text("没有符合筛选条件的端口。", "No ports match this filter.")
                    : text("当前画布没有兼容端口。", "No compatible ports on the current canvas.");
                if (!menu.style.width) {
                    const width = measureItems().reduce((width, item) => Math.max(width, item.prefixWidth + item.nameWidth + item.portWidth + 22), 160);
                    menu.style.width = `${Math.ceil(Math.min(360, width))}px`;
                }
                positionMenu();
            };
            filter.addEventListener("input", render);
            menu.addEventListener("keydown", event => {
                if (event.key === "Enter" && event.target === filter) {
                    event.preventDefault();
                    list.querySelector("button:not(:disabled)")?.click();
                }
            });
            overlay.addEventListener("pointerdown", event => {
                if (event.target === overlay) closeMenu();
                event.stopPropagation();
            });
            menu.append(title, filter, list, message);
            overlay.append(menu, preview);
            document.body.append(overlay);
            render();
            filter.focus();
        };

        scope.listen(window, "pointerdown", event => {
            if (overlay && !overlay.contains(event.target)) closeMenu();
            if (gesture) finishGesture();
            if (!enabled() || event.button !== 0 || !event.ctrlKey || event.shiftKey || event.altKey || event.metaKey
                || isEditing(event.target) || canvas.read_only || canvas.selectOnly || !canvas.allow_interaction
                || canvas.state.ghostNodeId != null || connector.isConnecting) return;
            if (event.target !== canvas.canvas && !event.target.closest?.(".lg-slot")) return;
            const from = portAt(canvas.convertEventToCanvasOffset(event));
            if (!from) return;
            consume(event);
            canvas.canvas.focus();
            gesture = { from, pointerId: event.pointerId, start: [event.clientX, event.clientY] };
            // 始终新建拖动预览，输入端口已有连接也不进入移动旧线模式。
            if (from.input) connector.dragNewFromInput(from.graph, from.node, from.slot);
            else connector.dragNewFromOutput(from.graph, from.node, from.slot);
            updatePreview(event);
            canvas.canvas.setPointerCapture(event.pointerId);
        }, true);
        scope.listen(window, "pointermove", event => {
            if (!gesture || event.pointerId !== gesture.pointerId) return;
            consume(event);
            if (!(event.buttons & 1) || !event.ctrlKey || gesture.from.graph !== canvas.graph) {
                finishGesture();
                return;
            }
            updatePreview(event);
        }, true);
        scope.listen(window, "pointerup", event => {
            if (!gesture || event.pointerId !== gesture.pointerId) return;
            consume(event);
            const { from, start } = gesture;
            const point = canvas.convertEventToCanvasOffset(event);
            const to = portAt(point);
            finishGesture();
            if (!event.ctrlKey || !enabled() || from.graph !== canvas.graph
                || Math.hypot(event.clientX - start[0], event.clientY - start[1]) < 6) return;
            if (to && compatible(from, to)) connectPorts(from, to);
            else showMenu(from, event);
        }, true);
        scope.listen(window, "keydown", event => {
            if (event.key !== "Escape" || (!gesture && !overlay)) return;
            consume(event);
            finishGesture();
            closeMenu();
        }, true);
        scope.listen(window, "keyup", event => {
            if (event.key === "Control" && !event.ctrlKey) finishGesture();
        }, true);
        const reset = () => { finishGesture(); closeMenu(); };
        for (const name of ["pointercancel", "subgraph-opening", "litegraph:set-graph"]) {
            scope.listen(canvas.canvas, name, reset);
        }
        scope.listen(canvas.canvas, "lostpointercapture", event => {
            if (gesture?.pointerId === event.pointerId) finishGesture();
        });
        scope.listen(window, "blur", reset);
        scope.listen(window, "resize", () => repositionMenu?.());
        scope.listen(app.ui.settings, "PortConnectMenu.Enabled.change", reset);
        scope.add(() => { reset(); style.remove(); });
    }
});
