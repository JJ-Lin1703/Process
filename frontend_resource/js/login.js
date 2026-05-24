// frontend_resource/js/login.js
import { API_BASE } from './config.js';
import { toastSuccess, toastError, toastWarning, toastInfo } from './toast.js';

// 切换面板：登录 / 注册
export function switchPanel(type) {
  const panels = document.querySelectorAll('.form-panel');
  const tabs = document.querySelectorAll('.tab-btn');

  panels.forEach(el => el.classList.remove('active'));
  tabs.forEach(el => el.classList.remove('active'));

  document.getElementById(`${type}-panel`).classList.add('active');
  tabs[type === 'login' ? 0 : 1].classList.add('active');
}

// 登录
export async function userLogin() {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-pwd').value.trim();

  if (!username || !password) {
    toastWarning('Please enter username and password');
    return;
  }

  const params = new URLSearchParams();
  params.append('username', username);
  params.append('password', password);

  try {
    const res = await fetch(`${API_BASE}/login`, {
      method: 'POST',
      body: params
    });

    const data = await res.json();
    if (res.ok && data.code === 200) {
      localStorage.setItem('token', data.data.token);
      localStorage.setItem('userInfo', JSON.stringify(data.data));
      toastSuccess('Login successful', 'Success');
      setTimeout(() => {
        const referrer = document.referrer;
        if (referrer && referrer.includes('index.html')) {
          location.href = referrer;
        } else {
          location.href = 'index.html';
        }
      }, 800);
    } else {
      toastError(data.detail || data.msg || 'Login failed', 'Login failed');
    }
  } catch (err) {
    console.error('Login error：', err);
    toastError('Network error, login failed');
  }
}

// 注册
export async function userRegister() {
  const username = document.getElementById('reg-username').value.trim();
  const password = document.getElementById('reg-pwd').value.trim();
  const confirmPassword = document.getElementById('reg-confirm-pwd').value.trim();
  const email = document.getElementById('reg-email')?.value.trim() || '';

  if (!username || !password) {
    toastWarning('Please enter username and password');
    return;
  }

  if (password !== confirmPassword) {
    toastWarning('Passwords do not match');
    return;
  }

  if (password.length < 6) {
    toastWarning('Password must be at least 6 characters');
    return;
  }

  if (email && !validateEmail(email)) {
    toastWarning('Please enter a valid email address');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, email })
    });

    const data = await res.json();
    if (res.ok && data.code === 200) {
      toastSuccess('Registration successful! Please login', 'Success');
      setTimeout(() => {
        switchPanel('login');
      }, 800);
    } else {
      toastError(data.detail || data.msg || 'Registration failed', 'Registration failed');
    }
  } catch (err) {
    console.error('Registration error：', err);
    toastError('Network error, registration failed');
  }
}

// 忘记密码
export function showForgotPassword() {
  const forgotPanel = document.getElementById('forgot-panel');
  if (forgotPanel) {
    forgotPanel.style.display = 'block';
    document.getElementById('login-panel').style.display = 'none';
    document.getElementById('register-panel').style.display = 'none';
  } else {
    const email = prompt('请输入注册时使用的邮箱：');
    if (!email) return;
    
    if (!validateEmail(email)) {
      toastWarning('请输入有效的邮箱地址');
      return;
    }

    forgotPassword(email);
  }
}

export async function forgotPassword(email) {
  try {
    const res = await fetch(`${API_BASE}/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });

    const data = await res.json();
    if (res.ok && data.code === 200) {
      if (data.data && data.data.reset_link) {
        location.href = data.data.reset_link;
      }
    } else {
      toastError(data.detail || data.msg || '发送失败', '发送失败');
    }
  } catch (err) {
    console.error('忘记密码异常：', err);
    toastError('网络异常，请稍后重试');
  }
}

// 返回登录
export function backToLogin() {
  document.getElementById('login-panel').style.display = 'block';
  const forgotPanel = document.getElementById('forgot-panel');
  if (forgotPanel) {
    forgotPanel.style.display = 'none';
  }
}

function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

// 初始化回车键监听
export function initKeydownEvents() {
  // 登录面板的回车键监听
  const loginUsername = document.getElementById('login-username');
  const loginPwd = document.getElementById('login-pwd');

  loginUsername?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      loginPwd?.focus();
    }
  });

  loginPwd?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      userLogin();
    }
  });

  // 注册面板的回车键监听
  const regUsername = document.getElementById('reg-username');
  const regEmail = document.getElementById('reg-email');
  const regPwd = document.getElementById('reg-pwd');
  const regConfirmPwd = document.getElementById('reg-confirm-pwd');

  regUsername?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      regEmail?.focus();
    }
  });

  regEmail?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      regPwd?.focus();
    }
  });

  regPwd?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      regConfirmPwd?.focus();
    }
  });

  regConfirmPwd?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      userRegister();
    }
  });
}

// 挂载到 window 供 HTML onclick 使用
window.switchPanel = switchPanel;
window.userLogin = userLogin;
window.userRegister = userRegister;
window.initKeydownEvents = initKeydownEvents;
window.showForgotPassword = showForgotPassword;
window.backToLogin = backToLogin;