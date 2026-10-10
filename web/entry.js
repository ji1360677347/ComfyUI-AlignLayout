import { app } from "../../scripts/app.js";
import { createModeController } from "./runtime.js";
import { createFeatures as createDefault } from "./default/index.js";
import { createFeatures as createNodes2 } from "./nodes2/index.js";

app.registerExtension({
    name: "Comfy.AlignLayout.Runtime",
    async setup() {
        const controller = createModeController(createDefault, createNodes2);
        const settings = app.ui.settings;
        const switchMode = () => controller.switchMode(
            Boolean(app.extensionManager.setting.get("Comfy.VueNodes.Enabled"))
        );
        const onChange = () => {
            switchMode().catch(error => console.error("[AlignLayout] Mode switch failed", error));
        };
        settings.addEventListener("Comfy.VueNodes.Enabled.change", onChange);
        window.addEventListener("pagehide", event => {
            if (event.persisted) return;
            settings.removeEventListener("Comfy.VueNodes.Enabled.change", onChange);
            controller.dispose();
        });
        await switchMode();
    }
});
