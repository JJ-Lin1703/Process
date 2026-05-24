import { API_BASE } from './config.js';
import { toastSuccess, toastError, toastWarning } from './toast.js';

function getUrlParam(name) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(name);
}

export async function resetPassword() {
    const newPassword = document.getElementById('new-password').value.trim();
    const confirmPassword = document.getElementById('confirm-password').value.trim();
    const token = getUrlParam('token');

    if (!token) {
        toastError('链接无效或已过期');
        return;
    }

    if (!newPassword || !confirmPassword) {
        toastWarning('请填写密码');
        return;
    }

    if (newPassword !== confirmPassword) {
        toastWarning('两次输入的密码不一致');
        return;
    }

    if (newPassword.length < 6) {
        toastWarning('密码长度不能少于6位');
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/reset-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, new_password: newPassword })
        });

        const data = await res.json();
        if (res.ok && data.code === 200) {
            toastSuccess('reset password success', 'reset success');
            setTimeout(() => { 
                location.href = 'login.html';
            }, 1500);
        } else {
            toastError(data.detail || data.msg || 'reset failed, please try again later', 'reset failed');
        }
    } catch (err) {
        console.error('reset password exception:', err);
        toastError('network error, reset failed');
    }
}

window.resetPassword = resetPassword;