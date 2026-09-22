const loginForm = document.getElementById("login-form");
const loginMessage = document.getElementById("login-message");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const passwordToggle = document.getElementById("password-toggle");
const forgotPasswordTrigger = document.getElementById("forgot-password-trigger");
const forgotPasswordModal = document.getElementById("forgot-password-modal");
const closeForgotPasswordModalButton = document.getElementById("close-forgot-password-modal");
const cancelForgotPasswordModalButton = document.getElementById("cancel-forgot-password-modal");
const forgotPasswordRequestForm = document.getElementById("forgot-password-request-form");
const forgotPasswordResetForm = document.getElementById("forgot-password-reset-form");
const forgotPasswordEmailInput = document.getElementById("forgot-password-email");
const forgotPasswordCodeInput = document.getElementById("forgot-password-code");
const forgotPasswordNewPasswordInput = document.getElementById("forgot-password-new-password");
const forgotPasswordConfirmPasswordInput = document.getElementById(
  "forgot-password-confirm-password"
);
const resetCodePanel = document.getElementById("reset-code-panel");
const resetCodeValue = document.getElementById("reset-code-value");
const resetCodeExpiry = document.getElementById("reset-code-expiry");
const forgotPasswordMessage = document.getElementById("forgot-password-message");
const loginPageParams = new URLSearchParams(window.location.search);

function setForgotPasswordMessage(message, tone = "") {
  if (!forgotPasswordMessage) {
    return;
  }

  forgotPasswordMessage.classList.remove("is-success", "is-error");
  forgotPasswordMessage.textContent = message;

  if (tone) {
    forgotPasswordMessage.classList.add(tone);
  }
}

function openForgotPasswordModal() {
  if (!forgotPasswordModal) {
    return;
  }

  forgotPasswordModal.hidden = false;
  forgotPasswordEmailInput.value = emailInput?.value.trim() || "";
  forgotPasswordCodeInput.value = "";
  forgotPasswordNewPasswordInput.value = "";
  forgotPasswordConfirmPasswordInput.value = "";
  if (resetCodePanel) {
    resetCodePanel.hidden = true;
  }
  if (resetCodeValue) {
    resetCodeValue.textContent = "------";
  }
  if (resetCodeExpiry) {
    resetCodeExpiry.textContent = "This code expires soon.";
  }
  setForgotPasswordMessage(
    "Enter your account email to receive a reset code.",
    ""
  );
  forgotPasswordEmailInput?.focus();
}

function closeForgotPasswordModal() {
  if (!forgotPasswordModal) {
    return;
  }

  forgotPasswordModal.hidden = true;
  forgotPasswordRequestForm?.reset();
  forgotPasswordResetForm?.reset();
  if (resetCodePanel) {
    resetCodePanel.hidden = true;
  }
  if (resetCodeValue) {
    resetCodeValue.textContent = "------";
  }
  if (resetCodeExpiry) {
    resetCodeExpiry.textContent = "This code expires soon.";
  }
  setForgotPasswordMessage("");
}

if (passwordInput && passwordToggle) {
  passwordToggle.addEventListener("click", () => {
    const isHidden = passwordInput.type === "password";
    passwordInput.type = isHidden ? "text" : "password";
    passwordToggle.textContent = isHidden ? "Hide" : "Show";
  });
}

if (loginForm && loginMessage && emailInput && passwordInput) {
  if (loginPageParams.get("session") === "expired") {
    loginMessage.classList.remove("is-success");
    loginMessage.classList.add("is-error");
    loginMessage.textContent = "Your session expired. Please sign in again.";
  }

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    loginMessage.classList.remove("is-success", "is-error");
    loginMessage.textContent = "Signing in...";

    try {
      const result = await window.ChopHouseApi.login(email, password);
      const role = String(result.user.role || "staff").toLowerCase();
      const userEmail = result.user.email || email;
      const redirect = role === "admin" ? "admin.html" : "staff.html";

      loginMessage.textContent = `Welcome ${userEmail}. Redirecting to the ${role} dashboard...`;
      loginMessage.classList.add("is-success");

      window.setTimeout(() => {
        window.location.href = redirect;
      }, 700);
    } catch (error) {
      loginMessage.textContent =
        error.message ||
        "Invalid email or password. Please check your staff or admin account details and try again.";
      loginMessage.classList.add("is-error");
    }
  });
}

forgotPasswordTrigger?.addEventListener("click", openForgotPasswordModal);
closeForgotPasswordModalButton?.addEventListener("click", closeForgotPasswordModal);
cancelForgotPasswordModalButton?.addEventListener("click", closeForgotPasswordModal);

forgotPasswordModal?.addEventListener("click", (event) => {
  if (event.target === forgotPasswordModal) {
    closeForgotPasswordModal();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && forgotPasswordModal && !forgotPasswordModal.hidden) {
    closeForgotPasswordModal();
  }
});

forgotPasswordRequestForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = forgotPasswordEmailInput?.value.trim() || "";
  setForgotPasswordMessage("Sending reset code...");

  try {
    const result = await window.ChopHouseApi.requestPasswordReset(email);

    if (result.resetCode) {
      if (resetCodePanel) {
        resetCodePanel.hidden = false;
      }
      if (resetCodeValue) {
        resetCodeValue.textContent = result.resetCode;
      }
      if (resetCodeExpiry && result.expiresAt) {
        resetCodeExpiry.textContent = `Use this code before ${new Date(
          result.expiresAt
        ).toLocaleString()}.`;
      }
      if (forgotPasswordCodeInput) {
        forgotPasswordCodeInput.value = result.resetCode;
      }
    } else if (resetCodePanel) {
      resetCodePanel.hidden = true;
    }

    setForgotPasswordMessage(
      result.message || "Reset code sent. Continue with the password update step below.",
      "is-success"
    );
    forgotPasswordCodeInput?.focus();
  } catch (error) {
    setForgotPasswordMessage(
      error.message || "Unable to send a reset code right now.",
      "is-error"
    );
  }
});

forgotPasswordResetForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = forgotPasswordEmailInput?.value.trim() || "";
  const resetCode = forgotPasswordCodeInput?.value.trim() || "";
  const newPassword = forgotPasswordNewPasswordInput?.value || "";
  const confirmPassword = forgotPasswordConfirmPasswordInput?.value || "";

  if (newPassword !== confirmPassword) {
    setForgotPasswordMessage("The new password and confirmation do not match.", "is-error");
    return;
  }

  setForgotPasswordMessage("Updating password...");

  try {
    const result = await window.ChopHouseApi.resetPassword({
      email,
      resetCode,
      newPassword,
    });

    setForgotPasswordMessage(
      result.message || "Password updated. You can now sign in with the new password.",
      "is-success"
    );

    if (emailInput) {
      emailInput.value = email;
    }
    if (passwordInput) {
      passwordInput.value = newPassword;
    }

    window.setTimeout(() => {
      closeForgotPasswordModal();
      passwordInput?.focus();
    }, 900);
  } catch (error) {
    setForgotPasswordMessage(
      error.message || "Unable to update the password right now.",
      "is-error"
    );
  }
});
