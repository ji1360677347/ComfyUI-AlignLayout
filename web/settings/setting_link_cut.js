import { app } from "../../../scripts/app.js";

app.registerExtension({
    name: "Comfy.LinkCut.Settings",
    settings: [
        {
            id: "LinkCut.GlowStrength",
            name: "Glow Strength",
            type: "slider",
            defaultValue: 8,
            min: 0,
            max: 50,
            step: 1,
            category: ["AlignLayout", "LinkCut", "Glow Strength"],
            tooltip: "Glow blur radius around links approached while holding Ctrl. Set to 0 for a colored highlight without glow."
        },
        {
            id: "LinkCut.HighlightColor",
            name: "Highlight Color",
            type: "text",
            defaultValue: "#66CCFF",
            category: ["AlignLayout", "LinkCut", "Highlight Color"],
            tooltip: "Color of the approached link and its glow, for example #66CCFF."
        },
        {
            id: "LinkCut.Enabled",
            name: "Enable Link Cut",
            type: "boolean",
            defaultValue: true,
            category: ["AlignLayout", "LinkCut", "Enable Feature"],
            tooltip: "Hold Ctrl to highlight nearby links. Drag across them with the right mouse button to disconnect; Ctrl+Z restores the whole stroke. Independent of Fast Link."
        }
    ]
});
