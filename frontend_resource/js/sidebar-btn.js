import { deleteFlow, loadHistoryFlowList, updateFlowName } from './api-service.js';
import { globalState } from './config.js';
import { switchToFlowDetail } from './page-state.js';
import { countCNChars, showMsg } from './utils.js';

export function getPinnedFlowIds() {
  try {
    return JSON.parse(localStorage.getItem('pinnedFlows') || '[]');
  } catch {
    return [];
  }
}

export function savePinnedFlowIds(ids) {
  localStorage.setItem('pinnedFlows', JSON.stringify(ids));
}

function closeMenu(menu) {
  menu.classList.remove('show');
}

function buildConfirmModal(title, bodyHtml, confirmText = '确认') {
  const modal = document.createElement('div');
  modal.className = 'rename-modal';
  modal.innerHTML = `
    <div class="modal-box">
      <h4>${title}</h4>
      ${bodyHtml}
      <div class="btns">
        <button class="btn-cancel">取消</button>
        <button class="btn-confirm">${confirmText}</button>
      </div>
    </div>
  `;
  return modal;
}

function ensureOperationMenu() {
  let menu = document.getElementById('flowOperationMenu');
  if (menu) return menu;

  menu = document.createElement('div');
  menu.id = 'flowOperationMenu';
  menu.className = 'flow-operation-menu';
  menu.innerHTML = `
    <div class="menu-item pin-item">置顶</div>
    <div class="menu-item rename-item">重命名</div>
    <div class="menu-divider"></div>
    <div class="menu-item danger delete-item">删除</div>
  `;
  document.body.appendChild(menu);

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (!menu.contains(target) && !target.classList.contains('more-btn')) {
      closeMenu(menu);
    }
  });

  menu.querySelector('.pin-item').addEventListener('click', async () => {
    const flowId = Number(menu.dataset.flowId);
    const isPinned = menu.dataset.isPinned === 'true';
    const pinnedIds = getPinnedFlowIds();

    if (isPinned) {
      const index = pinnedIds.indexOf(flowId);
      if (index >= 0) pinnedIds.splice(index, 1);
    } else {
      pinnedIds.push(flowId);
    }

    savePinnedFlowIds(pinnedIds);
    await loadHistoryFlowList();
    closeMenu(menu);
  });

  menu.querySelector('.rename-item').addEventListener('click', () => {
    if (document.querySelector('.rename-modal')) return;

    const oldName = menu.dataset.flowName || '';
    const modal = buildConfirmModal(
      '重命名流程',
      `
        <input type="text" id="renameInput" value="${oldName}" placeholder="请输入新名称">
        <div id="renameLengthHint" style="font-size:12px;color:#97a0b5;margin:4px 0 12px;text-align:right;"></div>
      `,
      '确定'
    );
    document.body.appendChild(modal);

    const renameInput = modal.querySelector('#renameInput');
    const renameLengthHint = modal.querySelector('#renameLengthHint');
    const updateHint = () => {
      renameLengthHint.textContent = `${countCNChars(renameInput.value)}/12`;
    };

    updateHint();
    renameInput.focus();
    renameInput.addEventListener('input', () => {
      if (countCNChars(renameInput.value) > 12) {
        renameInput.value = renameInput.value.slice(0, 12);
        showMsg('historyMsg', '流程名称最多12个字符', false);
      }
      updateHint();
    });

    modal.querySelector('.btn-confirm').addEventListener('click', async () => {
      const newName = renameInput.value.trim();
      if (!newName) {
        showMsg('historyMsg', '请输入流程名称', false);
        return;
      }

      await updateFlowName(menu.dataset.flowId, newName);
      document.body.removeChild(modal);
      closeMenu(menu);
    });

    modal.querySelector('.btn-cancel').addEventListener('click', () => {
      document.body.removeChild(modal);
    });

    modal.addEventListener('click', (event) => {
      if (event.target === modal) {
        document.body.removeChild(modal);
      }
    });
  });

  menu.querySelector('.delete-item').addEventListener('click', () => {
    if (document.querySelector('.rename-modal')) return;

    const flowId = menu.dataset.flowId;
    const flowName = menu.dataset.flowName || '';
    const modal = buildConfirmModal(
      '确认删除',
      `
        <p style="margin:0 0 16px; font-size:14px;">确定要删除流程 <strong>${flowName}</strong> 吗？</p>
        <p style="margin:0 0 16px; font-size:12px; color:#db415d;">删除后无法恢复。</p>
      `,
      '确认删除'
    );
    document.body.appendChild(modal);

    modal.querySelector('.btn-confirm').style.background = '#db415d';
    modal.querySelector('.btn-confirm').style.color = '#fff';

    modal.querySelector('.btn-confirm').addEventListener('click', async () => {
      await deleteFlow(flowId, flowName);
      document.body.removeChild(modal);
      closeMenu(menu);
    });

    modal.querySelector('.btn-cancel').addEventListener('click', () => {
      document.body.removeChild(modal);
    });

    modal.addEventListener('click', (event) => {
      if (event.target === modal) {
        document.body.removeChild(modal);
      }
    });
  });

  return menu;
}

export function renderHistoryFlowList(flowList, sidebarContainer) {
  const pinnedIds = getPinnedFlowIds();
  const menu = ensureOperationMenu();
  sidebarContainer.innerHTML = '';

  if (!Array.isArray(flowList) || flowList.length === 0) {
    const emptyTip = document.createElement('div');
    emptyTip.className = 'empty-tip';
    emptyTip.textContent = '暂无历史流程';
    sidebarContainer.appendChild(emptyTip);
    return;
  }

  flowList.sort((a, b) => {
    const aPinned = pinnedIds.includes(a.flow_id);
    const bPinned = pinnedIds.includes(b.flow_id);
    if (aPinned && !bPinned) return -1;
    if (!aPinned && bPinned) return 1;
    return b.flow_id - a.flow_id;
  });

  const fragment = document.createDocumentFragment();

  flowList.forEach((flow) => {
    const flowId = flow.flow_id;
    const flowName = flow.flow_name || `流程-${flowId}`;
    const isPinned = pinnedIds.includes(flowId);

    const itemContainer = document.createElement('div');
    itemContainer.className = 'flow-item';
    itemContainer.dataset.flowId = String(flowId);
    if (isPinned) itemContainer.classList.add('pinned');
    if (globalState.currentFlowId === flowId) itemContainer.classList.add('active');

    const flowBody = document.createElement('div');
    flowBody.className = 'flow-item-body';

    const flowNameEl = document.createElement('span');
    flowNameEl.className = 'flow-item-name';
    flowNameEl.textContent = flowName;

    const flowTimeEl = document.createElement('span');
    flowTimeEl.className = 'flow-item-time';
    flowTimeEl.textContent = flow.create_time || '';

    const actionsContainer = document.createElement('div');
    actionsContainer.className = 'flow-item-actions';

    const moreBtn = document.createElement('button');
    moreBtn.className = 'more-btn';
    moreBtn.type = 'button';
    moreBtn.textContent = '⋯';
    moreBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      menu.dataset.flowId = String(flowId);
      menu.dataset.flowName = flowName;
      menu.dataset.isPinned = String(isPinned);
      menu.querySelector('.pin-item').textContent = isPinned ? '取消置顶' : '置顶';

      const rect = moreBtn.getBoundingClientRect();
      menu.style.top = `${rect.bottom + window.scrollY}px`;
      menu.style.left = `${rect.left + window.scrollX - 96}px`;
      menu.classList.add('show');
    });

    itemContainer.addEventListener('click', async () => {
      await switchToFlowDetail(flowId, flowName);
    });

    flowBody.appendChild(flowNameEl);
    flowBody.appendChild(flowTimeEl);
    actionsContainer.appendChild(moreBtn);
    itemContainer.appendChild(flowBody);
    itemContainer.appendChild(actionsContainer);
    fragment.appendChild(itemContainer);
  });

  sidebarContainer.appendChild(fragment);
}
