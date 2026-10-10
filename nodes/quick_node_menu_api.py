from server import PromptServer
from aiohttp import web

from ._menu_data import load_menu_data, update_menu_data

routes = PromptServer.instance.routes

# 1. 聚合读取接口 (GET) - 专为 Quick Menu 服务
@routes.get("/quick-menu/data")
async def get_quick_menu_data(request):
    menu_data = load_menu_data()
    data = {
        "quick_list": menu_data["favorites"],
        "pins": menu_data["quick_node_menu"]["pins"],
        "last_category": menu_data["quick_node_menu"]["last_category"]
    }
    return web.json_response(data)

# 2. 更新共享的 Quick 列表 (移除操作用)
@routes.post("/quick-menu/update_list")
async def update_shared_list(request):
    try:
        data = await request.json()
        update_menu_data(None, "favorites", data)
        return web.json_response({"status": "success"})
    except Exception as e:
        return web.json_response({"status": "error", "message": str(e)}, status=500)

# 3. 更新 Quick Menu 自己的置顶
@routes.post("/quick-menu/pins")
async def update_quick_pins(request):
    try:
        data = await request.json()
        update_menu_data("quick_node_menu", "pins", data)
        return web.json_response({"status": "success"})
    except Exception as e:
        return web.json_response({"status": "error", "message": str(e)}, status=500)

# 4. 更新 Quick Menu 自己的最后操作分类
@routes.post("/quick-menu/last_category")
async def update_quick_last_category(request):
    try:
        data = await request.json()
        update_menu_data("quick_node_menu", "last_category", data)
        return web.json_response({"status": "success"})
    except Exception as e:
        return web.json_response({"status": "error", "message": str(e)}, status=500)

# 导出空映射防止报错，确保作为插件被加载
NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}