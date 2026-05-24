let toastContainer = null;

function getToastContainer() {
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.className = 'toast-container';
        toastContainer.id = 'toastContainer';
        document.body.appendChild(toastContainer);
    }
    return toastContainer;
}

const ICONS = {
    success: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
        <path d="M20 6L9 17l-5-5"/>
    </svg>`,
    error: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
        <path d="M18 6L6 18M6 6l12 12"/>
    </svg>`,
    warning: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
        <path d="M12 9v4M12 17h.01"/>
        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
    </svg>`,
    info: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
        <path d="M12 16v-4M12 8h.01"/>
        <circle cx="12" cy="12" r="10"/>
    </svg>`
};

export function toast(options = {}) {
    const {
        type = 'info',
        title = '',
        message = '',
        duration = 4000,
        showClose = true
    } = options;

    const container = getToastContainer();
    const toastEl = document.createElement('div');
    toastEl.className = `toast ${type}`;
    toastEl.innerHTML = `
        <div class="toast-icon">${ICONS[type] || ICONS.info}</div>
        <div class="toast-content">
            ${title ? `<div class="toast-title">${title}</div>` : ''}
            ${message ? `<div class="toast-message">${message}</div>` : ''}
        </div>
        ${showClose ? `
        <button class="toast-close" onclick="this.parentElement.remove()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
        </button>` : ''}
        ${duration > 0 ? `<div class="toast-progress" style="animation-duration: ${duration}ms"></div>` : ''}
    `;

    container.appendChild(toastEl);

    if (duration > 0) {
        setTimeout(() => {
            toastEl.classList.add('toast-out');
            setTimeout(() => {
                if (toastEl.parentElement) {
                    toastEl.remove();
                }
            }, 300);
        }, duration);
    }

    return toastEl;
}

export function toastSuccess(message, title = 'success') {
    return toast({ type: 'success', title, message });
}

export function toastError(message, title = 'error') {
    return toast({ type: 'error', title, message, duration: 5000 });
}

export function toastWarning(message, title = 'warning') {
    return toast({ type: 'warning', title, message });
}

export function toastInfo(message, title = 'info') {
    return toast({ type: 'info', title, message });
}