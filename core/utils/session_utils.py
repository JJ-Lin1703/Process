# -*- coding: utf-8 -*-

class FlowSession:
    """流程会话状态管理类（替代streamlit session_state）"""
    def __init__(self):
        # 初始化所有需要持久化的状态
        self.history = {
            "process_desc": "",
            "flow_json": "",
            "bpmn_xml": ""
        }
        self.current_flow_name = ""
        self.fine_tuned_bpmn_prev = None
        self.current_flow_id = None
        self.current_user_id = None  # 当前登录用户ID
        self.selected_flow_type = "new"  # new：全新创建；history：历史记录
        self.fine_tune_prompts = []  # 存储当前流程的历史微调提示
        self.show_edit_name = False  # 控制是否显示修改名称输入框

    def reset_for_new_flow(self):
        """重置会话状态，准备创建新流程"""
        self.selected_flow_type = "new"
        self.current_flow_id = None
        self.current_flow_name = ""
        self.history = {
            "process_desc": "",
            "flow_json": "",
            "bpmn_xml": ""
        }
        self.fine_tuned_bpmn_prev = None
        self.fine_tune_prompts = []
        self.show_edit_name = False

# 全局会话实例（单例）
global_session = FlowSession()

# 兼容原有初始化函数（可选）
def init_session_state():
    """兼容原有调用逻辑"""
    global global_session
    global_session = FlowSession()