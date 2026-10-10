import { app } from "../../../scripts/app.js";
import { isEditing } from "../runtime.js";

// 注册扩展
export const createAligner = (scope) => ({
    name: "Comfy.NodeAligner",
    async setup() {
        // --- 设置 ID 常量 ---
        const SETTING_IDS = {
            RADIUS: "NodeAligner.Radius",
            FLICK_DIST: "NodeAligner.FlickDistance",
            FLICK_SPEED: "NodeAligner.FlickSpeed",
            SHORTCUT: "NodeAligner.Shortcut",
            ENABLED: "NodeAligner.Enabled",
            // 按钮配置 ID (仅保留环形菜单)
            BTN_TOP: "NodeAligner.Btn.Top",
            BTN_BOTTOM: "NodeAligner.Btn.Bottom",
            BTN_LEFT: "NodeAligner.Btn.Left",
            BTN_RIGHT: "NodeAligner.Btn.Right",
            BTN_TOP_LEFT: "NodeAligner.Btn.TopLeft",
            BTN_TOP_RIGHT: "NodeAligner.Btn.TopRight",
            BTN_BOTTOM_LEFT: "NodeAligner.Btn.BottomLeft",
            BTN_BOTTOM_RIGHT: "NodeAligner.Btn.BottomRight",
            // 默认间距设置
            GAP_H: "NodeAligner.DefaultGap.H",
            GAP_V: "NodeAligner.DefaultGap.V",
            SPACING_ALIGN_H: "NodeAligner.SpacingAlign.H",
            SPACING_ALIGN_V: "NodeAligner.SpacingAlign.V"
        };

        // --- 核心状态 ---
        let lastMousePos = { x: 0, y: 0 };
        let flickStartPos = null;
        let flickStartTime = 0;
        let isTrackingFlick = false;

        // [新增] 内存缓存变量 (刷新页面后会自动重置为 null)
        let cachedGapH = null;
        let cachedGapV = null;

        // 静态常量
        const btnBg = "rgba(34, 34, 34, 0.6)";
        const btnHoverBg = "rgba(68, 68, 68, 0.7)";
        const iconScale = 0.7;

        // SVG 图标库
        const svgIcons = {
            top: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 17.07 17.07"><rect fill="#c2c2c2" x="9.13" y="5.78" width="3.45" height="5.52" rx=".82"/><rect fill="#c2c2c2" x="4.66" y="5.78" width="3.45" height="8.28" rx=".82"/><line stroke="#c2c2c2" stroke-linecap="round" stroke-width=".69" fill="none" x1="3.36" y1="4.48" x2="13.71" y2="4.48"/><circle fill="none" stroke="none" cx="8.54" cy="8.54" r="8.54"/></svg>`,
            bottom: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 17.07 17.07"><rect fill="#c2c2c2" x="9.13" y="5.95" width="3.45" height="5.52" rx=".82"/><rect fill="#c2c2c2" x="4.66" y="3.19" width="3.45" height="8.28" rx=".82"/><line stroke="#c2c2c2" stroke-linecap="round" stroke-width=".69" fill="none" x1="3.36" y1="12.76" x2="13.71" y2="12.76"/><circle fill="none" stroke="none" cx="8.54" cy="8.54" r="8.54"/></svg>`,
            right: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 17.07 17.07"><rect fill="#c2c2c2" x="6.5" y="3.45" width="3.45" height="5.52" rx=".82" transform="translate(2.01 14.43) rotate(-90)"/><rect fill="#c2c2c2" x="2.7" y="8.96" width="8.28" height="3.45" rx=".82"/><line stroke="#c2c2c2" stroke-linecap="round" stroke-width=".69" x1="12.27" y1="13.71" x2="12.27" y2="3.36"/><circle fill="none" stroke="none" cx="8.54" cy="8.54" r="8.54"/></svg>`,
            left: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 17.07 17.07"><rect fill="#c2c2c2" x="7.18" y="3.45" width="3.45" height="5.52" rx=".82" transform="translate(2.69 15.12) rotate(-90)"/><rect fill="#c2c2c2" x="6.14" y="8.96" width="8.28" height="3.45" rx=".82"/><line stroke="#c2c2c2" stroke-linecap="round" stroke-width=".69" x1="4.85" y1="13.71" x2="4.85" y2="3.36"/><circle fill="none" stroke="none" cx="8.54" cy="8.54" r="8.54"/></svg>`,
            v_center: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 11 11"><rect fill="#c2c2c2" x="6.33" y="3.2" width="2.07" height="4.6" rx=".58"/><rect fill="#c2c2c2" x="2.71" y="2.05" width="2.48" height="6.9" rx=".64"/><line stroke="#c2c2c2" stroke-linecap="round" stroke-width=".52" x1="1.36" y1="5.5" x2="9.64" y2="5.5"/><circle fill="none" stroke="none" cx="5.5" cy="5.5" r="5.5"/></svg>`,
            h_center: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 11 11"><rect fill="#c2c2c2" x="4.47" y="1.48" width="2.07" height="4.6" rx=".58" transform="translate(1.72 9.28) rotate(-90)"/><rect fill="#c2c2c2" x="2.05" y="5.77" width="6.9" height="2.48" rx=".64"/><line stroke="#c2c2c2" stroke-linecap="round" stroke-width=".52" x1="5.5" y1="9.64" x2="5.5" y2="1.36"/><circle fill="none" stroke="none" cx="5.5" cy="5.5" r="5.5"/></svg>`,
            spacing_v: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 11 11"><rect fill="#c2c2c2" x="3.08" y="3.46" width="4.84" height="1.83" rx=".46" ry=".46"/><line stroke="#c2c2c2" stroke-linecap="round" stroke-width=".31" x1="8.58" y1="2.68" x2="2.42" y2="2.68"/><rect fill="#c2c2c2" x="3.08" y="6.07" width="4.84" height="1.68" rx=".44" ry=".44"/><line stroke="#c2c2c2" stroke-linecap="round" stroke-width=".31" x1="8.58" y1="8.52" x2="2.42" y2="8.52"/><circle fill="none" stroke="none" cx="5.5" cy="5.5" r="5.5"/></svg>`,
            spacing_h: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 11 11"><rect fill="#c2c2c2" x="3.46" y="3.08" width="1.83" height="4.84" rx=".46" ry=".46"/><line stroke="#c2c2c2" stroke-linecap="round" stroke-width=".31" x1="2.68" y1="2.42" x2="2.68" y2="8.58"/><rect fill="#c2c2c2" x="6.07" y="3.08" width="1.68" height="4.84" rx=".44" ry=".44"/><line stroke="#c2c2c2" stroke-linecap="round" stroke-width=".31" x1="8.52" y1="2.42" x2="8.52" y2="8.58"/><circle fill="none" stroke="none" cx="5.5" cy="5.5" r="5.5"/></svg>`,
            auto_layout: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 11 11"><circle fill="none" stroke="none" cx="5.5" cy="5.5" r="5.5"/><line stroke="#c2c2c2" stroke-linecap="round" stroke-width=".31" x1="5.5" y1="3.71" x2="5.5" y2="5.23"/><rect fill="#c2c2c2" x="4.5" y="2.26" width="2" height="2" rx=".31" ry=".31"/><path fill="none" stroke="#c2c2c2" stroke-linecap="round" stroke-width=".28" d="M3.5,6.92v-1.35c0-.17.14-.3.3-.3h3.39c.17,0,.3.14.3.3v1.35"/><rect fill="#c2c2c2" x="2.5" y="6.26" width="2" height="2" rx=".31" ry=".31"/><rect fill="#c2c2c2" x="6.5" y="6.26" width="2" height="2" rx=".31" ry=".31"/></svg>`
        };

        // 命令到图标 Key 的映射
        const cmdToIconKey = {
            "top": "top",
            "bottom": "bottom",
            "left": "left",
            "right": "right",
            "v_center": "v_center",
            "h_center": "h_center",
            "spacing_dist_v": "spacing_v",
            "spacing_dist_h": "spacing_h",
            "auto_layout": "auto_layout"
        };

        const getIconHtml = (cmd) => {
            const key = cmdToIconKey[cmd] || cmd;
            return svgIcons[key] || "";
        };

        // --- 初始化 UI ---
        const panel = document.createElement("div");
        panel.id = "node-align-panel";
        panel.style.cssText = "display:none; position:fixed; z-index:1001; pointer-events:none; width:500px; height:400px;";

        const ringContainer = document.createElement("div");
        ringContainer.style.cssText = "position:absolute; width:100%; height:400px;";
        panel.appendChild(ringContainer);

        const pointerWrapper = document.createElement("div");
        pointerWrapper.style.cssText = "position:absolute; width:40px; height:40px; left:230px; top:180px; pointer-events:none; transition:transform 0.05s linear;";
        const triangle = document.createElement("div");
        triangle.style.cssText = "position:absolute; top:-10px; left:50%; transform:translateX(-50%); width:0; height:0; border-left:6px solid transparent; border-right:6px solid transparent; border-bottom:10px solid #c2c2c2;";
        pointerWrapper.appendChild(triangle);
        ringContainer.appendChild(pointerWrapper);

        const autoLayoutBtn = createPillButton(getIconHtml("auto_layout"), 36, 36, true);
        autoLayoutBtn.title = "Auto Layout (Graph)";
        autoLayoutBtn.style.position = "absolute";
        autoLayoutBtn.style.left = "232px";
        autoLayoutBtn.style.top = "182px";
        autoLayoutBtn.onclick = (e) => {
            e.stopPropagation();
            if (window.__comfy_auto_layout_instance) {
                window.__comfy_auto_layout_instance.arrangeNodes();
                closePanel();
            } else {
                console.warn("Auto Layout extension not initialized.");
            }
        };
        ringContainer.appendChild(autoLayoutBtn);

        const getDefaultGap = (cmd) => app.ui.settings.getSettingValue(
            cmd === "spacing_dist_v" ? SETTING_IDS.GAP_V : SETTING_IDS.GAP_H, 10
        );
        let ringActions = [];

        const updateRingButtons = () => {
            const s = app.ui.settings;
            const configuredAction = (id, fallback, angle) => {
                const configured = s.getSettingValue(id, fallback);
                const cmd = Object.hasOwn(cmdToIconKey, configured) ? configured : fallback;
                return { cmd, angle };
            };
            ringActions = [
                configuredAction(SETTING_IDS.BTN_RIGHT, "right", 0),
                configuredAction(SETTING_IDS.BTN_BOTTOM_RIGHT, "spacing_dist_h", 45),
                configuredAction(SETTING_IDS.BTN_BOTTOM, "bottom", 90),
                configuredAction(SETTING_IDS.BTN_BOTTOM_LEFT, "spacing_dist_v", 135),
                configuredAction(SETTING_IDS.BTN_LEFT, "left", 180),
                configuredAction(SETTING_IDS.BTN_TOP_LEFT, "h_center", 225),
                configuredAction(SETTING_IDS.BTN_TOP, "top", 270),
                configuredAction(SETTING_IDS.BTN_TOP_RIGHT, "v_center", 315)
            ];

            ringContainer.querySelectorAll(".comfy-node-align-action").forEach(btn => btn.remove());
            const currentRadius = s.getSettingValue(SETTING_IDS.RADIUS, 140);
            ringActions.forEach(action => {
                const rad = action.angle * Math.PI / 180;
                const x = 250 + currentRadius * Math.cos(rad);
                const y = 200 + currentRadius * Math.sin(rad);
                let control;
                if (action.cmd === "spacing_dist_v" || action.cmd === "spacing_dist_h") {
                    const vertical = action.cmd === "spacing_dist_v";
                    const cached = vertical ? cachedGapV : cachedGapH;
                    control = createCapsuleGroup(action.cmd,
                        vertical ? "Vertical Distribution Spacing"
                            : "Horizontal Distribution Spacing",
                        cached !== null ? cached : getDefaultGap(action.cmd),
                        (val) => { if (vertical) cachedGapV = val; else cachedGapH = val; });
                    control.style.position = "absolute";
                    control.style.left = `${x}px`;
                    // 小半径时外移下方胶囊，避免与底部控件重叠。
                    if (action.angle === 45 || action.angle === 135) {
                        const offset = Math.max(currentRadius * Math.SQRT1_2, 96);
                        control.style.left = `${250 + (action.angle === 45 ? offset : -offset)}px`;
                    }
                    control.style.top = `${y}px`;
                    control.style.transform = "translate(-50%, -50%)";
                } else {
                    const isSpecial = ["top", "bottom", "left", "right"].includes(action.cmd);
                    const w = isSpecial ? 63 : 54;
                    const h = isSpecial ? 42 : 36;
                    control = createPillButton(getIconHtml(action.cmd), w, h, false);
                    control.style.left = `${x - w / 2}px`;
                    control.style.top = `${y - h / 2}px`;
                    control.onclick = (e) => { e.stopPropagation(); alignNodes(action.cmd); };
                }
                control.classList.add("comfy-node-align-action");
                ringContainer.appendChild(control);
            });
        };

        // 数字框的步进箭头会在右侧预留空白，去除后数值可以靠近执行图标。
        const inputStyle = document.createElement("style");
        inputStyle.textContent = `
            #node-align-panel input[type="number"]::-webkit-inner-spin-button,
            #node-align-panel input[type="number"]::-webkit-outer-spin-button {
                -webkit-appearance: none;
                margin: 0;
            }
        `;
        document.head.appendChild(inputStyle);
        scope.add(() => inputStyle.remove());

        // 创建胶囊型控制组 (左数值 - 右图标)
        // [修改] 参数改为 currentValue 和 onInput 回调
        const createCapsuleGroup = (cmd, tooltip, currentValue, onInput) => {
            const iconHtml = getIconHtml(cmd);
            const container = document.createElement("div");
            container.style.cssText = `
                box-sizing: border-box;
                height: 36px;
                display: flex;
                align-items: center;
                gap: 1px;
                background: ${btnBg};
                border: 1px solid rgba(102, 102, 102, 0.3);
                border-radius: 999px;
                /* 补偿右侧按钮与 SVG 内部的留白，使可见内容两侧间距一致。 */
                padding: 3px 8px 3px 15px;
                pointer-events: auto;
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
            `;

            const input = document.createElement("input");
            input.type = "number";

            // [修改] 直接使用传入的当前值 (内存值或默认值)
            input.value = currentValue;

            input.style.cssText = `
                height: 24px;
                flex-shrink: 0;
                background: transparent;
                border: none;
                color: #666;
                text-align: left;
                font-size: 13px;
                line-height: 24px;
                padding: 2px 0 1px;
                appearance: textfield;
                outline: none;
                transition: color 0.2s;
            `;

            const updateInputWidth = () => {
                input.style.width = `calc(${Math.max(1, input.value.length)}ch + 2px)`;
            };
            updateInputWidth();

            const highlightInput = () => { input.style.color = "#c2c2c2"; };
            const dimInput = () => { if(document.activeElement !== input) input.style.color = "#666"; };

            input.onmouseenter = highlightInput;
            input.onmouseleave = dimInput;
            input.onfocus = () => { isTrackingFlick = false; highlightInput(); };
            input.onblur = dimInput;
            input.onclick = (e) => { e.stopPropagation(); input.focus(); };
            input.onpointerdown = (e) => e.stopPropagation();

            input.addEventListener("input", () => {
                updateInputWidth();
                onInput?.(input.value);
            });

            const trigger = () => {
                let val = parseInt(input.value);
                if (isNaN(val)) val = getDefaultGap(cmd);
                alignNodes(cmd, val);
            };
            input.onkeydown = (e) => {
                e.stopPropagation();
                if (e.key === "Enter") trigger();
                else if (e.key === "Escape") closePanel();
            };

            const btn = document.createElement("div");
            btn.innerHTML = iconHtml;
            btn.title = tooltip;
            btn.style.cssText = `
                width: 28px;
                height: 28px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: transform 0.2s, background-color 0.2s, filter 0.2s;
                border-radius: 50%;
            `;
            const svg = btn.querySelector("svg");
            if (svg) {
                svg.style.width = "20px";
                svg.style.height = "20px";
                svg.style.display = "block";
            }

            btn.onmouseover = () => {
                btn.style.transform = "scale(1.15)";
                btn.style.backgroundColor = "rgba(255, 255, 255, 0.1)";
                btn.style.filter = "brightness(1.5)";
                highlightInput();
            };
            btn.onmouseout = () => {
                btn.style.transform = "scale(1.0)";
                btn.style.backgroundColor = "transparent";
                btn.style.filter = "none";
                dimInput();
            };
            btn.onclick = (e) => { e.stopPropagation(); trigger(); };

            container.appendChild(input);
            container.appendChild(btn);
            return container;
        };

        document.body.appendChild(panel);

        function createPillButton(html, w, h, isStatic = false) {
            const btn = document.createElement("button");
            btn.innerHTML = html;
            btn.className = "comfy-node-align-btn";
            const posType = isStatic ? "static" : "absolute";
            btn.style.cssText = `box-sizing: border-box; position: ${posType}; width: ${w}px; height: ${h}px; border-radius: 999px; border: 1px solid rgba(102, 102, 102, 0.3); background: ${btnBg}; color: white; cursor: pointer; pointer-events: auto; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1); display: flex; align-items: center; justify-content: center; padding: 0; transition: transform 0.1s, background 0.2s; flex-shrink: 0;`;

            const svg = btn.querySelector("svg");
            if (svg) {
                const iconSize = Math.min(w, h) * iconScale;
                svg.style.width = `${iconSize}px`; svg.style.height = `${iconSize}px`; svg.style.display = "block";
            }
            if (!isStatic) {
                btn.onmouseover = () => { btn.style.background = btnHoverBg; btn.style.transform = "scale(1.08)"; };
                btn.onmouseout = () => { btn.style.background = btnBg; btn.style.transform = "scale(1.0)"; };
            } else {
                btn.onmouseover = () => { btn.style.background = btnHoverBg; btn.style.transform = "scale(1.15)"; };
                btn.onmouseout = () => { btn.style.background = btnBg; btn.style.transform = "scale(1.0)"; };
            }
            return btn;
        }

        function closePanel() {
            panel.style.display = "none";
            isTrackingFlick = false;
            window.__comfy_align_active = false;
        }

        scope.expose("__comfy_align_active", false);
        scope.expose("__comfy_align_close", closePanel);
        scope.add(() => { closePanel(); panel.remove(); });

        scope.listen(window, "mousemove", (e) => {
            const enabled = app.ui.settings.getSettingValue(SETTING_IDS.ENABLED, true);
            if (!enabled) return;

            lastMousePos = { x: e.clientX, y: e.clientY };
            if (panel.style.display === "block" && flickStartPos) {
                const dx = e.clientX - flickStartPos.x;
                const dy = e.clientY - flickStartPos.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const angle = Math.atan2(dy, dx) * 180 / Math.PI;
                pointerWrapper.style.transform = `rotate(${angle + 90}deg)`;

                const currentDistThreshold = app.ui.settings.getSettingValue(SETTING_IDS.FLICK_DIST, 80);
                const currentSpeedThreshold = app.ui.settings.getSettingValue(SETTING_IDS.FLICK_SPEED, 0.6);

                pointerWrapper.style.opacity = dist > 20 ? "1" : "0.3";
                if (isTrackingFlick && dist > currentDistThreshold) {
                    const timeDelta = Date.now() - flickStartTime;
                    if (dist / timeDelta > currentSpeedThreshold) {
                        isTrackingFlick = false;
                        handleFlickGesture((angle + 360) % 360);
                    }
                }
            }
        }, true);

        function handleFlickGesture(angle) {
            let closest = ringActions[0];
            let minDiff = 360;
            ringActions.forEach(a => {
                let diff = Math.abs(angle - a.angle);
                if (diff > 180) diff = 360 - diff;
                if (diff < minDiff) { minDiff = diff; closest = a; }
            });
            if (closest.cmd === "spacing_dist_v" || closest.cmd === "spacing_dist_h") {
                alignNodes(closest.cmd, getDefaultGap(closest.cmd));
            } else {
                alignNodes(closest.cmd);
            }
        }

        scope.listen(window, "keydown", (e) => {
            if (e.key === "Escape") { closePanel(); return; }
            if (isEditing(e.target)) return;
            const enabled = app.ui.settings.getSettingValue(SETTING_IDS.ENABLED, true);
            if (!enabled) return;

            const shortcutStr = app.ui.settings.getSettingValue(SETTING_IDS.SHORTCUT, "Alt+A");
            if (!shortcutStr) return;

            const keys = shortcutStr.split('+').map(k => k.trim().toLowerCase());
            const mainKey = keys.pop();

            const isCtrl = keys.includes('ctrl') || keys.includes('control');
            const isAlt = keys.includes('alt') || keys.includes('option');
            const isShift = keys.includes('shift');
            const isMeta = keys.includes('meta') || keys.includes('cmd') || keys.includes('command');

            if (e.ctrlKey !== isCtrl) return;
            if (e.altKey !== isAlt) return;
            if (e.shiftKey !== isShift) return;
            if (e.metaKey !== isMeta) return;

            const code = e.code.toLowerCase();
            const key = e.key.toLowerCase();

            let match = false;
            if (key === mainKey) match = true;
            if (code === mainKey) match = true;
            if (code === 'key' + mainKey) match = true;

            if (match) {
                const selected = Object.values(app.canvas.selected_nodes || {});
                if (selected.length < 2) return;
                e.preventDefault();

                if (window.__comfy_resizer_close) window.__comfy_resizer_close();

                updateRingButtons();

                panel.style.left = (lastMousePos.x - 250) + "px";
                panel.style.top = (lastMousePos.y - 200) + "px";
                panel.style.display = "block";
                window.__comfy_align_active = true;

                flickStartPos = { ...lastMousePos };
                flickStartTime = Date.now();
                isTrackingFlick = true;
                pointerWrapper.style.transform = `rotate(0deg)`;
                pointerWrapper.style.opacity = "0.3";
            }
        });

        scope.listen(window, "pointerdown", (e) => {
            if (!window.__comfy_align_active) return;
            if (panel.contains(e.target)) {
                isTrackingFlick = false;
                return;
            }
            closePanel();
        }, true);

        function alignNodes(type, value = 10) {
            const nodes = Object.values(app.canvas.selected_nodes || {});
            if (nodes.length < 2) return;
            app.canvas.graph.beforeChange();
            const b = {
                minX: Math.min(...nodes.map(n => n.pos[0])),
                maxX: Math.max(...nodes.map(n => n.pos[0] + n.size[0])),
                minY: Math.min(...nodes.map(n => n.pos[1])),
                maxY: Math.max(...nodes.map(n => n.pos[1] + n.size[1])),
                avgCX: nodes.reduce((acc, n) => acc + (n.pos[0] + n.size[0]/2), 0) / nodes.length,
                avgCY: nodes.reduce((acc, n) => acc + (n.pos[1] + n.size[1]/2), 0) / nodes.length
            };
            switch (type) {
                case "left": nodes.forEach(n => n.pos[0] = b.minX); break;
                case "right": nodes.forEach(n => n.pos[0] = b.maxX - n.size[0]); break;
                case "top": nodes.forEach(n => n.pos[1] = b.minY); break;
                case "bottom": nodes.forEach(n => n.pos[1] = b.maxY - n.size[1]); break;
                case "h_center": nodes.forEach(n => n.pos[0] = b.avgCX - n.size[0]/2); break;
                case "v_center": nodes.forEach(n => n.pos[1] = b.avgCY - n.size[1]/2); break;

                case "spacing_dist_v": {
                    distributeWithSpacing(nodes, 1, value,
                        app.ui.settings.getSettingValue(SETTING_IDS.SPACING_ALIGN_V, "left"));
                    break;
                }
                case "spacing_dist_h": {
                    distributeWithSpacing(nodes, 0, value,
                        app.ui.settings.getSettingValue(SETTING_IDS.SPACING_ALIGN_H, "top"));
                    break;
                }

                case "auto_layout": {
                    if (window.__comfy_auto_layout_instance) {
                        window.__comfy_auto_layout_instance.arrangeNodes();
                    }
                    break;
                }
            }
            app.canvas.graph.afterChange(); app.canvas.draw(true, true); closePanel();
        }

        // --- 智能锚点查找函数 ---
        function getAnchorNode(nodes, axis) {
            const primaryProp = axis === 0 ? 0 : 1;
            const secondaryProp = axis === 0 ? 1 : 0;

            // 1. 找到主轴上的最小值
            const minVal = Math.min(...nodes.map(n => n.pos[primaryProp]));

            // 2. 筛选出在容差范围内 (5px) 的“最左/最上”候选节点
            const tolerance = 5;
            let candidates = nodes.filter(n => n.pos[primaryProp] <= minVal + tolerance);

            // 3. 按副轴排序
            candidates.sort((a, b) => a.pos[secondaryProp] - b.pos[secondaryProp]);

            // 筛选出副轴上也是“最靠前”的节点 (容差5px)
            const minSecVal = candidates[0].pos[secondaryProp];
            candidates = candidates.filter(n => n.pos[secondaryProp] <= minSecVal + tolerance);

            // 4. 优先选择“工作流开头”节点
            const isStartNode = (n) => {
                if (!n.inputs || n.inputs.length === 0) return true;
                return !n.inputs.some(inp => inp.link !== null);
            };

            const startNodes = candidates.filter(isStartNode);
            if (startNodes.length > 0) {
                candidates = startNodes;
            }

            // 5. 最后使用 ID 排序兜底
            candidates.sort((a, b) => a.id - b.id);

            return candidates[0];
        }

        // --- 优化后的间距分布函数 ---
        function distributeWithSpacing(nodes, axis, gap, alignment) {
            // 1. 智能选择锚点
            const anchor = getAnchorNode(nodes, axis);

            // 2. 将锚点从列表中移除，剩余节点进行排序
            let remaining = nodes.filter(n => n.id !== anchor.id);
            const crossAxis = axis === 0 ? 1 : 0;

            remaining.sort((a, b) => {
                const diff1 = a.pos[axis] - b.pos[axis];
                if (Math.abs(diff1) > 5) return diff1;

                const diff2 = a.pos[crossAxis] - b.pos[crossAxis];
                if (Math.abs(diff2) > 5) return diff2;

                return a.id - b.id;
            });

            // 3. 构建最终处理队列，锚点必须在第一位
            const sorted = [anchor, ...remaining];

            const titleOffset = (node, ax) => ax === 1
                && node.type !== "Reroute" && node.type !== "Reroute (rgthree)"
                ? LiteGraph.NODE_TITLE_HEIGHT : 0;
            const getVisualSize = (node, ax) => node.size[ax] + titleOffset(node, ax);

            // 初始化位置
            let currentPos = anchor.pos[axis] - titleOffset(anchor, axis)
                + getVisualSize(anchor, axis) + gap;

            // 按所选边缘或中心线对齐，锚点位置不动。
            const anchorVisualSizeOnCross = getVisualSize(anchor, crossAxis);
            const anchorStart = anchor.pos[crossAxis] - titleOffset(anchor, crossAxis);
            const factor = alignment === "center" ? 0.5
                : alignment === "bottom" || alignment === "right" ? 1 : 0;

            sorted.forEach((n, i) => {
                if (i === 0) return; // 锚点位置不动

                // 更新主轴位置
                n.pos[axis] = currentPos + titleOffset(n, axis);

                // 累加位置
                currentPos += getVisualSize(n, axis) + gap;

                const myVisualSizeOnCross = getVisualSize(n, crossAxis);
                n.pos[crossAxis] = anchorStart
                    + (anchorVisualSizeOnCross - myVisualSizeOnCross) * factor
                    + titleOffset(n, crossAxis);
            });
        }
    }
});
