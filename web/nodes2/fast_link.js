import { app } from "../../../scripts/app.js";
import { isEditing } from "../runtime.js";

// =========================================================
// 辅助函数：获取设置值
// =========================================================
function getSetting(id, defaultValue) {
    const value = app.extensionManager.setting.get(id);
    return value !== undefined ? value : defaultValue;
}

// =========================================================
// 插件逻辑
// =========================================================

export const createFastLink = (scope) => ({
    name: "Comfy.FastLink",

    setup() {
        this.commandState = {
            lastCmd: null,
            count: 0,
            lastTime: 0,
            lastSelection: ""
        };

        scope.listen(window, "keydown", (e) => {
            const enabled = getSetting("FastLink.Enabled", true);
            if (!enabled) return;

            const shortcutConfig = getSetting("FastLink.Shortcut", "F");
            const triggerKey = (shortcutConfig && shortcutConfig.length > 0)
                ? shortcutConfig.charAt(0).toUpperCase()
                : "F";

            if (e.key.toUpperCase() === triggerKey) {
                // 避免在输入框中触发
                if (isEditing(e.target)) return;
                if (e.metaKey) return;

                let cmdType = null;

                if (e.ctrlKey && e.shiftKey && e.altKey) {
                    cmdType = "CMD_CLEAR_INTERNAL";
                } else if (e.shiftKey && e.altKey) {
                    cmdType = "CMD_CLEAR_EXTERNAL";
                } else if (e.altKey) {
                    cmdType = "ALT_KEY";
                } else if (e.ctrlKey && e.shiftKey) {
                    cmdType = "CTRL_SHIFT_KEY";
                } else if (e.ctrlKey) {
                    cmdType = "CTRL_KEY";
                } else if (e.shiftKey) {
                    cmdType = "SHIFT_KEY";
                } else {
                    cmdType = "KEY";
                }

                if (cmdType) {
                    e.preventDefault();
                    e.stopPropagation();
                    this.executeCommand(cmdType);
                }
            }
        });
    },

    executeCommand(cmdType) {
        const currentSelectedNodes = app.canvas.selected_nodes || {};
        const currentIds = Object.keys(currentSelectedNodes).sort().join(",");
        const now = Date.now();

        const resetTimeout = getSetting("FastLink.ResetTimeout", 2000);

        if (currentIds !== this.commandState.lastSelection ||
            cmdType !== this.commandState.lastCmd ||
            (now - this.commandState.lastTime > resetTimeout)) {

            this.commandState.count = 0;
            this.commandState.lastSelection = currentIds;
            this.commandState.lastCmd = cmdType;
        } else {
            this.commandState.count++;
        }

        this.commandState.lastTime = now;

        const offset = this.commandState.count;

        // 轮询成功后再清理旧线，连接被拒绝时保留原有连接。
        switch (cmdType) {
            case "KEY": {
                // 多对一 (F)
                const nodes = this.getSortedSelection();
                this.reconnectSelectedLinks(nodes.slice(0, -1), nodes.slice(-1), offset,
                    options => this.connectManyToOne({ ...options, offset, cycleTargetSlots: offset > 0 }));
                break;
            }

            case "SHIFT_KEY": {
                // 一对多 (Shift+F)
                const nodes = this.getSortedSelectionStrict();
                this.reconnectSelectedLinks(nodes.slice(0, 1), nodes.slice(1), offset,
                    options => this.connectOneToMany({ ...options, offset, cycleSourceSlots: offset > 0 }));
                break;
            }

            case "CTRL_KEY": {
                // 强制多对一 (Ctrl+F)
                const nodes = this.getSortedSelection();
                this.reconnectSelectedLinks(nodes.slice(0, -1), nodes.slice(-1), offset,
                    options => this.connectManyToOne({ ...options, offset, force: true, cycleSourceNodes: offset > 0 }));
                break;
            }

            case "CTRL_SHIFT_KEY": {
                // 强制一对多 (Ctrl+Shift+F)
                const nodes = this.getSortedSelectionStrict();
                this.reconnectSelectedLinks(nodes.slice(0, 1), nodes.slice(1), offset,
                    options => this.connectOneToMany({ ...options, offset, force: true, cycleTargetNodes: offset > 0 }));
                break;
            }

            case "ALT_KEY":
                this.connectDaisyChain();
                break;

            case "CMD_CLEAR_INTERNAL":
                this.clearSelectedLinks(false);
                break;

            case "CMD_CLEAR_EXTERNAL":
                this.clearSelectedLinks(true);
                break;
        }
    },

    getSortedSelection() {
        if (!app.canvas.selected_nodes) return [];
        return this.sortNodesByVisualColumns(Object.values(app.canvas.selected_nodes));
    },

    getSortedSelectionStrict() {
        if (!app.canvas.selected_nodes) return [];
        return this.sortNodesByStrictLeft(Object.values(app.canvas.selected_nodes));
    },

    reconnectSelectedLinks(sources, targets, offset, connect) {
        if (!sources.length || !targets.length) return;
        if (offset === 0) return connect({});
        const graph = app.canvas.graph;
        const sourceIds = new Set(sources.map(n => n.id));
        const oldLinks = [];
        for (const target of targets) {
            for (const input of target.inputs || []) {
                const link = graph.links[input.link];
                if (link && sourceIds.has(link.origin_id)) oldLinks.push(link);
            }
        }
        const failedInputs = new Set();
        if (!connect({ reconnectSources: sourceIds, failedInputs })) return;
        for (const link of oldLinks) {
            if (graph.links[link.id] && !failedInputs.has(`${link.target_id}_${link.target_slot}`)) {
                graph.removeLink(link.id);
            }
        }
        graph.setDirtyCanvas(true, true);
    },

    clearSelectedLinks(external) {
        const selectedNodes = Object.values(app.canvas.selected_nodes || {});
        if (selectedNodes.length === 0) return;

        const graph = app.canvas.graph;
        const selectedNodeIds = new Set(selectedNodes.map(node => node.id));
        const linkIds = new Set();
        for (const node of selectedNodes) {
            for (const input of node.inputs || []) {
                if (input.link != null) linkIds.add(input.link);
            }
            for (const output of node.outputs || []) {
                for (const linkId of output.links || []) linkIds.add(linkId);
            }
        }

        let changed = false;
        for (const linkId of linkIds) {
            const link = graph.links[linkId];
            if (!link) continue;
            const sourceSelected = selectedNodeIds.has(link.origin_id);
            const targetSelected = selectedNodeIds.has(link.target_id);
            const shouldDisconnect = external
                ? sourceSelected !== targetSelected
                : sourceSelected && targetSelected;
            if (!shouldDisconnect) continue;
            if (!changed) graph.beforeChange();
            graph.removeLink(linkId);
            changed = true;
        }
        if (changed) {
            graph.afterChange();
            graph.setDirtyCanvas(true, true);
        }
    },

    sortNodesByVisualColumns(nodes) {
        const verticalThreshold = getSetting("FastLink.VerticalThreshold", 0.8);

        return nodes.sort((a, b) => {
            const aLeft = a.pos[0], aRight = a.pos[0] + a.renderingSize[0];
            const bLeft = b.pos[0], bRight = b.pos[0] + b.renderingSize[0];

            const overlap = Math.max(0, Math.min(aRight, bRight) - Math.max(aLeft, bLeft));
            const minWidth = Math.min(a.renderingSize[0], b.renderingSize[0]);

            const isVerticalStack = overlap > (minWidth * verticalThreshold);

            if (isVerticalStack) {
                if (a.pos[1] !== b.pos[1]) return a.pos[1] - b.pos[1];
                return a.id - b.id;
            } else {
                return a.pos[0] - b.pos[0];
            }
        });
    },

    sortNodesByStrictLeft(nodes) {
        return nodes.sort((a, b) => {
            if (a.pos[0] !== b.pos[0]) return a.pos[0] - b.pos[0];
            if (a.pos[1] !== b.pos[1]) return a.pos[1] - b.pos[1];
            return a.id - b.id;
        });
    },

    getConnectionScore(output, input, matchStrategy) {
        if (!LiteGraph.isValidConnection(output.type, input.type)) return -1;
        if (!input.type || !output.type || input.type === "*" || output.type === "*") return 1;
        if (matchStrategy === "type_only") return 3;
        return (input.name || "").toUpperCase() === (output.name || "").toUpperCase() ? 3 : 2;
    },

    connectSourcesToTarget(sources, targetNode, options = {}) {
        if (!targetNode.inputs) return false;
        const {
            force = false,
            offset = 0,
            cycleTargetSlots = false,
            cycleSourceSlots = false,
            sharedUsedOutputs = null,
            reconnectSources = null,
            failedInputs = null
        } = options;
        const usedSourceOutputs = sharedUsedOutputs || new Set();
        const matchStrategy = getSetting("FastLink.MatchStrategy", "name_type");
        const graph = app.canvas.graph;
        const slots = [];

        for (const [inputIndex, input] of targetNode.inputs.entries()) {
            const oldLink = graph.links[input.link];
            if (input.link != null && !force && !reconnectSources?.has(oldLink?.origin_id)) continue;
            const candidates = [];
            for (const sourceNode of sources) {
                if (sourceNode === targetNode) continue;
                for (const [outputIndex, output] of (sourceNode.outputs || []).entries()) {
                    if (!reconnectSources && oldLink?.origin_id === sourceNode.id && oldLink.origin_slot === outputIndex) continue;
                    const score = this.getConnectionScore(output, input, matchStrategy);
                    if (score < 0) continue;
                    candidates.push({ sourceNode, outputIndex, outputId: `${sourceNode.id}_${outputIndex}`, score, targetRank: 0 });
                }
            }
            candidates.sort((a, b) => b.score - a.score);
            if (candidates.length) slots.push({ inputIndex, candidates });
        }

        if (cycleTargetSlots) {
            // 每个输出按自己的兼容输入轮询，名称评分只决定起始顺序。
            const inputsByOutput = new Map();
            for (const slot of slots) {
                for (const candidate of slot.candidates) {
                    if (!inputsByOutput.has(candidate.outputId)) inputsByOutput.set(candidate.outputId, []);
                    inputsByOutput.get(candidate.outputId).push(candidate);
                }
            }
            for (const candidates of inputsByOutput.values()) {
                candidates.sort((a, b) => b.score - a.score);
                candidates.forEach((candidate, rank) => {
                    candidate.targetCount = candidates.length;
                    candidate.targetRank = (rank - offset % candidates.length + candidates.length) % candidates.length;
                });
            }
        }
        for (const slot of slots) {
            slot.candidates.sort((a, b) => a.targetRank - b.targetRank || b.score - a.score);
            // 单输入兼容组轮询来源；多输入兼容组只轮询输入，避免两次轮换抵消。
            const cycleSources = cycleSourceSlots ||
                (cycleTargetSlots && slot.candidates.every(candidate => candidate.targetCount === 1));
            const sourceOffset = cycleSources ? offset : 0;
            const candidateGroups = new Map();
            for (const candidate of slot.candidates) {
                if (!candidateGroups.has(candidate.targetRank)) candidateGroups.set(candidate.targetRank, []);
                candidateGroups.get(candidate.targetRank).push(candidate);
            }
            for (const candidates of candidateGroups.values()) {
                candidates.forEach((candidate, rank) => {
                    candidate.sourceRank = (rank - sourceOffset % candidates.length + candidates.length) % candidates.length;
                });
            }
        }

        if (cycleTargetSlots) {
            // 先处理各输出本轮优先的输入，不让其他类型的端口改变匹配顺序。
            slots.sort((a, b) => a.candidates[0].targetRank - b.candidates[0].targetRank || a.inputIndex - b.inputIndex);
        }
        let connectionMade = false;
        for (const slot of slots) {
            const candidates = slot.candidates.filter(candidate => sharedUsedOutputs || !usedSourceOutputs.has(candidate.outputId));
            candidates.sort((a, b) =>
                Number(usedSourceOutputs.has(a.outputId)) - Number(usedSourceOutputs.has(b.outputId)) ||
                a.targetRank - b.targetRank || a.sourceRank - b.sourceRank);
            let connected = false;
            for (const candidate of candidates) {
                // 原生 connect 会先验证并允许节点拒绝，再替换旧线。
                const link = candidate.sourceNode.connect(candidate.outputIndex, targetNode, slot.inputIndex);
                if (!link) continue;
                usedSourceOutputs.add(candidate.outputId);
                connectionMade = true;
                connected = true;
                break;
            }
            if (candidates.length && !connected) failedInputs?.add(`${targetNode.id}_${slot.inputIndex}`);
        }
        return connectionMade;
    },

    connectManyToOne(options = {}) {
        const nodes = this.getSortedSelection();
        if (nodes.length < 2) return;

        const targetNode = nodes.pop();
        let sourceNodes = nodes;

        if (options.cycleSourceNodes) {
            const idx = (options.offset - 1) % sourceNodes.length;
            sourceNodes = [sourceNodes[idx]];
        }

        const changed = this.connectSourcesToTarget(sourceNodes, targetNode, options);
        if (changed) app.canvas.graph.setDirtyCanvas(true, true);
        return changed;
    },

    connectOneToMany(options = {}) {
        const nodes = this.getSortedSelectionStrict();
        if (nodes.length < 2) return;

        const sourceNode = nodes.shift();
        let targetNodes = nodes;

        if (options.cycleTargetNodes) {
            const idx = (options.offset - 1) % targetNodes.length;
            targetNodes = [targetNodes[idx]];
        }

        // 共享 Set：用于在多个目标节点之间协调端口占用情况
        const batchUsedSourceOutputs = new Set();
        const sharedOptions = { ...options, sharedUsedOutputs: batchUsedSourceOutputs };

        let changed = false;
        for (const targetNode of targetNodes) {
            if (this.connectSourcesToTarget([sourceNode], targetNode, sharedOptions)) {
                changed = true;
            }
        }

        if (changed) app.canvas.graph.setDirtyCanvas(true, true);
        return changed;
    },

    connectDaisyChain() {
        const nodes = this.getSortedSelection();
        if (nodes.length < 2) return;

        let changed = false;
        let currentSource = nodes[0];

        for (let i = 1; i < nodes.length; i++) {
            const target = nodes[i];
            if (this.connectSourcesToTarget([currentSource], target, { force: false })) {
                currentSource = target;
                changed = true;
            }
        }

        if (changed) app.canvas.graph.setDirtyCanvas(true, true);
    }
});
