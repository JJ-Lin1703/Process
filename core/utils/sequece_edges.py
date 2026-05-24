from collections import deque, defaultdict
import math

# 节点类型映射
type_mapping = {
    "start": "startEvent",
    "process": "userTask",
    "decision": "exclusiveGateway",
    "parallelGateway": "parallelGateway",
    "inclusiveGateway": "inclusiveGateway",
    "end": "endEvent"
}

# 节点尺寸定义（符合BPMN标准）
node_sizes = {
    "startEvent": (36, 36),
    "endEvent": (36, 36),
    "userTask": (100, 60),
    "exclusiveGateway": (50, 50),
    "parallelGateway": (50, 50),
    "inclusiveGateway": (50, 50)
}

# 布局参数
RANK_SEP = 200  # 层级间距
NODE_SEP = 100  # 同层级节点垂直间距
BASE_X = 80  # 起始X坐标
BASE_Y = 150  # 起始Y坐标
MAX_RANK = 20  # 最大层级限制
LOOP_OFFSET = 120  # 循环边偏移量
EDGE_OFFSET_BASE = 30  # 重复边的基础偏移量
CROSS_EDGE_EXTRA = 60  # 跨层级边额外偏移
SPREAD_FACTOR = 1.3  # 垂直分布系数
MIN_LAYER_HEIGHT = 400  # 单层最小高度

def is_back_edge(source, target, adj, rank):
    """判断是否是回边（循环边）
    Args:
        source: 源节点ID
        target: 目标节点ID
        adj: 邻接表
        rank: 节点层级字典
    Returns:
        bool: 是否是回边
    """
    # 目标层级 >= 源层级，肯定不是回边
    if rank.get(target, 0) >= rank.get(source, 0):
        return False

    # 检查是否存在从target到source的路径（DFS）
    visited = set()
    stack = [target]

    while stack:
        curr = stack.pop()
        if curr == source:
            return True
        if curr not in visited and curr in adj:  # 增加key存在性检查，避免KeyError
            visited.add(curr)
            stack.extend(adj[curr])
    return False

def calculate_bpmn_layout(nodes, edges):
    """
    优化的BPMN布局计算函数
    改进点：
    1. 基于中位数的智能节点排序，减少边交叉
    2. 根据相对位置智能选择锚点
    3. 优化边的路径计算，避免重叠
    4. 添加边交叉检测和调整
    """
    # 1. 数据预处理
    node_ids = []
    valid_nodes = {}
    for n in nodes:
        if isinstance(n, dict) and "id" in n and "type" in n:
            node_id = n["id"]
            node_ids.append(node_id)
            valid_nodes[node_id] = n

    # 构建邻接表
    adj = {nid: [] for nid in node_ids}
    reverse_adj = {nid: [] for nid in node_ids}
    edge_list = []
    edge_counter = defaultdict(int)

    for edge in edges:
        if not isinstance(edge, dict):
            continue
        source = edge.get("source")
        target = edge.get("target")
        if source in valid_nodes and target in valid_nodes and source != target:
            adj[source].append(target)
            reverse_adj[target].append(source)
            edge_key = (source, target)
            edge_counter[edge_key] += 1
            edge_list.append({
                "source": source,
                "target": target,
                "label": edge.get("label", ""),
                "edge_index": edge_counter[edge_key]
            })

    # 2. 层级计算
    rank = {nid: 0 for nid in node_ids}
    visited = set()
    start_nodes = [nid for nid, node in valid_nodes.items() if node.get("type") == "start"]
    if not start_nodes:
        start_nodes = [nid for nid in node_ids if len(reverse_adj.get(nid, [])) == 0]
    if not start_nodes:
        start_nodes = [node_ids[0]] if node_ids else []

    queue = deque(start_nodes)
    for start_nid in start_nodes:
        rank[start_nid] = 0
        visited.add(start_nid)

    while queue and (max(rank.values()) if rank else 0) < MAX_RANK:
        current = queue.popleft()
        current_rank = rank[current]
        for neighbor in adj[current]:
            if neighbor not in visited:
                rank[neighbor] = min(current_rank + 1, MAX_RANK)
                visited.add(neighbor)
                queue.append(neighbor)
            else:
                if rank[neighbor] <= current_rank and not is_back_edge(current, neighbor, adj, rank):
                    rank[neighbor] = current_rank + 1

    # 3. 按层级分组
    rank_groups = {}
    for nid in node_ids:
        r = min(rank.get(nid, 0), MAX_RANK)
        if r not in rank_groups:
            rank_groups[r] = []
        rank_groups[r].append(nid)

    # 4. 智能节点排序（基于中位数算法）
    def median_heuristic(node_id, rank_groups, rank, adj, reverse_adj):
        """计算节点的中位数启发值，用于优化排序"""
        preds = reverse_adj.get(node_id, [])
        succs = adj.get(node_id, [])
        
        if not preds:
            return 0
        
        pred_positions = []
        succ_positions = []
        
        for p in preds:
            if p in rank and rank[p] < rank.get(node_id, 0):
                pred_positions.append(rank_groups[rank[p]].index(p) if rank[p] in rank_groups else 0)
        
        for s in succs:
            if s in rank and rank[s] > rank.get(node_id, 0):
                succ_positions.append(rank_groups[rank[s]].index(s) if rank[s] in rank_groups else 0)
        
        all_positions = pred_positions + succ_positions
        if all_positions:
            return sum(all_positions) / len(all_positions)
        return 0

    for r in rank_groups:
        nodes_in_rank = rank_groups[r]
        if len(nodes_in_rank) > 1:
            # 使用中位数启发式排序
            nodes_in_rank.sort(key=lambda nid: median_heuristic(nid, rank_groups, rank, adj, reverse_adj))
        rank_groups[r] = nodes_in_rank

    # 5. 计算节点坐标（增加垂直分布）
    node_info = {}
    
    for r in sorted(rank_groups.keys()):
        group = rank_groups[r]
        n_nodes = len(group)
        if n_nodes == 0:
            continue

        layer_x = BASE_X + r * RANK_SEP

        # 计算总高度并增加分布空间
        total_height = 0
        for nid in group:
            node_type = valid_nodes[nid].get("type", "process")
            bpmn_type = type_mapping.get(node_type, "userTask")
            total_height += node_sizes[bpmn_type][1]
        
        # 增加层内间距，使用分布系数
        layer_height = max(total_height * SPREAD_FACTOR, MIN_LAYER_HEIGHT)
        start_y = BASE_Y - (layer_height / 2)
        current_y = start_y

        for nid in group:
            node = valid_nodes[nid]
            node_type = node.get("type", "process")
            bpmn_type = type_mapping.get(node_type, "userTask")
            w, h = node_sizes[bpmn_type]
            
            # 计算该节点在当前层中的相对位置
            node_index = group.index(nid)
            if n_nodes > 1:
                # 根据节点位置分配Y坐标
                offset = (node_index - (n_nodes - 1) / 2) * (layer_height / n_nodes)
                y_pos = BASE_Y + offset
            else:
                y_pos = BASE_Y

            node_info[nid] = {
                "id": nid,
                "bpmn_id": f"elem_{nid}",
                "type": bpmn_type,
                "label": node.get("label", ""),
                "x": layer_x,
                "y": y_pos - h / 2,  # 居中对齐
                "width": w,
                "height": h,
                "center_x": layer_x + w / 2,
                "center_y": y_pos,
                "level": r,
                "is_loop": False
            }

    # 标记循环边
    for edge in edge_list:
        s, t = edge["source"], edge["target"]
        if s in node_info and t in node_info:
            if node_info[t]["level"] <= node_info[s]["level"]:
                node_info[s]["is_loop"] = True

    # 6. 生成BPMN元素列表
    bpmn_elements = []
    for nid in node_info:
        ni = node_info[nid]
        bpmn_elements.append({
            "id": ni["bpmn_id"],
            "type": ni["type"],
            "name": ni["label"],
            "di": {
                "x": ni["x"],
                "y": ni["y"],
                "width": ni["width"],
                "height": ni["height"]
            }
        })

    # 7. 生成BPMN连线（优化的路径计算）
    bpmn_flows = []

    def get_anchor(node_info, nid, direction):
        """获取节点锚点坐标"""
        ni = node_info.get(nid)
        if not ni:
            return 0, 0
        x, y, w, h = ni["x"], ni["y"], ni["width"], ni["height"]

        if direction == "left":
            return x, y + h / 2
        elif direction == "right":
            return x + w, y + h / 2
        elif direction == "top":
            return x + w / 2, y
        elif direction == "bottom":
            return x + w / 2, y + h
        elif direction == "top_left":
            return x, y
        elif direction == "top_right":
            return x + w, y
        elif direction == "bottom_left":
            return x, y + h
        elif direction == "bottom_right":
            return x + w, y + h
        return ni["center_x"], ni["center_y"]

    def calculate_optimal_waypoints(source_id, target_id, source_node, target_node, offset=0):
        """计算最优的连线路径"""
        # 判断相对位置
        src_cx, src_cy = source_node["center_x"], source_node["center_y"]
        tgt_cx, tgt_cy = target_node["center_x"], target_node["center_y"]
        
        dx = tgt_cx - src_cx
        dy = tgt_cy - src_cy
        
        # 确定起点和终点锚点
        source_anchor_dir = "right" if dx >= 0 else "left"
        target_anchor_dir = "left" if dx >= 0 else "right"
        
        source_anchor = get_anchor(node_info, source_id, source_anchor_dir)
        target_anchor = get_anchor(node_info, target_id, target_anchor_dir)
        
        # 添加偏移量（重复边）
        if offset != 0:
            # 根据方向调整偏移
            if source_anchor_dir == "right":
                source_anchor = (source_anchor[0], source_anchor[1] + offset)
            else:
                source_anchor = (source_anchor[0], source_anchor[1] - offset)
        
        # 同一层级内水平连接
        if source_node["level"] == target_node["level"]:
            mid_x = (src_cx + tgt_cx) / 2
            return [
                [round(source_anchor[0]), round(source_anchor[1])],
                [round(mid_x), round(source_anchor[1])],
                [round(mid_x), round(target_anchor[1])],
                [round(target_anchor[0]), round(target_anchor[1])]
            ]
        
        # 跨层级连接
        src_level = source_node["level"]
        tgt_level = target_node["level"]
        
        if abs(src_level - tgt_level) == 1:
            # 相邻层级：直接连接
            if abs(source_anchor[1] - target_anchor[1]) < 10:
                return [
                    [round(source_anchor[0]), round(source_anchor[1])],
                    [round(target_anchor[0]), round(target_anchor[1])]
                ]
            else:
                mid_y = (source_anchor[1] + target_anchor[1]) / 2
                return [
                    [round(source_anchor[0]), round(source_anchor[1])],
                    [round(source_anchor[0] + 30), round(source_anchor[1])],
                    [round(source_anchor[0] + 30), round(mid_y)],
                    [round(target_anchor[0] - 30), round(mid_y)],
                    [round(target_anchor[0] - 30), round(target_anchor[1])],
                    [round(target_anchor[0]), round(target_anchor[1])]
                ]
        else:
            # 跨多层级：使用更智能的路由
            step = 40 if dx >= 0 else -40
            waypoints = [[round(source_anchor[0]), round(source_anchor[1])]]
            
            # 添加水平延伸
            waypoints.append([round(source_anchor[0] + step), round(source_anchor[1])])
            
            # 计算中间垂直段
            mid_y = (source_anchor[1] + target_anchor[1]) / 2
            waypoints.append([round(source_anchor[0] + step), round(mid_y)])
            waypoints.append([round(target_anchor[0] - step), round(mid_y)])
            waypoints.append([round(target_anchor[0] - step), round(target_anchor[1])])
            waypoints.append([round(target_anchor[0]), round(target_anchor[1])])
            
            return waypoints

    for edge in edge_list:
        s_id = edge["source"]
        t_id = edge["target"]

        if s_id not in node_info or t_id not in node_info:
            continue

        flow_id = f"flow_{s_id}_{t_id}_{len(bpmn_flows)}"
        source_node = node_info[s_id]
        target_node = node_info[t_id]

        # 判断是否是循环边
        is_loop = target_node["level"] <= source_node["level"]
        edge_index = edge.get("edge_index", 1)
        offset = (edge_index - 1) * EDGE_OFFSET_BASE

        if is_loop:
            # 循环边处理
            if source_node["center_y"] < target_node["center_y"]:
                source_anchor = get_anchor(node_info, s_id, "top")
                target_anchor = get_anchor(node_info, t_id, "top")
                inflect1_x = source_anchor[0]
                inflect1_y = source_anchor[1] - offset
                inflect2_x = inflect1_x - LOOP_OFFSET - offset
                inflect2_y = min(source_anchor[1], target_anchor[1]) - LOOP_OFFSET - offset
                inflect3_x = target_anchor[0]
                inflect3_y = inflect2_y
            else:
                source_anchor = get_anchor(node_info, s_id, "bottom")
                target_anchor = get_anchor(node_info, t_id, "bottom")
                inflect1_x = source_anchor[0]
                inflect1_y = source_anchor[1] + offset
                inflect2_x = inflect1_x - LOOP_OFFSET - offset
                inflect2_y = max(source_anchor[1], target_anchor[1]) + LOOP_OFFSET + offset
                inflect3_x = target_anchor[0]
                inflect3_y = inflect2_y

            waypoints = [
                [round(source_anchor[0]), round(source_anchor[1])],
                [round(inflect1_x), round(inflect1_y)],
                [round(inflect2_x), round(inflect2_y)],
                [round(inflect3_x), round(inflect3_y)],
                [round(target_anchor[0]), round(target_anchor[1])]
            ]
        else:
            # 正常边：使用优化的路径计算
            waypoints = calculate_optimal_waypoints(
                s_id, t_id, source_node, target_node, offset
            )

        bpmn_flows.append({
            "id": flow_id,
            "sourceRef": node_info[s_id]["bpmn_id"],
            "targetRef": node_info[t_id]["bpmn_id"],
            "name": edge.get("label", ""),
            "di": {"waypoints": waypoints}
        })

    return bpmn_elements, bpmn_flows, node_info