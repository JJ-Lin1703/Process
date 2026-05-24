// frontend_resource/js/ui-handler.js
import { globalState } from './config.js';
import { countCNChars, showMsg } from './utils.js';

//左侧侧边栏折叠/展开状态
export function toggleLeftSidebar() {
  const sidebar = document.getElementById('sidebar');
  const toggleIcon = document.getElementById('toggleIcon');

  if (!sidebar || !toggleIcon) return;

  // 切换折叠状态
  globalState.sidebarCollapsed = !globalState.sidebarCollapsed;
  sidebar.classList.toggle('collapsed', globalState.sidebarCollapsed);

  if (globalState.sidebarCollapsed) {
    toggleIcon.innerHTML = '<path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" fill="currentColor"/>';
  } else {
    toggleIcon.innerHTML = '<path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" fill="currentColor"/>';
  }

  // 保存到本地存储
  localStorage.setItem('sidebarCollapsed', globalState.sidebarCollapsed);
}
window.toggleLeftSidebar = toggleLeftSidebar;

function setButtonLoading(button, loadingText) {
  if (!button) return;

  if (button.dataset.loading === 'true') {
    button.disabled = false;
    button.dataset.loading = 'false';

    if (button.dataset.originalHtml) {
      button.innerHTML = button.dataset.originalHtml;
      delete button.dataset.originalHtml;
    }
    return;
  }

  button.dataset.originalHtml = button.innerHTML;
  button.dataset.loading = 'true';
  button.disabled = true;
  button.innerHTML = `<span class="btn-loading-dot" aria-hidden="true"></span><span>${loadingText}</span>`;
}

// 右侧侧边栏折叠/展开
export function toggleRightSidebar() {
  const sidebar = document.getElementById('rightSidebar');
  const toggleIcon = document.getElementById('rightToggleIcon');

  if (!sidebar || !toggleIcon) return;

  // 切换折叠状态
  const isCollapsed = sidebar.classList.toggle('collapsed');
  globalState.rightSidebarCollapsed = isCollapsed;

  // 箭头方向切换
  toggleIcon.innerHTML = isCollapsed
    ? '<path d="M14 6l1.41 1.41L8.83 12l6.58 6.59L14 20l-8-8z" fill="currentColor"/>'
    : '<path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" fill="currentColor"/>';

  // 持久化状态
  localStorage.setItem('rightSidebarCollapsed', isCollapsed);
}
window.toggleRightSidebar = toggleRightSidebar;

document.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  const button = target.closest('button');
  if (!button) return;

  if (button.matches('#generateBtn')) {
    requestAnimationFrame(() => {
      if (button.disabled) {
        setButtonLoading(button, '生成中...');
      }
    });
  }

  if (button.matches('.btn-finetune')) {
    requestAnimationFrame(() => {
      if (button.disabled) {
        setButtonLoading(button, '微调中...');
      }
    });
  }
}, true);

const observeButtonState = (selector) => {
  const getButton = () => document.querySelector(selector);
  const btn = getButton();
  if (!btn) return;

  const observer = new MutationObserver(() => {
    const target = getButton();
    if (target && !target.disabled && target.dataset.loading === 'true') {
      setButtonLoading(target, '');
    }
  });

  observer.observe(btn, { attributes: true, attributeFilter: ['disabled'] });
};

// 属性面板 折叠/展开
export function togglePropertiesSidebar() {
  const sidebar = document.getElementById('propertiesSidebar');
  const toggleIcon = document.getElementById('propertiesToggleIcon');

  if (!sidebar || !toggleIcon) return;

  // 切换折叠状态
  const isCollapsed = sidebar.classList.toggle('collapsed');
  globalState.propertiesCollapsed = isCollapsed;

  // 箭头方向切换（和你右侧栏一模一样逻辑）
  toggleIcon.innerHTML = isCollapsed
    ? '<path d="M14 6l1.41 1.41L8.83 12l6.58 6.59L14 20l-8-8z" fill="currentColor"/>'
    : '<path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" fill="currentColor"/>';

  // 持久化状态
  localStorage.setItem('propertiesCollapsed', isCollapsed);
}
window.togglePropertiesSidebar = togglePropertiesSidebar;

document.addEventListener('DOMContentLoaded', () => {
  observeButtonState('#generateBtn');
  observeButtonState('.btn-finetune');
});

/**
 * 初始化输入框字符长度限制（未改）
 */
export function initCharLengthLimit() {
  // 新建流程名称
  const flowNameInput = document.getElementById('flowName');
  const nameLengthHint = document.getElementById('nameLengthHint');
  if (flowNameInput && nameLengthHint) {
    flowNameInput.addEventListener('input', function () {
      const length = countCNChars(this.value);
      nameLengthHint.textContent = length + '/12';
      if (length > 12) {
        this.value = this.value.substring(0, 12);
        nameLengthHint.textContent = '12/12';
        showMsg('newMsg', '流程名称最多12个字符', false);
      }
    });
  }

  // 编辑流程名称
  const newFlowNameInput = document.getElementById('newFlowName');
  const newNameLengthHint = document.getElementById('newNameLengthHint');
  if (newFlowNameInput && newNameLengthHint) {
    newFlowNameInput.addEventListener('input', function () {
      const length = countCNChars(this.value);
      newNameLengthHint.textContent = length + '/12';
      if (length > 12) {
        this.value = this.value.substring(0, 12);
        newNameLengthHint.textContent = '12/12';
        showMsg('historyMsg', '流程名称最多12个字符', false);
      }
    });
  }

  // 流程描述
  const processDescInput = document.getElementById('processDesc');
  const descLengthHint = document.getElementById('descLengthHint');
  if (processDescInput && descLengthHint) {
    processDescInput.addEventListener('input', function () {
      const length = countCNChars(this.value);
      descLengthHint.textContent = length + '/9999';
      if (length > 9999) {
        this.value = this.value.substring(0, 9999);
        descLengthHint.textContent = '9999/9999';
        showMsg('newMsg', '流程描述最多9999个字符', false);
      }
    });
  }
}

/**
 * 切换标签页
 */
export function switchTab(tabName) {
  // 切换标签
  const tabs = document.querySelectorAll('.tab');
  tabs.forEach(tab => tab.classList.remove('active'));
  const targetTab = document.querySelector('.tab[data-tab="' + tabName + '"]');
  if (targetTab) targetTab.classList.add('active');

  // 切换面板
  const panels = document.querySelectorAll('.tab-panel');
  panels.forEach(panel => {
    if (panel) { // 加空值保护
      panel.classList.remove('active');
      panel.style.display = 'none';
    }
  });
  const targetPanel = document.getElementById(tabName + '-tab');
  if (targetPanel) {
    targetPanel.classList.add('active');
    targetPanel.style.display = '';
  }

  const newCanvas = document.getElementById('newBpmnContainer');
  const historyCanvas = document.getElementById('historyBpmnContainer');
  if (newCanvas && historyCanvas) {
    const showNewCanvas = tabName === 'new';
    newCanvas.classList.toggle('is-active', showNewCanvas);
    historyCanvas.classList.toggle('is-active', !showNewCanvas);
  }

  // 切换到"全新生成"时，清除侧边栏历史流程的选中状态
  if (tabName === 'new') {
    document.querySelectorAll('.flow-item').forEach(item => item.classList.remove('active'));
  }
}
