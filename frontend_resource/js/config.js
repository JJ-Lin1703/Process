// frontend_resource/js/config.js
// 后端API基础地址（可通过环境变量适配）
export const API_BASE = window.API_BASE || "http://localhost:8000/api";

// 全局状态管理
export const globalState = {
  currentPageType: 'new', // new-新建流程 / detail-流程详情
  currentFlowId: null,    // 当前查看的流程ID（详情页有效）
  sidebarCollapsed: false, // 侧边栏折叠状态
  rightSidebarCollapsed: false,
  propertiesCollapsed: false
};

// 空的BPMN实例容器（由app.js初始化）
export const bpmnInstances = {
  newViewer: null,
  historyViewer: null
};