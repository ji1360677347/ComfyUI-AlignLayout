import { app } from "../../../scripts/app.js";

app.registerExtension({
    name: "Comfy.PortConnectMenu.Settings",
    settings: [{
        id: "PortConnectMenu.Enabled",
        name: "Enable Port Connection Menu",
        type: "boolean",
        defaultValue: true,
        category: ["AlignLayout", "PortConnectMenu", "Enable Feature"],
        tooltip: "Ctrl + left drag from an input or output port, then release to list compatible ports on the current canvas. Select to connect; cancel to keep existing links."
    }]
});
