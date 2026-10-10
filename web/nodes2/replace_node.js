import { app } from "../../../scripts/app.js";
import { isEditing } from "../runtime.js";

/**
 * 插件: 替换节点 - 逻辑模块
 * 交互模式：选中节点 -> Shift+R 进入待替换状态 -> 添加任意新节点 -> 自动执行替换
 * * 修改记录：
 * - [修复] 支持在子图 (Group Node) 中使用：
 * 1. 将 app.graph 替换为动态获取的 activeGraph (app.canvas.graph)。
 * 2. onNodeAdded 监听器改为动态挂载到当前活动的 Graph 实例上。
 * - [修复] 搜索框自动关闭问题：
 * 1. 使用 setTimeout 延迟弹出搜索框，避免快捷键事件冲突导致焦点丢失。
 * 2. [V2修复] 将延迟从 10ms 增加到 100ms，解决快速输入时的焦点抢占问题。
 */
export const createReplaceNode = (scope) => ({
    name: "Comfy.AlignLayout.ReplaceNode.Logic",

    // 状态管理
    pendingReplaceNodeIds: [],
    isProcessing: false, // 防止死循环的锁
    lastMousePos: { x: 0, y: 0 }, // 实时记录鼠标屏幕坐标

    // [新增] 用于存储当前正在操作的 Graph 实例（可能是主图，也可能是子图）
    activeGraph: null,
    // [新增] 用于备份原始的 onNodeAdded 回调
    originalOnNodeAdded: null,

    async setup() {
        const self = this;

        // 0. 全局追踪鼠标位置
        scope.listen(window, "mousemove", (e) => {
            self.lastMousePos.x = e.clientX;
            self.lastMousePos.y = e.clientY;
        });

        // 1. 监听快捷键
        scope.listen(window, "keydown", (e) => {
            const isEnabled = app.ui.settings.getSettingValue("AlignLayout.ReplaceNode.Enabled", true);
            const shortcutSetting = app.ui.settings.getSettingValue("AlignLayout.ReplaceNode.Shortcut", "Shift+R");

            if (!isEnabled) return;
            if (isEditing(e.target)) return;
            if (document.querySelector(".litegraph-searchbox")) return;

            if (matchShortcut(e, shortcutSetting)) {
                e.preventDefault();
                e.stopPropagation();
                toggleReplaceMode();
            }
        });

        // [移除] 这里的静态 app.graph.onNodeAdded 监听器已被移除
        // 改为在 enterReplaceMode 中动态挂载

        function matchShortcut(event, shortcutStr) {
            if (!shortcutStr) return false;
            const parts = shortcutStr.split("+").map(s => s.trim().toLowerCase());
            const keyPart = parts.filter(p => !["ctrl", "shift", "alt", "meta", "command"].includes(p))[0];
            if (!keyPart) return false;

            return (
                event.ctrlKey === parts.includes("ctrl") &&
                event.shiftKey === parts.includes("shift") &&
                event.altKey === parts.includes("alt") &&
                event.metaKey === (parts.includes("meta") || parts.includes("command")) &&
                event.code.toLowerCase() === `key${keyPart}`
            );
        }

        function toggleReplaceMode() {
            if (self.pendingReplaceNodeIds.length > 0) {
                exitReplaceMode();
                return;
            }

            const canvas = app.canvas;
            const selectedNodes = Object.values(canvas.selected_nodes);

            if (selectedNodes.length === 0) {
                alert("请先选中要替换的节点");
                return;
            }

            const firstType = selectedNodes[0].type;
            const isSameType = selectedNodes.every(n => n.type === firstType);

            if (!isSameType) {
                alert("批量替换仅支持选中相同类型的节点。请重新选择。");
                return;
            }

            enterReplaceMode(selectedNodes);
        }

        function normalizeCssColor(input) {
            if (!input) return input;
            let color = input.toString().trim();
            if (color.startsWith("0x")) return "#" + color.slice(2);
            if (/^[0-9A-Fa-f]{3}$|^[0-9A-Fa-f]{6}$/.test(color)) return "#" + color;
            return color;
        }

        function enterReplaceMode(nodes) {
            self.pendingReplaceNodeIds = nodes.map(n => n.id);

            // [新增] 锁定当前操作的 Graph 实例 (支持子图)
            self.activeGraph = app.canvas.graph;

            const graph = self.activeGraph;
            const original = graph.onNodeAdded;
            self.originalOnNodeAdded = original;
            self.nodeAddedHook = function(node) {
                original?.call(graph, node);
                handleNodeAdded(node);
            };
            graph.onNodeAdded = self.nodeAddedHook;

            let borderColorSetting = app.ui.settings.getSettingValue("AlignLayout.ReplaceNode.BorderColor", "#FFFF00");
            const opacitySetting = app.ui.settings.getSettingValue("AlignLayout.ReplaceNode.Opacity", 0.15);
            const glowStrengthSetting = app.ui.settings.getSettingValue("AlignLayout.ReplaceNode.GlowStrength", 15);
            const strokeWidthSetting = app.ui.settings.getSettingValue("AlignLayout.ReplaceNode.StrokeWidth", 3);

            borderColorSetting = normalizeCssColor(borderColorSetting);

            self.clearHighlight = highlightNodes(nodes, {
                color: borderColorSetting, opacity: opacitySetting,
                glow: glowStrengthSetting, stroke: strokeWidthSetting
            });
            app.canvas.setDirty(true, true);

            // --- 菜单触发逻辑 ---
            const triggerMode = app.ui.settings.getSettingValue("AlignLayout.ReplaceNode.MenuTrigger", "SearchBox");

            if (triggerMode === "SearchBox") {
                const screenX = self.lastMousePos.x;
                const screenY = self.lastMousePos.y;

                const graphCanvas = app.canvas;
                const searchEvent = new MouseEvent("dblclick", {
                    clientX: screenX, clientY: screenY, button: 0
                });
                graphCanvas.adjustMouseEvent(searchEvent);

                // [修复] 使用 setTimeout 延迟弹出，防止按键事件冲突导致搜索框失去焦点而自动关闭
                // [V2] 增加延迟到 100ms，确保 Shift+R 的 keyup 事件完全处理完毕
                scope.timeout(() => {
                    if (self.pendingReplaceNodeIds.length && self.activeGraph === app.canvas.graph) {
                        // 与双击画布相同的入口，由 ComfyUI 按搜索框设置打开界面。
                        graphCanvas.emitEvent({
                            subType: "empty-double-click", originalEvent: searchEvent
                        });
                    }
                }, 100);
            }
            else if (triggerMode === "AddNodeMenu") {
                // 如果其他菜单也出现类似问题，建议同样加 setTimeout
                if (typeof window.alignLayout_openAddNodeMenu === "function") {
                    window.alignLayout_openAddNodeMenu();
                } else {
                    console.warn("[ReplaceNode] alignLayout_openAddNodeMenu not found.");
                }
            }
            else if (triggerMode === "QuickNodeMenu") {
                if (typeof window.alignLayout_openQuickNodeMenu === "function") {
                    window.alignLayout_openQuickNodeMenu();
                } else {
                    console.warn("[ReplaceNode] alignLayout_openQuickNodeMenu not found.");
                }
            }
        }

        function exitReplaceMode() {
            if (!self.activeGraph) return;

            // [修复] 使用 activeGraph 而不是 app.graph
            const graph = self.activeGraph || app.canvas.graph;

            self.clearHighlight?.();
            self.clearHighlight = null;

            self.pendingReplaceNodeIds = [];

            // [新增] 卸载动态监听器，还原现场
            if (self.activeGraph.onNodeAdded === self.nodeAddedHook) {
                self.activeGraph.onNodeAdded = self.originalOnNodeAdded;
            }
            self.activeGraph = null;
            self.originalOnNodeAdded = null;
            self.nodeAddedHook = null;

            app.canvas.setDirty(true, true);
        }

        scope.add(exitReplaceMode);
        scope.listen(app.canvas.canvas, "litegraph:set-graph", exitReplaceMode);

        // [新增] 处理节点添加的逻辑 (从原 setup 中提取)
        function handleNodeAdded(node) {
            if (self.isProcessing || !self.pendingReplaceNodeIds.length) return;
            if (self.pendingReplaceNodeIds.includes(node.id)) return;

            const graph = self.activeGraph;
            const hook = self.nodeAddedHook;
            // 等待 graph.add 完成，新搜索框会在 onNodeAdded 之后启动跟随鼠标。
            scope.timeout(() => {
                if (self.activeGraph !== graph || self.nodeAddedHook !== hook) return;
                if (graph.getNodeById(node.id) !== node) return;
                if (app.canvas.state.ghostNodeId === node.id) {
                    app.canvas.finalizeGhostPlacement(false);
                }
                handleBatchReplace(node);
                exitReplaceMode();
            }, 0);
        }

        function handleBatchReplace(templateNode) {
            // [修复] 使用 activeGraph
            const graph = self.activeGraph;
            if (!graph) return;

            self.isProcessing = true;
            graph.beforeChange(); // 开启事务

            try {
                app.canvas.deselectAllNodes();
                const newNodes = [];
                const idsToReplace = [...self.pendingReplaceNodeIds];

                // 处理第一个节点 (替换自身)
                const firstOldNode = graph.getNodeById(idsToReplace[0]);
                if (firstOldNode) {
                    doReplaceSingle(firstOldNode, templateNode);
                    newNodes.push(templateNode);
                }

                // 处理后续节点 (克隆并替换)
                for (let i = 1; i < idsToReplace.length; i++) {
                    const oldNode = graph.getNodeById(idsToReplace[i]);
                    if (!oldNode) continue;

                    const newNode = LiteGraph.createNode(templateNode.type);
                    if (newNode) {
                        newNode.pos = [oldNode.pos[0], oldNode.pos[1]];
                        graph.add(newNode);
                        doReplaceSingle(oldNode, newNode);
                        newNodes.push(newNode);
                    }
                }

                if (newNodes.length > 0) {
                    app.canvas.selectNodes(newNodes);
                }

            } catch (error) {
                console.error("[ReplaceNode] 批量替换出错:", error);
            } finally {
                graph.afterChange(); // 结束事务
                app.canvas.setDirty(true, true);
                self.isProcessing = false;
            }
        }

        function doReplaceSingle(oldNode, newNode) {
            // [修复] 使用 activeGraph 查找连线和节点
            const graph = self.activeGraph;
            newNode.pos = [...oldNode.pos];

            // 复制 Widget 值
            if (oldNode.widgets && newNode.widgets) {
                for (const ow of oldNode.widgets) {
                    const nw = newNode.widgets.find(w => w.name === ow.name && w.type === ow.type);
                    if (nw) {
                        nw.value = ow.value;
                        if (nw.callback) {
                            nw.callback(nw.value, app.canvas, newNode, newNode.pos, null);
                        }
                    }
                }
            }

            // 智能处理：JsonCombined
            const mergeKeysWidget = newNode.widgets?.find(w => w.name === "merge_keys");
            if (mergeKeysWidget && oldNode.inputs) {
                const connectedInputNames = [];
                for(const input of oldNode.inputs) {
                    if (input.link !== null) {
                        connectedInputNames.push(input.name);
                    }
                }
                if (connectedInputNames.length > 0) {
                    const newText = connectedInputNames.join("\n");
                    if (mergeKeysWidget.value !== newText) {
                        mergeKeysWidget.value = newText;
                        if (mergeKeysWidget.callback) {
                            mergeKeysWidget.callback(mergeKeysWidget.value, app.canvas, newNode, newNode.pos, null);
                        }
                        if (newNode.onResize) newNode.onResize(newNode.size);
                    }
                }
            }

            // 处理输入连线
            if (oldNode.inputs) {
                for (let i = 0; i < oldNode.inputs.length; i++) {
                    const oldInput = oldNode.inputs[i];
                    if (!oldInput.link) continue;

                    // [修复] 从 activeGraph 获取链接信息
                    const linkInfo = graph.links[oldInput.link];
                    if (!linkInfo) continue;

                    const originNode = graph.getNodeById(linkInfo.origin_id);
                    const newSlotIndex = findBestInputSlot(newNode, oldInput, i);

                    // 自动扩展槽位逻辑
                    if (newSlotIndex >= newNode.inputs.length) {
                        const lastInput = newNode.inputs[newNode.inputs.length - 1];
                        if (lastInput) {
                            const nameMatch = lastInput.name.match(/^(.*_)(\d+)$/);
                            if (nameMatch) {
                                const prefix = nameMatch[1];
                                while (newNode.inputs.length <= newSlotIndex) {
                                    const nextId = newNode.inputs.length + 1;
                                    newNode.addInput(`${prefix}${nextId}`, lastInput.type);
                                }
                            }
                        }
                    }

                    if (newSlotIndex !== -1 && newSlotIndex < newNode.inputs.length) {
                        originNode.connect(linkInfo.origin_slot, newNode, newSlotIndex);
                    }
                }
            }

            // 处理输出连线
            if (oldNode.outputs) {
                for (let i = 0; i < oldNode.outputs.length; i++) {
                    const oldOutput = oldNode.outputs[i];
                    if (!oldOutput.links || oldOutput.links.length === 0) continue;

                    const newSlotIndex = findBestOutputSlot(newNode, oldOutput, i);

                    if (newSlotIndex !== -1 && newSlotIndex < newNode.outputs.length) {
                        const linksToMigrate = [...oldOutput.links];
                        for (const linkId of linksToMigrate) {
                            // [修复] 从 activeGraph 获取链接信息
                            const linkInfo = graph.links[linkId];
                            if (!linkInfo) continue;
                            const targetNode = graph.getNodeById(linkInfo.target_id);
                            newNode.connect(newSlotIndex, targetNode, linkInfo.target_slot);
                        }
                    }
                }
            }

            graph.remove(oldNode);
        }

        function findBestInputSlot(node, oldSlot, oldIndex) {
            if (!node.inputs) return -1;

            let idx = node.inputs.findIndex(s => s.name === oldSlot.name && s.type === oldSlot.type);
            if (idx !== -1) return idx;

            idx = node.inputs.findIndex(s => s.name === oldSlot.name);
            if (idx !== -1) return idx;

            const specificMatches = node.inputs.map((s, i) => ({s, i})).filter(item => {
                if (oldSlot.type === "*" || oldSlot.type === "Any") return false;
                if (item.s.type === "*" || item.s.type === "Any") return false;
                return item.s.type === oldSlot.type;
            });
            if (specificMatches.length === 1) return specificMatches[0].i;

            const targetSlot = (oldIndex < node.inputs.length) ? node.inputs[oldIndex] : null;
            const forceConnect = app.ui.settings.getSettingValue("AlignLayout.ReplaceNode.ForceConnect", true);

            if (forceConnect) return oldIndex;

            if (targetSlot) {
                const isTypeCompatible = (
                    oldSlot.type === "*" || oldSlot.type === "Any" ||
                    targetSlot.type === "*" || targetSlot.type === "Any" ||
                    oldSlot.type === targetSlot.type
                );
                if (isTypeCompatible) return oldIndex;
            } else {
                return -1;
            }

            return -1;
        }

        function findBestOutputSlot(node, oldSlot, oldIndex) {
            if (!node.outputs) return -1;

            let idx = node.outputs.findIndex(s => s.name === oldSlot.name && s.type === oldSlot.type);
            if (idx !== -1) return idx;

            idx = node.outputs.findIndex(s => s.name === oldSlot.name);
            if (idx !== -1) return idx;

            const specificMatches = node.outputs.map((s, i) => ({s, i})).filter(item => {
                if (oldSlot.type === "*" || oldSlot.type === "Any") return false;
                if (item.s.type === "*" || item.s.type === "Any") return false;
                return item.s.type === oldSlot.type;
            });
            if (specificMatches.length === 1) return specificMatches[0].i;

            if (oldIndex < node.outputs.length) {
                const targetSlot = node.outputs[oldIndex];
                const forceConnect = app.ui.settings.getSettingValue("AlignLayout.ReplaceNode.ForceConnect", true);

                if (forceConnect) return oldIndex;

                const isTypeCompatible = (
                    oldSlot.type === "*" || oldSlot.type === "Any" ||
                    targetSlot.type === "*" || targetSlot.type === "Any" ||
                    oldSlot.type === targetSlot.type
                );
                if (isTypeCompatible) return oldIndex;
            }

            return -1;
        }
    }
});
function nodeElement(node) {
    return document.querySelector(`.lg-node[data-node-id="${CSS.escape(String(node.id))}"]`);
}

// 使用独立 Canvas，避免 CSS box-shadow 的模糊算法和节点自身 filter 叠加。
function highlightNodes(nodes, { color, opacity, glow, stroke }) {
    const graphCanvas = app.canvas;
    const graph = graphCanvas.graph;
    const overlay = document.createElement("canvas");
    overlay.className = "alignlayout-replace-highlight";
    Object.assign(overlay.style, {
        position: "fixed", pointerEvents: "none", zIndex: "10"
    });
    graphCanvas.canvas.parentElement.appendChild(overlay);
    const ctx = overlay.getContext("2d");
    let frame;
    let previousGeometry = "";

    const refresh = () => {
        const viewport = graphCanvas.canvas.getBoundingClientRect();
        const scale = graphCanvas.ds.scale;
        const bounds = nodes.map(node => {
            if (app.canvas.graph !== graph || graph.getNodeById(node.id) !== node) return null;
            return nodeElement(node)?.getBoundingClientRect();
        }).filter(rect => rect && rect.width && rect.height);
        const geometry = [viewport.left, viewport.top, viewport.width, viewport.height,
            graphCanvas.canvas.width, graphCanvas.canvas.height, scale,
            ...bounds.flatMap(rect => [rect.left, rect.top, rect.width, rect.height])].join(",");

        if (geometry !== previousGeometry && viewport.width && viewport.height) {
            previousGeometry = geometry;
            overlay.width = graphCanvas.canvas.width;
            overlay.height = graphCanvas.canvas.height;
            Object.assign(overlay.style, {
                left: `${viewport.left}px`, top: `${viewport.top}px`,
                width: `${viewport.width}px`, height: `${viewport.height}px`
            });
            // 与默认画布相同的 backing 分辨率和缩放；shadowBlur 不随变换缩放。
            ctx.setTransform(overlay.width / viewport.width * scale, 0, 0,
                overlay.height / viewport.height * scale, 0, 0);
            ctx.shadowColor = color;
            ctx.shadowBlur = glow;
            ctx.strokeStyle = color;
            ctx.lineWidth = stroke;
            ctx.fillStyle = hexToRgba(color, opacity);
            for (const rect of bounds) {
                ctx.beginPath();
                ctx.roundRect((rect.left - viewport.left) / scale - 5,
                    (rect.top - viewport.top) / scale - 5,
                    rect.width / scale + 10, rect.height / scale + 10, 10);
                ctx.fill();
                ctx.stroke();
            }
        }
        frame = requestAnimationFrame(refresh);
    };
    refresh();
    return () => {
        cancelAnimationFrame(frame);
        overlay.remove();
    };
}

function hexToRgba(input, alpha) {
    if (!input) return input;
    let hex = input.toString().trim();
    if (hex.startsWith("0x")) hex = hex.slice(2);
    else if (hex.startsWith("#")) hex = hex.slice(1);
    if (!/^[0-9A-Fa-f]{3}$|^[0-9A-Fa-f]{6}$/.test(hex)) return input;
    if (hex.length === 3) hex = hex.split('').map(char => char + char).join('');
    const value = parseInt(hex, 16);
    return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${alpha})`;
}
