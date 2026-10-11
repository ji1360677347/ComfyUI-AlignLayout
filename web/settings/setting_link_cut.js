import { app } from "../../../scripts/app.js";

app.registerExtension({
    name: "Comfy.LinkCut.Settings",
    settings: [
        {
            id: "LinkCut.TrailWidth",
            name: "Trail Width (px)",
            type: "slider",
            defaultValue: 2,
            attrs: { min: 1, max: 10, step: 0.5 },
            category: ["AlignLayout", "LinkCut", "Trail Width"],
            tooltip: "Width of the mouse trail in screen pixels, independent of canvas zoom. Applies to the next stroke and does not change the link cutting distance."
        },
        {
            id: "LinkCut.TrailColor",
            name: "Trail Color",
            type: "text",
            defaultValue: "#FFFFFF",
            category: ["AlignLayout", "LinkCut", "Trail Color"],
            tooltip: "Mouse trail color, for example #FFFFFF. Applies to the next stroke."
        },
        {
            id: "LinkCut.TrailEnabled",
            name: "Show Mouse Trail",
            type: "boolean",
            defaultValue: true,
            category: ["AlignLayout", "LinkCut", "Show Mouse Trail"],
            tooltip: "Show the mouse path during a cutting stroke. Applies to the next stroke; hiding the trail does not disable link cutting or highlighting."
        },
        {
            id: "LinkCut.CutDistance",
            name: "Cut Detection Distance (px)",
            type: "slider",
            defaultValue: 4,
            attrs: { min: 1, max: 20, step: 0.5 },
            category: ["AlignLayout", "LinkCut", "Cut Detection Distance"],
            tooltip: "Maximum screen distance from the drawn link path that cuts it during Ctrl + right drag. Independent of zoom and trail width; larger values make cutting easier."
        },
        {
            id: "LinkCut.HighlightDistance",
            name: "Highlight Start Distance (px)",
            type: "slider",
            defaultValue: 12,
            attrs: { min: 2, max: 40, step: 0.5 },
            category: ["AlignLayout", "LinkCut", "Highlight Start Distance"],
            tooltip: "Screen distance at which Ctrl hover starts highlighting a link. Brightness increases toward the cut boundary. The effective distance is at least 1px larger than the cut distance to keep a smooth transition."
        },
        {
            id: "LinkCut.GlowStrength",
            name: "Glow Strength",
            type: "slider",
            defaultValue: 8,
            attrs: { min: 0, max: 50, step: 1 },
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
