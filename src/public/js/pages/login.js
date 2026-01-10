// login.js - JavaScript for CrazyWalk Login Page

/**
 * Switches between Login and Register tabs
 * @param {string} tab - 'login' or 'register'
 */
function switchTab(tab) {
    const loginForm = document.getElementById('login-form');
    const regForm = document.getElementById('register-form');
    const tabs = document.querySelectorAll('.tab-btn');
    const loginStatus = document.getElementById('login-status');
    const regStatus = document.getElementById('reg-status');

    // Clear status
    loginStatus.textContent = '';
    regStatus.textContent = '';

    if (tab === 'login') {
        loginForm.classList.remove('hidden');
        regForm.classList.add('hidden');
        tabs[0].classList.add('active');
        tabs[1].classList.remove('active');
    } else {
        loginForm.classList.add('hidden');
        regForm.classList.remove('hidden');
        tabs[0].classList.remove('active');
        tabs[1].classList.add('active');
    }
}

/**
 * Handles user login via API
 */
async function handleLogin() {
    const user = document.getElementById('login-user').value;
    const pass = document.getElementById('login-pass').value;
    const status = document.getElementById('login-status');

    if (!user || !pass) {
        status.textContent = "Please fill in all fields";
        status.className = "status-message status-error";
        return;
    }

    status.textContent = "Authenticating...";
    status.className = "status-message";

    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: user, password: pass })
        });
        const data = await res.json();

        if (data.status === 'ok') {
            status.textContent = "Login Successful!";
            status.className = "status-message status-success";

            setTimeout(() => {
                window.location.href = '/map.html';
            }, 1000);
        } else {
            status.textContent = data.message || "Login Failed";
            status.className = "status-message status-error";
        }
    } catch (e) {
        status.textContent = "Connection Error";
        status.className = "status-message status-error";
    }
}

/**
 * Handles user registration via API
 */
async function handleRegister() {
    const user = document.getElementById('reg-user').value;
    const pass = document.getElementById('reg-pass').value;
    const status = document.getElementById('reg-status');

    if (!user || !pass) {
        status.textContent = "Please fill in all fields";
        status.className = "status-message status-error";
        return;
    }

    status.textContent = "Creating Account...";
    status.className = "status-message";

    try {
        const res = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: user, password: pass })
        });
        const data = await res.json();

        if (data.status === 'ok') {
            status.textContent = "Account Created! Switching to Login...";
            status.className = "status-message status-success";
            setTimeout(() => {
                switchTab('login');
                document.getElementById('login-user').value = user;
                document.getElementById('login-status').textContent = "Please login with new account";
            }, 1500);
        } else {
            status.textContent = data.message || "Registration Failed";
            status.className = "status-message status-error";
        }
    } catch (e) {
        status.textContent = "Connection Error";
        status.className = "status-message status-error";
    }
}
