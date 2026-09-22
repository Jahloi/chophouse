(function () {
  function normalizeBasePath(pathname) {
    if (!pathname || pathname === "/") {
      return "";
    }

    return pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  }

  function getScriptBaseUrl() {
    const currentScript = document.currentScript;

    if (!currentScript || !currentScript.src) {
      return "";
    }

    return normalizeBasePath(new URL(".", currentScript.src).pathname);
  }

  function getCurrentAppBaseUrl() {
    const pathname = window.location.pathname || "/";
    const normalizedPath = normalizeBasePath(pathname);

    if (!normalizedPath) {
      return "";
    }

    const lastSegment = normalizedPath.split("/").pop() || "";

    if (!lastSegment.includes(".")) {
      return normalizedPath;
    }

    const lastSlashIndex = normalizedPath.lastIndexOf("/");

    if (lastSlashIndex <= 0) {
      return "";
    }

    return normalizedPath.slice(0, lastSlashIndex);
  }

  const DEFAULT_API_BASE_URL = getScriptBaseUrl() || getCurrentAppBaseUrl();

  function getAuthToken() {
    return window.sessionStorage.getItem("portalAuthToken") || "";
  }

  function setSession(session) {
    if (!session) {
      window.sessionStorage.removeItem("portalAuthToken");
      window.sessionStorage.removeItem("portalUserEmail");
      window.sessionStorage.removeItem("portalUserRole");
      return;
    }

    window.sessionStorage.setItem("portalAuthToken", session.token);
    window.sessionStorage.setItem("portalUserEmail", session.email);
    window.sessionStorage.setItem("portalUserRole", session.role);
  }

  function normalizeLoginResult(result) {
    const payload =
      result && typeof result === "object" && result.data && typeof result.data === "object"
        ? result.data
        : result;

    const user =
      payload && typeof payload === "object" && payload.user && typeof payload.user === "object"
        ? payload.user
        : {
            id: payload && typeof payload === "object" ? payload.id : undefined,
            name: payload && typeof payload === "object" ? payload.name : "",
            email: payload && typeof payload === "object" ? payload.email : "",
            role: payload && typeof payload === "object" ? payload.role : "",
          };

    const normalized = {
      token:
        payload && typeof payload === "object" && typeof payload.token === "string"
          ? payload.token
          : "",
      user: {
        id: typeof user.id === "number" ? user.id : undefined,
        name: typeof user.name === "string" ? user.name : "",
        email: typeof user.email === "string" ? user.email : "",
        role: typeof user.role === "string" ? user.role : "",
      },
    };

    if (!normalized.token || !normalized.user.email || !normalized.user.role) {
      throw new Error("Login failed because the server returned an invalid session response.");
    }

    return normalized;
  }

  function isSessionError(statusCode, message) {
    if (statusCode !== 401) {
      return false;
    }

    const normalizedMessage = String(message || "").toLowerCase();
    return (
      normalizedMessage.includes("invalid or expired token") ||
      normalizedMessage.includes("authentication required")
    );
  }

  function redirectToLoginWithSessionMessage() {
    setSession(null);

    const currentPath = window.location.pathname || "";
    if (currentPath.toLowerCase().endsWith("/login.html") || currentPath.toLowerCase() === "login.html") {
      return;
    }

    const loginUrl = new URL("login.html", window.location.href);
    loginUrl.searchParams.set("session", "expired");
    window.location.href = loginUrl.toString();
  }

  async function request(path, options = {}) {
    const requestUrl = `${DEFAULT_API_BASE_URL}${path}`;
    const headers = new Headers(options.headers || {});

    if (!headers.has("Content-Type") && options.body && !(options.body instanceof FormData)) {
      headers.set("Content-Type", "application/json");
    }

    const token = getAuthToken();
    if (token && !headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${token}`);
    }

    let response;

    try {
      if (window.location.protocol === "file:") {
        throw new Error(
          "Open this page through the deployed site or a local web server instead of opening the HTML file directly."
        );
      }

      response = await fetch(requestUrl, {
        ...options,
        headers,
      });
    } catch (error) {
      if (error instanceof Error && error.message) {
        throw error;
      }

      throw new Error(
        `Unable to reach the server at ${requestUrl}. Check that the site API and database are running.`
      );
    }

    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json")
      ? await response.json()
      : await response.text();

    if (!response.ok) {
      const fallbackMessage = `Request failed with status ${response.status}.`;
      const errorMessage =
        typeof payload === "object" && payload && payload.error ? payload.error : fallbackMessage;
      if (isSessionError(response.status, errorMessage)) {
        redirectToLoginWithSessionMessage();
      }
      const error = new Error(
        errorMessage
      );
      error.statusCode = response.status;
      error.payload = payload;
      throw error;
    }

    return typeof payload === "object" && payload && "data" in payload ? payload.data : payload;
  }

  window.ChopHouseApi = {
    baseUrl: DEFAULT_API_BASE_URL,
    clearSession() {
      setSession(null);
    },
    async login(email, password) {
      const result = await request("/api/auth/login.php", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      const normalizedResult = normalizeLoginResult(result);

      setSession({
        token: normalizedResult.token,
        email: normalizedResult.user.email,
        role: String(normalizedResult.user.role || "").toLowerCase(),
      });

      return normalizedResult;
    },
    async requestPasswordReset(email) {
      return request("/api/auth/request-password-reset.php", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
    },
    async resetPassword(payload) {
      return request("/api/auth/reset-password.php", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    async listVenues() {
      return request("/api/venues/");
    },
    async listAccounts() {
      return request("/api/accounts/");
    },
    async deactivateAccount(id) {
      return request(`/api/accounts/?id=${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "deactivate" }),
      });
    },
    async updateAccountStatus(id, action) {
      return request(`/api/accounts/?id=${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({ action }),
      });
    },
    async createVenue(payload) {
      return request("/api/venues/", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    async updateVenue(id, payload) {
      return request(`/api/venues/?id=${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
    },
    async deleteVenue(id) {
      return request(`/api/venues/?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
    },
    async listReservations() {
      return request("/api/reservations/");
    },
    async listPublicReservations() {
      return request("/api/reservations/public.php");
    },
    async listReservationLogs() {
      return request("/api/reservations/logs.php");
    },
    async downloadReservationExport(format) {
      const normalizedFormat = format === "pdf" ? "pdf" : "csv";
      const response = await fetch(
        `${DEFAULT_API_BASE_URL}/api/reservations/export.php?format=${encodeURIComponent(
          normalizedFormat
        )}`,
        {
          headers: {
            Authorization: `Bearer ${getAuthToken()}`,
          },
        }
      );

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || "Reservation export failed.");
      }

      const blob = await response.blob();
      const contentDisposition = response.headers.get("content-disposition") || "";
      const fileNameMatch = /filename="([^"]+)"/.exec(contentDisposition);
      const fileName =
        fileNameMatch?.[1] || `chophouse-reservations.${normalizedFormat}`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      return fileName;
    },
    async getPaymentSettings() {
      return request("/api/payment-settings/");
    },
    async updateGcashQr(formData) {
      return request("/api/payment-settings/", {
        method: "POST",
        body: formData,
      });
    },
    async createReservation(payload) {
      if (payload instanceof FormData) {
        return request("/api/reservations/", {
          method: "POST",
          body: payload,
        });
      }

      return request("/api/reservations/", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    async updateReservation(id, payload) {
      return request(`/api/reservations/?id=${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
    },
    async updateReservationStatus(id, status) {
      return request(`/api/reservations/status.php?id=${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
    },
    async updateDownpaymentStatus(id, downpaymentStatus, remarks = "") {
      return request(`/api/reservations/payment-status.php?id=${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({ downpaymentStatus, remarks }),
      });
    },
    async lookupReservationStatus(payload) {
      const params = new URLSearchParams();
      params.set("email", payload.email || "");
      if (payload.reservationId) {
        params.set("reservationId", payload.reservationId);
      }
      if (payload.reference) {
        params.set("reference", payload.reference);
      }

      return request(`/api/reservations/lookup.php?${params.toString()}`);
    },
    async getLiveStatus() {
      return request("/api/status/");
    },
    async updateLiveStatus(payload) {
      return request("/api/status/", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
  };
})();
