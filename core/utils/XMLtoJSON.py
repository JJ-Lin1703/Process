import json
import xml.etree.ElementTree as ET

def parse_bpmn_to_flow_json(bpmn_xml):
    """
    把标准 BPMN 2.0 XML 解析成你要求的 nodes + edges 格式 JSON
    完全匹配你的 PROMPT_FIXED 格式要求
    """
    try:
        root = ET.fromstring(bpmn_xml)
        # 命名空间（BPMN 2.0 必须）
        ns = {"bpmn": "http://www.omg.org/spec/BPMN/20100524/MODEL"}

        # 找到流程节点
        process = root.find(".//bpmn:process", ns)
        if process is None:
            return json.dumps({"nodes": [], "edges": []}, ensure_ascii=False)

        elements = process.findall(".//*", ns)

        node_list = []
        edge_list = []
        node_id_map = {}  # bpmn id → 自增数字id
        current_id = 1

        # --------------------------
        # 第一步：解析所有节点
        # --------------------------
        for elem in elements:
            tag = elem.tag.split("}")[-1]
            bpmn_id = elem.get("id")
            name = elem.get("name", "").strip()

            # 开始节点
            if tag == "startEvent":
                node_type = "start"
                label = name if name else "开始"

            # 结束节点
            elif tag == "endEvent":
                node_type = "end"
                label = name if name else "结束"

            # 用户任务 / 服务任务 → 普通任务
            elif tag in ["userTask", "serviceTask", "task", "manualTask"]:
                node_type = "process"
                label = name if name else "任务"

            # 排他网关
            elif tag == "exclusiveGateway":
                node_type = "decision"
                label = name if name else "判断"

            # 并行网关
            elif tag == "parallelGateway":
                node_type = "parallelGateway"
                label = name if name else "并行"

            # 包容网关
            elif tag == "inclusiveGateway":
                node_type = "inclusiveGateway"
                label = name if name else "汇聚"

            else:
                continue  # 忽略非流程节点

            # 分配自增数字 ID
            numeric_id = str(current_id)
            current_id += 1
            node_id_map[bpmn_id] = numeric_id

            node_list.append({
                "id": numeric_id,
                "label": label,
                "type": node_type
            })

        # --------------------------
        # 第二步：解析所有连线（sequenceFlow）
        # --------------------------
        for flow in process.findall(".//bpmn:sequenceFlow", ns):
            source_ref = flow.get("sourceRef")
            target_ref = flow.get("targetRef")
            label = flow.get("name", "").strip()

            # 必须能映射到数字 ID
            if source_ref not in node_id_map or target_ref not in node_id_map:
                continue

            # 连线名称默认值
            if not label:
                label = "完成"

            edge_list.append({
                "source": node_id_map[source_ref],
                "target": node_id_map[target_ref],
                "label": label
            })

        # 最终 JSON（严格符合你的格式）
        result = {
            "nodes": node_list,
            "edges": edge_list
        }

        return json.dumps(result, ensure_ascii=False, separators=(',', ':'))

    except Exception:
        # 解析失败返回空结构
        return json.dumps({"nodes": [], "edges": []}, ensure_ascii=False)