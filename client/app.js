(function () {
  "use strict";

  const API_BASE = "/api/v1/auth";
  const OTP_RESEND_COOLDOWN = 60;

  let accessToken = null;
  let currentUser = null;
  let pendingEmail = "";
  let pendingPurpose = "";
  let resendTimerId = null;
  let resetResendTimerId = null;

  async function apiCall(endpoint, method = "POST", body = null) {
    const options = {
      method,
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    };
    if (accessToken) {
      options.headers["Authorization"] = `Bearer ${accessToken}`;
    }
    if (body) {
      options.body = JSON.stringify(body);
    }

    const res = await fetch(`${API_BASE}${endpoint}`, options);
    const data = await res.json();

    if (!res.ok) {
      const err = new Error(data.error?.message || "Something went wrong.");
      err.code = data.error?.code || "SERVER_ERROR";
      err.status = res.status;
      err.retryAfterSeconds = data.retryAfterSeconds;
      throw err;
    }

    return data;
  }

  window.showView = function (viewName) {
    document.querySelectorAll(".view, .dashboard-view").forEach((v) => {
      v.classList.remove("active");
    });

    const target = document.getElementById(`view-${viewName}`);
    if (target) {
      target.classList.add("active");
    }

    clearAlerts();
    clearFormErrors();
  };

  window.goBackFromVerify = function () {
    if (pendingPurpose === "LOGIN") {
      showView("login");
    } else {
      showView("signup");
    }
  };

  function showAlert(prefix, type, message) {
    const el = document.getElementById(`${prefix}-alert`);
    const textEl = document.getElementById(`${prefix}-alert-text`);
    if (!el || !textEl) return;

    el.className = `alert visible alert-${type}`;
    textEl.textContent = message;
  }

  function clearAlerts() {
    document.querySelectorAll(".alert").forEach((el) => {
      el.className = "alert";
    });
  }

  function clearFormErrors() {
    document.querySelectorAll(".form-error").forEach((el) => {
      el.className = "form-error";
      el.textContent = "";
    });
    document.querySelectorAll(".form-input.error").forEach((el) => {
      el.classList.remove("error");
    });
  }

  function showFieldError(fieldId, message) {
    const errorEl = document.getElementById(`${fieldId}-error`);
    const inputEl = document.getElementById(fieldId);
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.className = "form-error visible";
    }
    if (inputEl) {
      inputEl.classList.add("error");
    }
  }

  function setLoading(btnId, loading) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    if (loading) {
      btn.classList.add("loading");
      btn.disabled = true;
    } else {
      btn.classList.remove("loading");
      btn.disabled = false;
    }
  }

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function getPasswordStrength(password) {
    let score = 0;
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
    if (/\d/.test(password)) score++;
    if (/[^a-zA-Z0-9]/.test(password)) score++;

    if (score <= 1) return { level: "weak", text: "Weak" };
    if (score === 2) return { level: "fair", text: "Fair" };
    if (score === 3) return { level: "good", text: "Good" };
    return { level: "strong", text: "Strong" };
  }

  function updatePasswordStrength(inputId, barId, textId, strengthContainerId) {
    const input = document.getElementById(inputId);
    const bar = document.getElementById(barId);
    const text = document.getElementById(textId);
    const container = document.getElementById(strengthContainerId);

    if (!input || !bar || !text || !container) return;

    input.addEventListener("input", () => {
      const val = input.value;
      if (val.length === 0) {
        container.classList.remove("visible");
        return;
      }
      container.classList.add("visible");
      const strength = getPasswordStrength(val);
      bar.className = `strength-bar-fill ${strength.level}`;
      text.textContent = strength.text;
    });
  }

  function setupOtpInputs(groupId) {
    const group = document.getElementById(groupId);
    if (!group) return;
    const digits = group.querySelectorAll(".otp-digit");

    digits.forEach((digit, i) => {
      digit.addEventListener("input", (e) => {
        const val = e.target.value.replace(/\D/g, "");
        e.target.value = val.slice(-1);

        if (val && i < digits.length - 1) {
          digits[i + 1].focus();
        }

        digit.classList.toggle("filled", val.length > 0);
        digit.classList.remove("error");
      });

      digit.addEventListener("keydown", (e) => {
        if (e.key === "Backspace" && !e.target.value && i > 0) {
          digits[i - 1].focus();
          digits[i - 1].value = "";
          digits[i - 1].classList.remove("filled");
        }
      });

      digit.addEventListener("focus", () => {
        digit.select();
      });

      digit.addEventListener("paste", (e) => {
        e.preventDefault();
        const pasted = (e.clipboardData || window.clipboardData)
          .getData("text")
          .replace(/\D/g, "")
          .slice(0, 6);

        pasted.split("").forEach((char, idx) => {
          if (digits[idx]) {
            digits[idx].value = char;
            digits[idx].classList.add("filled");
          }
        });

        if (pasted.length > 0) {
          const focusIdx = Math.min(pasted.length, digits.length - 1);
          digits[focusIdx].focus();
        }
      });
    });
  }

  function getOtpValue(groupId) {
    const group = document.getElementById(groupId);
    if (!group) return "";
    const digits = group.querySelectorAll(".otp-digit");
    return Array.from(digits)
      .map((d) => d.value)
      .join("");
  }

  function clearOtpInputs(groupId) {
    const group = document.getElementById(groupId);
    if (!group) return;
    const digits = group.querySelectorAll(".otp-digit");
    digits.forEach((d) => {
      d.value = "";
      d.classList.remove("filled", "error");
    });
    if (digits[0]) digits[0].focus();
  }

  function setOtpError(groupId) {
    const group = document.getElementById(groupId);
    if (!group) return;
    group.querySelectorAll(".otp-digit").forEach((d) => d.classList.add("error"));
  }

  function startResendTimer(btnId, timerId, seconds) {
    const btn = document.getElementById(btnId);
    const timer = document.getElementById(timerId);
    if (!btn || !timer) return;

    let remaining = seconds;
    btn.disabled = true;
    timer.textContent = `(${remaining}s)`;

    const intervalId = setInterval(() => {
      remaining--;
      timer.textContent = `(${remaining}s)`;

      if (remaining <= 0) {
        clearInterval(intervalId);
        btn.disabled = false;
        timer.textContent = "";
      }
    }, 1000);

    return intervalId;
  }

  function setupPasswordToggles() {
    document.querySelectorAll(".password-toggle").forEach((btn) => {
      btn.addEventListener("click", () => {
        const targetId = btn.getAttribute("data-target");
        const input = document.getElementById(targetId);
        if (!input) return;

        const isPassword = input.type === "password";
        input.type = isPassword ? "text" : "password";

        btn.innerHTML = isPassword
          ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'
          : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
      });
    });
  }

  function setSession(token, user) {
    accessToken = token;
    currentUser = user;
  }

  function clearSession() {
    accessToken = null;
    currentUser = null;
  }

  function showDashboard(user) {
    setSession(accessToken, user);
    document.getElementById("dashboard-greeting").textContent = `Welcome, ${user.name}`;
    document.getElementById("dashboard-name").textContent = user.name;
    document.getElementById("dashboard-email").textContent = user.email;
    showView("dashboard");
  }

  document.getElementById("signup-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    clearFormErrors();
    clearAlerts();

    const name = document.getElementById("signup-name").value.trim();
    const email = document.getElementById("signup-email").value.trim();
    const password = document.getElementById("signup-password").value;

    let valid = true;
    if (!name) {
      showFieldError("signup-name", "Name is required.");
      valid = false;
    }
    if (!email || !isValidEmail(email)) {
      showFieldError("signup-email", "Please enter a valid email address.");
      valid = false;
    }
    if (!password || password.length < 8) {
      showFieldError("signup-password", "Password must be at least 8 characters.");
      valid = false;
    }
    if (!valid) return;

    setLoading("signup-submit", true);

    try {
      await apiCall("/signup", "POST", { name, email, password });
      pendingEmail = email;
      pendingPurpose = "SIGNUP";
      document.getElementById("verify-email-display").textContent = email;
      showView("verify");
      setupOtpInputs("otp-group");
      if (resendTimerId) clearInterval(resendTimerId);
      resendTimerId = startResendTimer("resend-btn", "resend-timer", OTP_RESEND_COOLDOWN);
      const firstDigit = document.querySelector("#otp-group .otp-digit");
      if (firstDigit) setTimeout(() => firstDigit.focus(), 100);
    } catch (err) {
      if (err.code === "EMAIL_EXISTS") {
        showAlert("signup", "error", err.message);
      } else {
        showAlert("signup", "error", err.message);
      }
    } finally {
      setLoading("signup-submit", false);
    }
  });

  document.getElementById("verify-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    clearFormErrors();
    clearAlerts();

    const otp = getOtpValue("otp-group");
    if (otp.length !== 6) {
      showFieldError("verify-otp", "Please enter all 6 digits.");
      setOtpError("otp-group");
      return;
    }

    setLoading("verify-submit", true);

    try {
      const data = await apiCall("/verify-otp", "POST", {
        email: pendingEmail,
        otp,
        purpose: pendingPurpose,
      });

      if (pendingPurpose === "SIGNUP" || pendingPurpose === "LOGIN") {
        accessToken = data.data.accessToken;
        showDashboard(data.data.user);
      } else {
        showView("reset");
        document.getElementById("reset-email-display").textContent = pendingEmail;
        setupOtpInputs("reset-otp-group");
      }
    } catch (err) {
      if (err.code === "OTP_INVALID") {
        setOtpError("otp-group");
      }
      showAlert("verify", "error", err.message);
      if (err.code === "OTP_EXPIRED" || err.code === "OTP_MAX_ATTEMPTS") {
        clearOtpInputs("otp-group");
      }
    } finally {
      setLoading("verify-submit", false);
    }
  });

  document.getElementById("resend-btn").addEventListener("click", async () => {
    try {
      document.getElementById("resend-btn").disabled = true;
      await apiCall("/resend-otp", "POST", {
        email: pendingEmail,
        purpose: pendingPurpose,
      });
      showAlert("verify", "success", "A new code has been sent to your email.");
      clearOtpInputs("otp-group");
      if (resendTimerId) clearInterval(resendTimerId);
      resendTimerId = startResendTimer("resend-btn", "resend-timer", OTP_RESEND_COOLDOWN);
    } catch (err) {
      showAlert("verify", "error", err.message);
      if (!err.retryAfterSeconds) {
        document.getElementById("resend-btn").disabled = false;
      } else {
        if (resendTimerId) clearInterval(resendTimerId);
        resendTimerId = startResendTimer("resend-btn", "resend-timer", err.retryAfterSeconds);
      }
    }
  });

  document.getElementById("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    clearFormErrors();
    clearAlerts();

    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;

    let valid = true;
    if (!email || !isValidEmail(email)) {
      showFieldError("login-email", "Please enter a valid email address.");
      valid = false;
    }
    if (!password) {
      showFieldError("login-password", "Password is required.");
      valid = false;
    }
    if (!valid) return;

    setLoading("login-submit", true);

    try {
      const data = await apiCall("/login", "POST", { email, password });

      if (data.data?.requiresOtp) {
        pendingEmail = data.data.email || email;
        pendingPurpose = "LOGIN";
        document.getElementById("verify-email-display").textContent = pendingEmail;
        showView("verify");
        setupOtpInputs("otp-group");
        clearOtpInputs("otp-group");
        if (resendTimerId) clearInterval(resendTimerId);
        resendTimerId = startResendTimer("resend-btn", "resend-timer", OTP_RESEND_COOLDOWN);
        const firstDigit = document.querySelector("#otp-group .otp-digit");
        if (firstDigit) setTimeout(() => firstDigit.focus(), 100);
        showAlert("verify", "success", "A verification code has been sent to your email.");
      } else {
        accessToken = data.data.accessToken;
        showDashboard(data.data.user);
      }
    } catch (err) {
      if (err.code === "NOT_VERIFIED") {
        pendingEmail = email;
        pendingPurpose = "SIGNUP";
        showAlert("login", "error", "Your email is not verified. Redirecting to verification...");
        setTimeout(async () => {
          try {
            await apiCall("/resend-otp", "POST", { email, purpose: "SIGNUP" });
          } catch (_) {
          }
          document.getElementById("verify-email-display").textContent = email;
          showView("verify");
          setupOtpInputs("otp-group");
          if (resendTimerId) clearInterval(resendTimerId);
          resendTimerId = startResendTimer("resend-btn", "resend-timer", OTP_RESEND_COOLDOWN);
        }, 1500);
      } else {
        showAlert("login", "error", err.message);
      }
    } finally {
      setLoading("login-submit", false);
    }
  });

  document.getElementById("forgot-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    clearFormErrors();
    clearAlerts();

    const email = document.getElementById("forgot-email").value.trim();

    if (!email || !isValidEmail(email)) {
      showFieldError("forgot-email", "Please enter a valid email address.");
      return;
    }

    setLoading("forgot-submit", true);

    try {
      await apiCall("/forgot-password", "POST", { email });
      pendingEmail = email;
      pendingPurpose = "PASSWORD_RESET";
      showAlert("forgot", "success", "If an account exists, a reset code has been sent.");

      setTimeout(() => {
        document.getElementById("reset-email-display").textContent = email;
        showView("reset");
        setupOtpInputs("reset-otp-group");
        if (resetResendTimerId) clearInterval(resetResendTimerId);
        resetResendTimerId = startResendTimer("reset-resend-btn", "reset-resend-timer", OTP_RESEND_COOLDOWN);
        const firstDigit = document.querySelector("#reset-otp-group .otp-digit");
        if (firstDigit) setTimeout(() => firstDigit.focus(), 100);
      }, 1500);
    } catch (err) {
      showAlert("forgot", "error", err.message);
    } finally {
      setLoading("forgot-submit", false);
    }
  });

  document.getElementById("reset-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    clearFormErrors();
    clearAlerts();

    const otp = getOtpValue("reset-otp-group");
    const newPassword = document.getElementById("reset-password").value;
    const confirmPassword = document.getElementById("reset-confirm").value;

    let valid = true;
    if (otp.length !== 6) {
      showFieldError("reset-otp", "Please enter all 6 digits.");
      setOtpError("reset-otp-group");
      valid = false;
    }
    if (!newPassword || newPassword.length < 8) {
      showFieldError("reset-password", "Password must be at least 8 characters.");
      valid = false;
    }
    if (newPassword !== confirmPassword) {
      showFieldError("reset-confirm", "Passwords do not match.");
      valid = false;
    }
    if (!valid) return;

    setLoading("reset-submit", true);

    try {
      await apiCall("/reset-password", "POST", {
        email: pendingEmail,
        otp,
        newPassword,
      });

      showAlert("reset", "success", "Password updated successfully. Redirecting to sign in...");
      setTimeout(() => {
        showView("login");
        showAlert("login", "success", "Password reset complete. Sign in with your new password.");
      }, 2000);
    } catch (err) {
      if (err.code === "OTP_INVALID") {
        setOtpError("reset-otp-group");
      }
      showAlert("reset", "error", err.message);
    } finally {
      setLoading("reset-submit", false);
    }
  });

  document.getElementById("reset-resend-btn").addEventListener("click", async () => {
    try {
      document.getElementById("reset-resend-btn").disabled = true;
      await apiCall("/resend-otp", "POST", {
        email: pendingEmail,
        purpose: "PASSWORD_RESET",
      });
      showAlert("reset", "success", "A new code has been sent to your email.");
      clearOtpInputs("reset-otp-group");
      if (resetResendTimerId) clearInterval(resetResendTimerId);
      resetResendTimerId = startResendTimer("reset-resend-btn", "reset-resend-timer", OTP_RESEND_COOLDOWN);
    } catch (err) {
      showAlert("reset", "error", err.message);
      if (err.retryAfterSeconds) {
        if (resetResendTimerId) clearInterval(resetResendTimerId);
        resetResendTimerId = startResendTimer("reset-resend-btn", "reset-resend-timer", err.retryAfterSeconds);
      } else {
        document.getElementById("reset-resend-btn").disabled = false;
      }
    }
  });

  async function handleLogout() {
    setLoading("dashboard-logout-btn", true);
    try {
      await apiCall("/logout", "POST");
    } catch (_) {
    }
    clearSession();
    showView("login");
    setLoading("dashboard-logout-btn", false);
  }

  document.getElementById("logout-btn").addEventListener("click", handleLogout);
  document.getElementById("dashboard-logout-btn").addEventListener("click", handleLogout);

  function init() {
    setupPasswordToggles();
    setupOtpInputs("otp-group");
    setupOtpInputs("reset-otp-group");
    updatePasswordStrength("signup-password", "signup-strength-bar", "signup-strength-text", "signup-strength");
    updatePasswordStrength("reset-password", "reset-strength-bar", "reset-strength-text", "reset-strength");

    tryRestoreSession();
  }

  async function tryRestoreSession() {
    try {
      const data = await apiCall("/refresh-token", "POST");
      if (data.data?.accessToken) {
        accessToken = data.data.accessToken;
        const meData = await apiCall("/me", "GET");
        if (meData.data?.user) {
          showDashboard(meData.data.user);
          return;
        }
      }
    } catch (_) {
    }
    showView("signup");
  }

  init();
})();