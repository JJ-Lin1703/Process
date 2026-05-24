# -*- coding: utf-8 -*-
import re
import json
from jinja2 import Template

# 延迟导入以避免循环依赖
def get_chat_openai():
    from langchain_core.prompts import ChatPromptTemplate
    from langchain_core.output_parsers import StrOutputParser
    from langchain_openai import ChatOpenAI
    return ChatPromptTemplate, StrOutputParser, ChatOpenAI

from core.utils.sequece_edges import calculate_bpmn_layout
from core.utils.session_utils import global_session

# -------------- 这里全部换成新表函数 --------------
from .db_operations import (
    update_bpmn_xml_content,
    update_bpmn_flow_json,
    get_user_flow_by_id,
    get_user_fine_tunes
)


# -------------------------- 通用日志函数 --------------------------
def log_info(msg):
    print(f"[INFO] {msg}")

def log_error(msg):
    print(f"[ERROR] {msg}")

def log_warning(msg):
    print(f"[WARNING] {msg}")

# -------------------------- 大模型调用 --------------------------
def call_llm(api_key, model_name, temperature, messages):
    try:
        ChatPromptTemplate, StrOutputParser, ChatOpenAI = get_chat_openai()
        prompt = ChatPromptTemplate.from_messages(messages)
        llm = ChatOpenAI(
            api_key=api_key,
            model=model_name,
            temperature=temperature,
            base_url="https://dashscope.aliyuncs.com/compatible-mode/v1"
        )
        chain = prompt | llm | StrOutputParser()
        response = chain.invoke({})
        return response.strip()
    except Exception as e:
        log_error(f"大模型调用失败：{str(e)}")
        return None


# -------------------------- 交互式流程图生成 --------------------------
def generate_interactive_flow(process_desc, api_key, model_name, temperature, is_fine_tune=False):
    if not api_key or not process_desc:
        log_warning("API Key或流程描述不能为空！")
        return None

    PROMPT_FIXED = r"""
    你需要严格按照以下要求，将业务流程描述转为**纯JSON字符串**，仅输出JSON，不要任何解释、备注、换行符或多余内容。

    ### 核心规则：
    1. JSON结构必须包含 "nodes" 和 "edges" 两个顶级字段，无其他字段；
    2. nodes 数组中每个节点必须包含：
       - id：纯数字字符串（如"1","2"），从1开始递增，不能重复；
       - label：节点名称（不能为空，与流程描述中的节点名一致）；
       - type：节点类型（仅允许以下值）：
         - start：流程开始节点（仅1个）；
         - process：普通任务节点；
         - decision：排他网关（判断节点）；
         - parallelGateway：并行网关；
         - inclusiveGateway：汇聚网关；
         - end：流程结束节点（可多个）；
    3. edges 数组中每个边必须包含：
       - source：源节点id（字符串）；
       - target：目标节点id（字符串）；
       - label：边的描述（不能为空，如"提交""完成""不通过"）；
    4. 当某个node点的出度>=2时，其类型属于排他网关或者并行网关，具体类型根据这几条指向其他点的信息决定
    5. 所有字段值必须用双引号包裹，禁止单引号，JSON 必须可被 Python json.loads() 解析；
    6. 严格匹配流程描述中的节点顺序和关联关系，不新增/遗漏节点。

    ### JSON示例：
    {{"nodes": [{{"id": "1", "label": "开始", "type": "start"}}, {{"id": "2", "label": "填写申请单", "type": "process"}}, {{"id": "3", "label": "并行", "type": "parallelGateway"}}, {{"id": "4", "label": "结束", "type": "end"}}, {{"id": "5", "label": "是否超标", "type": "decision"}}], "edges": [{{"source": "1", "target": "2", "label": "发起"}}, {{"source": "2", "target": "3", "label": "提交"}}, {{"source": "3", "target": "4", "label": "汇聚"}}]}}

    """

    if is_fine_tune:
        try:
            flow_id = getattr(global_session, 'current_flow_id', None)
            if flow_id:
                # ---------------- 改用新表 ----------------
                flow_record = get_user_flow_by_id(global_session.current_user_id, flow_id)
                if flow_record and flow_record.flow_json:
                    # ---------------- 改用新表 ----------------
                    fine_tune_prompts = get_user_fine_tunes(flow_id)

                    escaped_flow_json = flow_record.flow_json.replace("{", "{{").replace("}", "}}")

                    learning_context = f"""
    ### 历史学习参考（本次微调需结合以下历史调整）：
    1. 原始流程描述：{flow_record.process_desc}
    2. 最新生成的JSON：{escaped_flow_json}
    3. 历史微调指令：
    """
                    if fine_tune_prompts:
                        for idx, prompt in enumerate(fine_tune_prompts, 1):
                            learning_context += f"\n       {idx}. {prompt.fine_tune_prompt}"
                    else:
                        learning_context += "\n 暂无历史微调指令"

                    learning_context += f"""
    ### 本次微调要求：
    - 基于上述历史参考，结合新的微调指令："{process_desc.strip()}" 进行调整
    - 保留历史JSON中正确的节点结构和关联关系
    - 仅修改与本次微调指令不符的部分，不做无意义变更
    """
                    PROMPT_FIXED += learning_context
        except Exception as e:
            log_warning(f"读取微调历史数据失败：{str(e)}")

    json_prompt = PROMPT_FIXED + f"\n### 你的流程描述/微调指令：\n{process_desc.strip()}"

    try:
        content = call_llm(
            api_key=api_key,
            model_name=model_name,
            temperature=temperature,
            messages=[{"role": "user", "content": json_prompt}]
        )
    except Exception as e:
        log_warning(f"调用LLM失败：{str(e)}")
        return None

    if not content:
        log_warning("LLM返回内容为空！")
        return None

    try:
        match = re.search(r'\{[\s\S]*\}', content)
        if not match:
            log_warning("未从LLM返回内容中提取到JSON！")
            return None

        flow_data = json.loads(match.group())
        if "nodes" not in flow_data or "edges" not in flow_data:
            log_warning("JSON缺少nodes/edges字段！")
            return None
        if not isinstance(flow_data["nodes"], list) or not isinstance(flow_data["edges"], list):
            log_warning("nodes/edges必须是数组！")
            return None

        if hasattr(global_session, 'history'):
            global_session.history["flow_json"] = json.dumps(flow_data, ensure_ascii=False)

        if is_fine_tune and getattr(global_session, 'current_flow_id', None):
            update_bpmn_flow_json(global_session.current_flow_id, json.dumps(flow_data, ensure_ascii=False))

        return flow_data

    except json.JSONDecodeError as e:
        log_warning(f"JSON解析失败：{str(e)}，原始内容：{content[:200]}...")
    except Exception as e:
        log_warning(f"流程图解析/生成异常：{str(e)}")
    return None


# -------------------------- BPMN XML生成 --------------------------
def generate_bpmn_xml(interactive_json, is_fine_tune=False):
    if not interactive_json or not isinstance(interactive_json, dict):
        log_warning("交互式流程图JSON无效！")
        return None

    try:
        nodes = interactive_json.get("nodes", [])
        edges = interactive_json.get("edges", [])
        if not nodes or not edges:
            log_warning("无节点/边数据")
            return None

        bpmn_elements, bpmn_flows, _ = calculate_bpmn_layout(nodes, edges)

        bpmn_process = {
            "id": "Process_Purchase",
            "name": "采购申请审批流程",
            "elements": bpmn_elements,
            "sequenceFlows": bpmn_flows
        }

        xml_template = Template("""
<definitions 
    xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
    xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
    xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
    id="Definitions_{{ process.id }}"
    targetNamespace="http://bpmn.io/schema/bpmn">
  <process id="{{ process.id }}" name="{{ process.name }}" isExecutable="true">
    {% for elem in process.elements %}
      {% if elem.type == "startEvent" %}
        <startEvent id="{{ elem.id }}" name="{{ elem.name|default('开始') }}" />
      {% elif elem.type == "userTask" %}
        <userTask id="{{ elem.id }}" name="{{ elem.name|default('处理任务') }}" />
      {% elif elem.type == "exclusiveGateway" %}
        <exclusiveGateway id="{{ elem.id }}" name="{{ elem.name|default('判断节点') }}" gatewayDirection="Diverging" />
      {% elif elem.type == "parallelGateway" %}
        <parallelGateway id="{{ elem.id }}" name="{{ elem.name|default('并行网关') }}" gatewayDirection="Diverging" />
      {% elif elem.type == "inclusiveGateway" %}
        <inclusiveGateway id="{{ elem.id }}" name="{{ elem.name|default('汇聚网关') }}" gatewayDirection="Converging" />
      {% elif elem.type == "endEvent" %}
        <endEvent id="{{ elem.id }}" name="{{ elem.name|default('结束') }}" />
      {% endif %}
    {% endfor %}
    {% for flow in process.sequenceFlows %}
      <sequenceFlow id="{{ flow.id }}" sourceRef="{{ flow.sourceRef }}" targetRef="{{ flow.targetRef }}" name="{{ flow.name|default('') }}" />
    {% endfor %}
  </process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_{{ process.id }}">
    <bpmndi:BPMNPlane id="BPMNPlane_{{ process.id }}" bpmnElement="{{ process.id }}">
      {% for elem in process.elements %}
        <bpmndi:BPMNShape id="BPMNShape_{{ elem.id }}" bpmnElement="{{ elem.id }}">
          <dc:Bounds x="{{ elem.di.x }}" y="{{ elem.di.y }}" width="{{ elem.di.width }}" height="{{ elem.di.height }}" />
        </bpmndi:BPMNShape>
      {% endfor %}
      {% for flow in process.sequenceFlows %}
        <bpmndi:BPMNEdge id="BPMNEdge_{{ flow.id }}" bpmnElement="{{ flow.id }}">
          {% for waypoint in flow.di.waypoints %}
            <di:waypoint x="{{ waypoint[0] }}" y="{{ waypoint[1] }}" />
          {% endfor %}
        </bpmndi:BPMNEdge>
      {% endfor %}
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</definitions>
        """)
        bpmn_xml = xml_template.render(process=bpmn_process)

        global_session.history["bpmn_xml"] = bpmn_xml

        if is_fine_tune and global_session.current_flow_id:
            update_bpmn_xml_content(global_session.current_flow_id, bpmn_xml)

        log_info("✅ BPMN XML generate success！")
        return bpmn_xml

    except Exception as e:
        log_warning(f"BPMN XML生成失败：{str(e)}")
        return None