import { app } from "../../../scripts/app.js";

app.registerExtension({
    name: "Comfy.PortConnectMenu.Settings",
    settings: [
        {
            id: "PortConnectMenu.MenuFontSize",
            name: "Menu Font Size (px)",
            type: "slider",
            defaultValue: 12,
            attrs: { min: 10, max: 24, step: 1 },
            category: ["AlignLayout", "Connection Assistant", "Menu Font Size"],
            tooltip: "Font size of the node menu. Line height and content width adjust with the font size; node IDs remain aligned."
        },
        {
            id: "PortConnectMenu.MenuMaxWidth",
            name: "Menu Max Width (px)",
            type: "slider",
            defaultValue: 360,
            attrs: { min: 160, max: 800, step: 20 },
            category: ["AlignLayout", "Connection Assistant", "Menu Max Width"],
            tooltip: "Maximum width of the node menu. The menu still fits its contents and shrinks in narrow viewports. Long names show an ellipsis."
        },
        {
            id: "PortConnectMenu.HoverDelay",
            name: "Hover Delay (ms)",
            type: "slider",
            defaultValue: 200,
            attrs: { min: 0, max: 1000, step: 25 },
            category: ["AlignLayout", "Connection Assistant", "Hover Delay"],
            tooltip: "Wait before viewing a source node or a hovered menu item. Ctrl hover during a pending connection remains immediate."
        },
        {
            id: "PortConnectMenu.GlowStrength",
            name: "Node Glow Strength",
            type: "slider",
            defaultValue: 8,
            attrs: { min: 0, max: 50, step: 1 },
            category: ["AlignLayout", "Connection Assistant", "Glow Strength"],
            tooltip: "Glow blur radius around the node being viewed and compatible target ports. Set to 0 to keep only the highlight outlines."
        },
        {
            id: "PortConnectMenu.HighlightColor",
            name: "Node Highlight Color",
            type: "text",
            defaultValue: "#66CCFF",
            category: ["AlignLayout", "Connection Assistant", "Highlight Color"],
            tooltip: "Highlight and glow color of the node being viewed, compatible ports and parameter inputs, for example #66CCFF."
        },
        {
            id: "PortConnectMenu.AnimationDuration",
            name: "Animation Duration (ms)",
            type: "slider",
            defaultValue: 180,
            attrs: { min: 0, max: 1000, step: 10 },
            category: ["AlignLayout", "Connection Assistant", "Animation Duration"],
            tooltip: "Duration of pan and zoom when focusing a node and returning to the original view after connecting or cancelling. Set to 0 to position the view immediately."
        },
        {
            id: "PortConnectMenu.PreviewZoom",
            name: "Preview Zoom (%)",
            type: "slider",
            defaultValue: 125,
            attrs: { min: 50, max: 300, step: 5 },
            category: ["AlignLayout", "Connection Assistant", "Preview Zoom"],
            tooltip: "Canvas zoom percentage when viewing a node. Keep a larger existing zoom; limit zoom when horizontal space is insufficient. This is not a multiplier of the current zoom."
        },
        {
            id: "PortConnectMenu.TargetHoverZoom",
            name: "Target Hover Zoom",
            type: "boolean",
            defaultValue: true,
            category: ["AlignLayout", "Connection Assistant", "Target Hover Zoom"],
            tooltip: "Immediately zoom any node hovered while holding Ctrl during a pending connection. Does not disable previews selected from the node menu."
        },
        {
            id: "PortConnectMenu.SourceHoverZoom",
            name: "Source Hover Zoom",
            type: "boolean",
            defaultValue: true,
            category: ["AlignLayout", "Connection Assistant", "Source Hover Zoom"],
            tooltip: "Temporarily zoom the main view when holding Ctrl over a node before starting a connection. Release Ctrl to restore. Does not disable port dragging or menu previews."
        },
        {
            id: "PortConnectMenu.Enabled",
            name: "Enable Connection Assistant",
            type: "boolean",
            defaultValue: true,
            category: ["AlignLayout", "Connection Assistant", "Enable Feature"],
            tooltip: "Drag from a port with the left button, then press Ctrl while still holding it to lock the connection. Dragging from a Ctrl-hover zoomed node locks automatically. Release keeps the wire pending; click blank canvas to open the node menu. Release or click a compatible port to connect; Esc or right-click cancels."
        }
    ]
});
