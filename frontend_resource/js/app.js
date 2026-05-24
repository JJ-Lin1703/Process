// ====================== 全局 Token 自动挂载 ======================
const baseFetch = window.fetch;
window.fetch = function (url, options = {}) {
  const token = localStorage.getItem('token');
  if (token) {
    options.headers = options.headers || {};
    options.headers['Authorization'] = 'Bearer ' + token;
  }
  return baseFetch(url, options);
};
// ============================================================================

import { initPage, initRightSidebar, switchToNewFlow, switchToFlowDetail } from './page-state.js';
import { toggleLeftSidebar, switchTab, toggleRightSidebar, togglePropertiesSidebar } from './ui-handler.js';
import {
  generateBpmn as generateBpmnApi, importBpmn, importDocument as importDocumentApi, getFlowDetail as getFlowDetailApi, fineTuneBpmn as fineTuneBpmnApi, exportBpmn, updateFlowName,
  loadHistoryFlowList, deleteFlow, saveBpmnEditor
} from './api-service.js';
import { bpmnInstances } from './config.js';
import { toastError, toastWarning, toastSuccess } from './toast.js';
import { confirmDialog } from './utils.js';

// 从新文件导入所有 BPMN 相关功能
import {
  initBpmnViewers,
  refreshPropertiesPanel,
  destroyBpmnViewer,
  fitCanvas,
  zoomInCanvas,
  zoomOutCanvas,
  undoCanvas,
  redoCanvas
} from './renderBPMN.js';

// 导出给外部使用
export {
  refreshPropertiesPanel,
  initBpmnViewers
};

// 全局函数挂载（供 HTML onclick 使用）
const globalFunctions = {
  toggleLeftSidebar,
  toggleRightSidebar,
  switchTab,
  switchToNewFlow,
  switchToFlowDetail,
  importBpmn,
  importDocumentApi,
  exportBpmn,
  updateFlowName,
  deleteFlow,
  saveBpmnEditor,
  fitCanvas,
  zoomInCanvas,
  zoomOutCanvas,
  undoCanvas,
  redoCanvas,
  togglePropertiesSidebar
};

// 安全挂载到 window
Object.entries(globalFunctions).forEach(([name, fn]) => {
  window[name] = function(...args) {
    try {
      return fn.apply(this, args);
    } catch (err) {
      console.error(`执行全局函数 ${name} 失败:`, err);
      toastError(`操作失败：${err.message}`, '操作失败');
    }
  };
});

// 检查是否登录
function isLoggedIn() {
  return !!localStorage.getItem('token');
}

// 获取当前用户信息
function getUserInfo() {
  try {
    return JSON.parse(localStorage.getItem('userInfo') || 'null');
  } catch {
    return null;
  }
}

// 更新登录按钮状态
function updateAuthButton() {
  const authButton = document.getElementById('authButton');
  if (!authButton) return;
  
  if (isLoggedIn()) {
    authButton.innerHTML = `
      <svg class="btn-icon" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5-5-5zm-5 9c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3z" fill="currentColor" />
      </svg>
      <span>Logout</span>
    `;
    authButton.onclick = logout;
  } else {
    authButton.innerHTML = `
      <svg class="btn-icon" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M18 8h-1V6a6 6 0 0 0-6-6 6 6 0 0 0-6 6v2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2zM8 6a4 4 0 0 1 4-4 4 4 0 0 1 4 4v2H8V6zm2 12v-8h4v8H10z" fill="currentColor" />
      </svg>
      <span>Login</span>
    `;
    authButton.onclick = goToLogin;
  }
  
  // 更新微调按钮状态
  updateFineTuneButton();
}

// 更新微调按钮状态
function updateFineTuneButton() {
  const fineTuneBtn = document.getElementById('fineTuneBtn');
  if (!fineTuneBtn) return;
  
  if (isLoggedIn()) {
    fineTuneBtn.title = 'Fine-tune Flow';
  } else {
    fineTuneBtn.title = 'Fine-tuning requires login';
  }
}

// 跳转到登录页
function goToLogin() {
  location.href = 'login.html';
}

// 退出登录
async function logout() {
  const confirmed = await confirmDialog({
    title: 'Logout',
    message: 'Are you sure you want to logout?',
    confirmText: 'Logout',
    cancelText: 'Cancel'
  });
  
  if (confirmed) {
    localStorage.removeItem('token');
    localStorage.removeItem('userInfo');
    updateAuthButton();
    toastSuccess('Logged out successfully');
    loadHistoryFlowList();
  }
}

// 处理认证操作
window.handleAuth = function() {
  if (isLoggedIn()) {
    logout();
  } else {
    goToLogin();
  }
};

// 生成BPMN
window.generateBpmn = async function() {
  const processDesc = document.getElementById('processDesc');
  if (!processDesc || !processDesc.value.trim()) {
    toastWarning('Please enter a process description');
    return;
  }
  
  try {
    await generateBpmnApi();
  } catch (err) {
    toastError(err.message, 'Generation failed');
  }
};

// 导入文档
window.importDocument = async function() {
  if (!isLoggedIn()) {
    toastWarning('登录畅享文档导入功能');
    return;
  }
  
  try {
    await importDocumentApi();
  } catch (err) {
    toastError(err.message, 'Import failed');
  }
};

// 微调BPMN
window.fineTuneBpmn = async function() {
  if (!isLoggedIn()) {
    toastWarning('登录畅享微调功能');
    return;
  }
  
  const fineTuneInput = document.getElementById('fineTuneInstruction');
  if (!fineTuneInput || !fineTuneInput.value.trim()) {
    toastWarning('Please enter fine-tuning instructions');
    return;
  }
  
  try {
    await fineTuneBpmnApi();
  } catch (err) {
    toastError(err.message, 'Fine-tuning failed');
  }
};

// 获取流程详情
window.getFlowDetail = async function(flowId) {
  try {
    await getFlowDetailApi(flowId);
  } catch (err) {
    toastError(err.message, 'Failed to load flow');
  }
};

// 初始化回车键监听
function initKeydownEvents() {
  // 微调流程输入框支持回车键
  const fineTuneInput = document.getElementById('fineTuneInstruction');
  fineTuneInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      window.fineTuneBpmn();
    }
  });

  // 生成流程图输入框支持回车键
  const processDesc = document.getElementById('processDesc');
  processDesc?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      window.generateBpmn();
    }
  });
}

// 入口初始化
document.addEventListener('DOMContentLoaded', () => {
  initBpmnViewers();
  initPage();
  initRightSidebar();
  initKeydownEvents();
  updateAuthButton();
  loadHistoryFlowList();
});

// 页面关闭时销毁实例
window.addEventListener('beforeunload', () => {
  destroyBpmnViewer(bpmnInstances.newViewer);
  destroyBpmnViewer(bpmnInstances.historyViewer);
});