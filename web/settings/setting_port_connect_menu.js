import { app } from "../../../scripts/app.js";

app.registerExtension({
    name: "Comfy.PortConnectMenu.Settings",
    settings: [{
        id: "PortConnectMenu.Enabled",
        name: "Enable Port Connection Menu",
        type: "boolean",
        defaultValue: true,
        category: ["AlignLayout", "PortConnectMenu", "Enable Feature"],
        tooltip: "Ctrl + hover temporarily zooms the main view to a source node; release Ctrl to restore. Ctrl + drag to a target zooms it until you leave, connect or cancel. Menu hover places the target to the right of the fixed menu. Release or click a compatible port to connect; Esc cancels and restores the original view."
    }]
});
