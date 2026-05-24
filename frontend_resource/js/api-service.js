// frontend_resource/js/api-service.js
import { API_BASE, globalState, bpmnInstances } from './config.js';
import { showMsg, renderBpmn } from './utils.js';
import { switchToFlowDetail, switchToNewFlow } from './page-state.js';

// 检查是否登录
function isLoggedIn() {
  return !!localStorage.getItem('token');
}

/**
 * 加载历史流程列表
 */
let isLoadingFlowList = false;
let lastFlowListCache = null;
let lastFlowListTime = 0;
const FLOW_LIST_CACHE_TIME = 1000; // 1秒缓存

export async function loadHistoryFlowList(forceRefresh = false) {
  const sidebarContainer = document.getElementById('historyFlowList');
  if (!sidebarContainer) {
    console.error('❌ 左侧流程列表容器未找到！');
    showMsg('newMsg', '页面元素加载异常，请刷新重试', false);
    return;
  }

  if (isLoadingFlowList) {
    console.warn('⚠️ 流程列表正在加载中，跳过重复调用');
    return;
  }

  // 检查缓存
  const now = Date.now();
  if (!forceRefresh && lastFlowListCache && (now - lastFlowListTime) < FLOW_LIST_CACHE_TIME) {
    console.log('使用缓存的流程列表');
    return;
  }

  try {
    isLoadingFlowList = true;
    sidebarContainer.innerHTML = '<div class="loading" id="flowListLoading">Loading...</div>';

    const response = await fetch(`${API_BASE}/flow-list`, {
      signal: AbortSignal.timeout(15000)
    });
    const result = await response.json();
    sidebarContainer.innerHTML = '';

    if (result.code === 200 && Array.isArray(result.data) && result.data.length > 0) {
      const { renderHistoryFlowList } = await import('./sidebar-btn.js');
      renderHistoryFlowList(result.data, sidebarContainer);
      lastFlowListCache = result.data;
      lastFlowListTime = now;
    } else {
      sidebarContainer.innerHTML = '<div class="empty-tip">No history flows</div>';
      lastFlowListCache = null;
    }
  } catch (error) {
    console.warn('加载历史流程接口异常:', error);
    sidebarContainer.innerHTML = '<div class="empty-tip">Failed to load history flows</div>';
  } finally {
    isLoadingFlowList = false;
  }
}

/**
 * 获取详细流程记录
 */
export async function getFlowDetail(flowId, skipRender = false) {
  if (!flowId) {
    showMsg('historyMsg', 'Please select a flow!', false);
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/flow-detail/${flowId}`, {
      signal: AbortSignal.timeout(15000)
    });
    const result = await response.json();

    if (result.code === 200) {
      showMsg('historyMsg', result.msg || 'Query successful', true);

      // 信息卡片渲染
      const flowInfo = document.getElementById('flowInfo');
      flowInfo.style.display = 'block';
      flowInfo.className = 'card info-card show';
      document.getElementById('infoTime').textContent = result.data.create_time;
      document.getElementById('infoDesc').textContent = result.data.process_desc;

      //渲染多条微调指令
      const promptList = result.data.fine_tune_prompts || [];
      const container = document.querySelector('.chat-scroll-container');

      //先清除旧的微调指令（避免重复）
      document.querySelectorAll('.prompt-bubble').forEach(el => el.remove());

      //循环渲染每一条微调指令
      promptList.forEach(item => {
        const wrapper = document.createElement('div');
        wrapper.className = 'chat-bubble-wrapper prompt-bubble'; // 标记方便清空

        const timeDiv = document.createElement('div');
        timeDiv.className = 'chat-time';
        timeDiv.textContent = item.create_time;

        const bubbleDiv = document.createElement('div');
        bubbleDiv.className = 'chat-bubble';

        const contentDiv = document.createElement('div');
        contentDiv.className = 'chat-content';
        contentDiv.textContent = item.prompt; // 微调指令内容

        // 组装
        bubbleDiv.appendChild(contentDiv);
        wrapper.appendChild(timeDiv);
        wrapper.appendChild(bubbleDiv);

        // 插入到容器中
        container.appendChild(wrapper);
      });

      // 渲染流程图（根据参数决定是否跳过）
      if (!skipRender) {
        await renderBpmn(result.data.bpmn_xml, bpmnInstances.historyViewer);
      }
    } else {
      showMsg('historyMsg', result.detail || 'Query failed', false);
    }
  } catch (error) {
    showMsg('historyMsg', `Query failed: ${error.message}`, false);
    console.error('获取流程详情失败:', error);
  }
}

/**
 * 全新生成BPMN流程图
 */
export async function generateBpmn() {
  const apiKey = document.getElementById('apiKey').value;
  const modelName = document.getElementById('modelName').value;
  const temperature = parseFloat(document.getElementById('temperature').value);
  const flowName = document.getElementById('flowName').value;
  const processDesc = document.getElementById('processDesc').value;

  if (!apiKey || !processDesc) {
    showMsg('newMsg', 'Please fill in API-KEY and process description!', false);
    return;
  }

  const generateBtn = document.querySelector('button[onclick*="generateBpmn"]');
  if (generateBtn) {
    generateBtn.disabled = true;
    generateBtn.innerHTML = '<span>Generating...</span>';
  }

  try {
    const response = await fetch(`${API_BASE}/generate-bpmn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        model_name: modelName,
        temperature: temperature,
        flow_name: flowName,
        process_desc: processDesc
      }),
      //signal: AbortSignal.timeout(15000)
    });

    const result = await response.json();

    if (result.code === 200) {
      const { flow_id, bpmn_xml } = result.data;
      
      globalState.currentFlowId = flow_id;
      showMsg('newMsg', `${result.msg}, Flow ID: ${flow_id}`, true);

      // 直接渲染BPMN图
      await renderBpmn(bpmn_xml, bpmnInstances.newViewer);

      await Promise.all([
        loadHistoryFlowList(true),
        switchToFlowDetail(flow_id)
      ]);
      
      const newFlowBtn = document.querySelector(`[data-flow-id="${flow_id}"]`);
      if (newFlowBtn) {
        document.querySelectorAll('.history-flow-btn.active').forEach(btn => btn.classList.remove('active'));
        newFlowBtn.classList.add('active');
      }
    } else {
      showMsg('newMsg', result.detail || 'Generation failed', false);
    }
  } catch (error) {
    showMsg('newMsg', `Request failed: ${error.message}`, false);
  } finally {
    if (generateBtn) {
      generateBtn.disabled = false;
      generateBtn.innerHTML = `
        <svg class="btn-icon" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 2l2.4 5.6L20 10l-5.6 2.4L12 18l-2.4-5.6L4 10l5.6-2.4L12 2zm7 14l1.2 2.8L23 20l-2.8 1.2L19 24l-1.2-2.8L15 20l2.8-1.2L19 16zM5 15l.9 2.1L8 18l-2.1.9L5 21l-.9-2.1L2 18l2.1-.9L5 15z" fill="currentColor" />
        </svg>
        <span>Generate Flowchart</span>
      `;
    }
  }
}

/**
 * 微调BPMN流程图
 */
export async function fineTuneBpmn() {
  const apiKey = document.getElementById('apiKey').value;
  const modelName = document.getElementById('modelName').value;
  const temperature = parseFloat(document.getElementById('temperature').value);
  const flowId = globalState.currentFlowId;
  const fineTuneInstruction = document.getElementById('fineTuneInstruction').value;

  if (!apiKey || !flowId || !fineTuneInstruction) {
    showMsg('historyMsg', 'Please fill in API-KEY, flow ID and fine-tune instruction!', false);
    return;
  }

  const fineTuneBtn = document.querySelector('button[onclick*="fineTuneBpmn"]');
  const instructionInput = document.getElementById('fineTuneInstruction');
  if (fineTuneBtn) {
    fineTuneBtn.disabled = true;
    fineTuneBtn.innerHTML = '<span>Fine-tuning...</span>';
  }
  if (instructionInput) instructionInput.disabled = true;

  try {
    const response = await fetch(`${API_BASE}/fine-tune-bpmn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        model_name: modelName,
        temperature: temperature,
        flow_id: parseInt(flowId),
        fine_tune_instruction: fineTuneInstruction
      }),
      //signal: AbortSignal.timeout(30000)
    });

    const result = await response.json();

    if (result.code === 200) {
      showMsg('historyMsg', result.msg, true);

      globalState.currentFlowId = flowId;

      // 清空输入框
      if (instructionInput) instructionInput.value = '';

      // 并行处理：渲染BPMN图和获取流程信息
      await Promise.all([
        renderBpmn(result.data.bpmn_xml, bpmnInstances.historyViewer),
        switchToFlowDetail(flowId, null, true)
      ]);
    } else {
      showMsg('historyMsg', result.detail || 'Fine-tuning failed', false);
    }
  } catch (error) {
    showMsg('historyMsg', `Fine-tuning failed: ${error.message}`, false);
  } finally {
    if (fineTuneBtn) {
      fineTuneBtn.disabled = false;
      fineTuneBtn.innerHTML = `
        <svg class="btn-icon" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 17.25V21h3.75L17.8 9.94l-3.75-3.75L3 17.25zm18.37-11.48a1 1 0 0 0 0-1.41l-1.73-1.73a1 1 0 0 0-1.41 0l-1.36 1.36 3.75 3.75 1.75-1.97z" fill="currentColor" />
        </svg>
        <span>Fine-tune Flow</span>
      `;
    }
    if (instructionInput) instructionInput.disabled = false;
  }
}

/**
 * 导入BPMN文件
 */
export async function importBpmn() {
  const fileInput = document.getElementById('importFile');
  if (!fileInput.files.length) {
    showMsg('newMsg', 'Please select a BPMN file to import!', false);
    return;
  }

  const file = fileInput.files[0];
  const formData = new FormData();
  formData.append('file', file);

  try {
    const response = await fetch(`${API_BASE}/import-bpmn`, {
      method: 'POST',
      body: formData,
      signal: AbortSignal.timeout(10000)
    });

    const result = await response.json();

    if (result.code === 200) {
      const { flow_id, flow_name, bpmn_xml } = result.data;
      
      globalState.currentFlowId = flow_id;
      showMsg('newMsg', `${result.msg}, Flow ID: ${flow_id}`, true);

      await renderBpmn(bpmn_xml, bpmnInstances.newViewer);
      await loadHistoryFlowList();
      await switchToFlowDetail(flow_id, flow_name);

    } else {
      showMsg('newMsg', result.detail || 'Import failed', false);
    }
  } catch (error) {
    showMsg('newMsg', `Import failed: ${error.message}`, false);
  } finally {
    fileInput.value = ''; // 清空文件选择框
  }
}

/**
 * 导入文档文件（.txt, .doc, .docx, .dot）并自动生成流程图
 */
export async function importDocument() {
  const fileInput = document.getElementById('importDocFile');
  if (!fileInput.files.length) {
    showMsg('newMsg', 'Please select a document file to import!', false);
    return;
  }

  const file = fileInput.files[0];
  const filename = file.name.toLowerCase();
  
  // 校验文件类型
  if (!filename.match(/\.(txt|doc|docx|dot)$/)) {
    showMsg('newMsg', 'Only .txt, .doc, .docx, .dot files are supported!', false);
    fileInput.value = '';
    return;
  }

  // 获取API配置
  const apiKey = document.getElementById('apiKey').value;
  const modelName = document.getElementById('modelName').value;
  const temperature = parseFloat(document.getElementById('temperature').value);
  const flowName = document.getElementById('flowName').value;

  if (!apiKey) {
    showMsg('newMsg', 'Please enter API Key first!', false);
    fileInput.value = '';
    return;
  }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('api_key', apiKey);
  formData.append('model_name', modelName);
  formData.append('temperature', temperature);
  formData.append('flow_name', flowName);

  const importBtn = document.getElementById('importDocBtn');
  if (importBtn) {
    importBtn.disabled = true;
    importBtn.innerHTML = '<span>Processing...</span>';
  }

  try {
    const response = await fetch(`${API_BASE}/parse-document`, {
      method: 'POST',
      body: formData,
      signal: AbortSignal.timeout(120000)
    });

    const result = await response.json();

    if (result.code === 200) {
      const { flow_id, bpmn_xml } = result.data;
      
      globalState.currentFlowId = flow_id;
      showMsg('newMsg', `Document imported and flowchart generated! Flow ID: ${flow_id}`, true);

      // 直接渲染BPMN图
      await renderBpmn(bpmn_xml, bpmnInstances.newViewer);

      await Promise.all([
        loadHistoryFlowList(true),
        switchToFlowDetail(flow_id)
      ]);
      
      const newFlowBtn = document.querySelector(`[data-flow-id="${flow_id}"]`);
      if (newFlowBtn) {
        document.querySelectorAll('.history-flow-btn.active').forEach(btn => btn.classList.remove('active'));
        newFlowBtn.classList.add('active');
      }
    } else {
      showMsg('newMsg', result.detail || 'Document import failed', false);
    }
  } catch (error) {
    showMsg('newMsg', `Document import failed: ${error.message}`, false);
  } finally {
    fileInput.value = '';
    if (importBtn) {
      importBtn.disabled = false;
      importBtn.innerHTML = `
        <svg class="btn-icon" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3v10.17l3.59-3.58L17 11l-5 5-5-5 1.41-1.41L11 13.17V3h1zM5 19h14v2H5z" fill="currentColor" />
        </svg>
        <span>Import Document</span>
      `;
    }
  }
}

/**
 * 导出BPMN文件
 */
export async function exportBpmn() {
  const flowId = globalState.currentFlowId;
  
  if (!flowId) {
    showMsg('historyMsg', 'Please select a flow first', false);
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/export-bpmn/${flowId}`, {
      signal: AbortSignal.timeout(5000)
    });

    if (response.ok) {
      const blob = await response.blob();
      const contentDisposition = response.headers.get('Content-Disposition');
      let fileName = `Flow_${flowId}.bpmn`;

      if (contentDisposition) {
        const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/);
        if (utf8Match && utf8Match[1]) {
          fileName = decodeURIComponent(utf8Match[1]);
        } else {
          const normalMatch = contentDisposition.match(/filename="?([^";]+)"?/);
          if (normalMatch && normalMatch[1]) {
            fileName = normalMatch[1];
          }
        }
      }

      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(a.href);
      showMsg('historyMsg', `Export successful! File: ${fileName}`, true);
    } else {
      const result = await response.json().catch(() => ({ detail: 'Export failed' }));
      showMsg('historyMsg', result.detail || 'Export failed', false);
    }
  } catch (error) {
    showMsg('historyMsg', `Export failed: ${error.message}`, false);
    console.error('导出异常:', error);
  }
}

/**
 * 修改流程名称
 */
export async function updateFlowName(flowId, newName) {
  if (!flowId) {
    showMsg('historyMsg', 'Please select a flow first', false);
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/update-flow-name`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        flow_id: parseInt(flowId),
        new_name: newName
      }),
      signal: AbortSignal.timeout(5000)
    });

    const result = await response.json();

    if (result.code === 200) {
      showMsg('historyMsg', result.msg, true);
      await getFlowDetail(flowId);
      await loadHistoryFlowList();
      document.getElementById('pageTitle').textContent = newName;
    } else {
      showMsg('historyMsg', result.detail || 'Update failed', false);
    }
  } catch (error) {
    showMsg('historyMsg', `Update failed: ${error.message}`, false);
  }
}

/**
 * 删除流程
 */
export async function deleteFlow(flowId) {
  if (!flowId) {
    showMsg('historyMsg', 'Please select a flow first', false);
    return false;
  }

  try {
    const response = await fetch(`${API_BASE}/delete-flow/${flowId}`, {
      method: 'DELETE',
      signal: AbortSignal.timeout(5000)
    });

    const result = await response.json();

    if (result.code === 200) {
      showMsg('historyMsg', result.msg || 'Delete successful', true);
      await loadHistoryFlowList();

      const currentId = Number(globalState.currentFlowId);
      const deleteId = Number(flowId);
      // 如果删除的是当前选中的流程，切换到新建页面
      if (currentId === deleteId && !isNaN(currentId)) {
        switchToNewFlow();
      }

      return true;
    } else {
      showMsg('historyMsg', result.detail || 'Delete failed', false);
      return false;
    }
  } catch (error) {
    // 兼容后端接口未开发完成的情况
    showMsg('historyMsg', `Delete API not ready: ${error.message}`, false);
    console.error('删除流程异常:', error);
    return false;
  }
}

/**
 * 保存BPMN编辑器中的手动编辑内容
 */
export async function saveBpmnEditor() {
  const flowId = globalState.currentFlowId;
  
  if (!flowId) {
    showMsg('historyMsg', 'Please select a flow before saving', false);
    return;
  }

  const viewer = globalState.currentPageType === 'new'
    ? bpmnInstances.newViewer
    : bpmnInstances.historyViewer;

  if (!viewer) {
    showMsg('historyMsg', 'Editor not ready', false);
    return;
  }

  try {
    const { xml } = await viewer.saveXML({ format: true });

    const response = await fetch(`${API_BASE}/save-bpmn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        flow_id: parseInt(flowId),
        bpmn_xml: xml
      }),
      signal: AbortSignal.timeout(5000)
    });

    const result = await response.json();

    if (result.code === 200) {
      showMsg('historyMsg', result.msg || 'Save successful', true);
    } else {
      showMsg('historyMsg', result.detail || 'Save failed', false);
    }
  } catch (error) {
    showMsg('historyMsg', `Save failed: ${error.message}`, false);
    console.error('保存编辑异常:', error);
  }
}