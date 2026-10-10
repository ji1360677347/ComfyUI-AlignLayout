import { createAutoLayout } from "./auto_layout.js";
import { createAligner } from "./align_plugin.js";
import { createResizer } from "./stretch_plugin.js";
import { createAddNodeMenu } from "./add_node_menu.js";
import { createQuickNodeMenu } from "./quick_node_menu.js";
import { createFastLink } from "./fast_link.js";
import { createReplaceNode } from "./replace_node.js";
import { createSelectSame } from "./select_same_nodes.js";

export function createFeatures(scope) {
    return [
        createAutoLayout(scope),
        createAligner(scope),
        createResizer(scope),
        createAddNodeMenu(scope),
        createQuickNodeMenu(scope),
        createFastLink(scope),
        createReplaceNode(scope),
        createSelectSame(scope)
    ];
}
