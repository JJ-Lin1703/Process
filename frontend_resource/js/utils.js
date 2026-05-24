// frontend_resource/js/utils.js
export function countCNChars(text) {
  if (typeof text !== 'string') return 0;
  return text.length;
}

export function showMsg(elemId, msg, isSuccess) {
  const elem = document.getElementById(elemId);
  if (!elem) return;

  elem.textContent = msg;
  elem.style.display = 'block';
  elem.className = 'msg ' + (isSuccess ? 'success' : 'error');
  clearTimeout(elem.msgTimer);
  elem.msgTimer = setTimeout(() => {
    elem.style.display = 'none';
    elem.className = 'msg';
  }, 10000);
}

export async function renderBpmn(xml, viewer, autoScroll = true) {
  if (!xml || !viewer) {
    console.warn('渲染BPMN失败：XML为空或Viewer未初始化');
    return;
  }

  try {
    viewer.clear();
    const { warnings } = await viewer.importXML(xml);
    if (warnings && warnings.length) {
      console.warn('BPMN渲染警告:', warnings);
    }

    if (autoScroll) {
      try {
        const canvas = viewer.get('canvas');
        const elementRegistry = viewer.get('elementRegistry');
        const rootElement = elementRegistry.get('Process_1') || elementRegistry.get('proc');
        
        if (rootElement) {
          canvas.scrollToElement(rootElement, { duration: 0 });
        } else {
          canvas.scrollTo({ x: 200, y: 100 });
        }
      } catch (e) {
        // 绝对不抛出错误，保证页面不崩
      }
    }

  } catch (err) {
    console.error('渲染BPMN失败:', err);
    throw new Error('BPMN渲染失败：' + err.message);
  }
}

export function confirmDialog(options) {
    return new Promise((resolve) => {
        const {
            title = '确认操作',
            message = '确定要执行此操作吗？',
            confirmText = '确认',
            cancelText = '取消'
        } = options;

        const dialog = document.createElement('div');
        dialog.className = 'confirm-modal';
        dialog.innerHTML = `
            <div class="modal-box">
                <div class="modal-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                    </svg>
                </div>
                <h4>${title}</h4>
                <p>${message}</p>
                <div class="btns">
                    <button class="btn-cancel">${cancelText}</button>
                    <button class="btn-confirm">${confirmText}</button>
                </div>
            </div>
        `;

        document.body.appendChild(dialog);

        setTimeout(() => {
            dialog.classList.add('show');
        }, 10);

        const cancelBtn = dialog.querySelector('.btn-cancel');
        const confirmBtn = dialog.querySelector('.btn-confirm');

        const cleanup = () => {
            dialog.classList.remove('show');
            setTimeout(() => {
                if (dialog.parentElement) {
                    dialog.remove();
                }
            }, 300);
        };

        const handleCancel = () => {
            cleanup();
            resolve(false);
        };

        const handleConfirm = () => {
            cleanup();
            resolve(true);
        };

        cancelBtn.addEventListener('click', handleCancel);
        confirmBtn.addEventListener('click', handleConfirm);

        dialog.addEventListener('click', (e) => {
            if (e.target === dialog) {
                handleCancel();
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                handleCancel();
            }
        }, { once: true });
    });
}