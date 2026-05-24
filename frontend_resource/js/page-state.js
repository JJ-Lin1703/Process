// frontend_resource/js/page-state.js
import { globalState, bpmnInstances } from './config.js';
import { switchTab, initCharLengthLimit } from './ui-handler.js';
import { getFlowDetail, loadHistoryFlowList } from './api-service.js';

export function switchToNewFlow() {
  globalState.currentPageType = 'new';
  globalState.currentFlowId = null;
  switchTab('new');
  document.getElementById('pageTitle').textContent = 'New Flow';

  // 给所有元素加空值保护，避免 null 报错
  const flowNameEl = document.getElementById('flowName');
  if (flowNameEl) flowNameEl.value = '';

  const processDescEl = document.getElementById('processDesc');
  if (processDescEl) processDescEl.value = '';

  const newMsgEl = document.getElementById('newMsg');
  if (newMsgEl) {
    newMsgEl.style.display = 'none';
    newMsgEl.className = 'msg';
  }

  if (bpmnInstances.newViewer) bpmnInstances.newViewer.clear();
  if (bpmnInstances.historyViewer) bpmnInstances.historyViewer.clear();

  const flowInfoEl = document.getElementById('flowInfo');
  if (flowInfoEl) {
    flowInfoEl.style.display = 'none';
    flowInfoEl.className = 'card info-card';
  }

  const flowIdEl = document.getElementById('flowId');
  if (flowIdEl) flowIdEl.value = '';

  const newFlowNameEl = document.getElementById('newFlowName');
  if (newFlowNameEl) newFlowNameEl.value = '';

  const fineTuneEl = document.getElementById('fineTuneInstruction');
  if (fineTuneEl) fineTuneEl.value = '';

  const historyMsgEl = document.getElementById('historyMsg');
  if (historyMsgEl) {
    historyMsgEl.style.display = 'none';
    historyMsgEl.className = 'msg';
  }

  //清空历史流程记录中的微调记录
  document.querySelectorAll('.prompt-bubble').forEach(el => el.remove());

  // 清除侧边栏历史流程的选中状态
  document.querySelectorAll('.flow-item').forEach(item => item.classList.remove('active'));
}

export async function switchToFlowDetail(flowId, flowName = null, skipRender = false) {
  globalState.currentPageType = 'detail';
  globalState.currentFlowId = flowId;
  switchTab('history');

  const pageTitle = document.getElementById('pageTitle');
  if (pageTitle) {
    const safeName = typeof flowName === 'string' && flowName.trim() ? flowName : `流程 #${flowId}`;
    pageTitle.textContent = safeName;
  }

  const flowIdInput = document.getElementById('flowId');
  if (flowIdInput) {
    flowIdInput.value = flowId;
  }
  
  await getFlowDetail(flowId, skipRender);

  document.querySelectorAll('.flow-item').forEach(item => item.classList.remove('active'));
  const activeItem = document.querySelector('.flow-item[data-flow-id="' + flowId + '"]');
  if (activeItem) activeItem.classList.add('active');
}

export function initPage() {
  // 初始化左侧侧边栏
  const isCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
  const sidebar = document.getElementById('sidebar');
  const toggleIcon = document.getElementById('toggleIcon');
  
  globalState.sidebarCollapsed = isCollapsed;
  if (sidebar) sidebar.classList.toggle('collapsed', isCollapsed);
  if (toggleIcon) {
    toggleIcon.innerHTML = isCollapsed
      ? '<path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" fill="currentColor"/>'
      : '<path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" fill="currentColor"/>';
  }
  initRightSidebar();
  switchToNewFlow();
  initCharLengthLimit();

  setTimeout(() => { loadHistoryFlowList(); }, 200);
}

export function initRightSidebar() {
  const isCollapsed = localStorage.getItem('rightSidebarCollapsed') === 'true';
  const sidebar = document.getElementById('rightSidebar');
  const toggleIcon = document.getElementById('rightToggleIcon');

  globalState.rightSidebarCollapsed = isCollapsed;
  if (sidebar) sidebar.classList.toggle('collapsed', isCollapsed);
  if (toggleIcon) {
    toggleIcon.innerHTML = isCollapsed
      ? '<path d="M14 6l1.41 1.41L8.83 12l6.58 6.59L14 20l-8-8z" fill="currentColor"/>'
      : '<path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" fill="currentColor"/>';
  }
}
