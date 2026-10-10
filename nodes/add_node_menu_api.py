import sys
from pathlib import Path
import nodes
from server import PromptServer
from aiohttp import web

from ._menu_data import load_menu_data, update_menu_data

routes = PromptServer.instance.routes

# 1. 聚合读取接口 (GET)
@routes.get("/align-layout/data")
async def get_menu_data(request):
    core_file = Path(nodes.__file__).resolve()
    official_dirs = [core_file.parent / "comfy_extras", core_file.parent / "comfy_api_nodes"]
    official_modules = {}
    builtin_nodes = []
    for name, node_class in nodes.NODE_CLASS_MAPPINGS.items():
        module_name = node_class.__module__
        if module_name not in official_modules:
            module_file = getattr(sys.modules.get(module_name), "__file__", None)
            source = Path(module_file).resolve() if module_file else None
            official_modules[module_name] = source is not None and (
                source == core_file or any(source.is_relative_to(directory) for directory in official_dirs)
            )
        if official_modules[module_name]:
            builtin_nodes.append(name)
    menu_data = load_menu_data()
    data = {
        "pins": menu_data["add_node_menu"]["pins"],
        "quick": menu_data["favorites"],
        "last_category": menu_data["add_node_menu"]["last_category"],
        "builtin_nodes": builtin_nodes
    }
    return web.json_response(data)

# 2. 独立更新接口：置顶 (POST)
@routes.post("/align-layout/pins")
async def update_pins(request):
    try:
        data = await request.json()
        update_menu_data("add_node_menu", "pins", data)
        return web.json_response({"status": "success"})
    except Exception as e:
        return web.json_response({"status": "error", "message": str(e)}, status=500)

# 3. 更新共享收藏列表 (POST)
@routes.post("/align-layout/quick")
async def update_quick(request):
    try:
        data = await request.json()
        update_menu_data(None, "favorites", data)
        return web.json_response({"status": "success"})
    except Exception as e:
        return web.json_response({"status": "error", "message": str(e)}, status=500)

# 4. 独立更新接口：最后分类 (POST)
@routes.post("/align-layout/last_category")
async def update_last_category(request):
    try:
        data = await request.json()
        update_menu_data("add_node_menu", "last_category", data)
        return web.json_response({"status": "success"})
    except Exception as e:
        return web.json_response({"status": "error", "message": str(e)}, status=500)

# 导出空映射防止报错
NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}
