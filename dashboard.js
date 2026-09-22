const currentPageRole = document.body.dataset.rolePage;
const storedRole = sessionStorage.getItem("portalUserRole");
const storedEmail = sessionStorage.getItem("portalUserEmail");
const storedToken = sessionStorage.getItem("portalAuthToken");
const dashboardUser = document.getElementById("dashboard-user");
const logoutButton = document.getElementById("logout-button");
const inventoryStorageKey = "chophouseAdminInventory";
const reservationStorageKey = "chophouseReservations";
const liveStatusRefreshIntervalMs = 5000;
const reservationOpeningMinutes = 17 * 60;
let inventoryState = {
  table: [],
  room: [],
};
let reservationState = [];
let accountState = [];
let inventoryUiReload = null;
let inventoryLoadError = "";
let reservationLoadError = "";
let accountLoadError = "";

if (!storedRole || storedRole !== currentPageRole || !storedToken) {
  window.location.href = "login.html";
}

if (dashboardUser && storedEmail) {
  dashboardUser.textContent = storedEmail;
}

if (logoutButton) {
  logoutButton.addEventListener("click", () => {
    window.ChopHouseApi.clearSession();
    window.location.href = "login.html";
  });
}

function cloneInventory(source) {
  return JSON.parse(JSON.stringify(source));
}

function toDateInputValue(value) {
  return String(value || "").slice(0, 10);
}

function getTodayDateInputValue() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function capitalize(value) {
  const normalizedValue = String(value || "").trim();
  if (!normalizedValue) {
    return "";
  }

  return normalizedValue.charAt(0).toUpperCase() + normalizedValue.slice(1);
}

function normalizeVenueStatus(status) {
  return ["available", "occupied", "reserved", "standby", "maintenance"].includes(status)
    ? status
    : "available";
}

function formatCapacityLabel(minimum, maximum) {
  const min = Number.isFinite(minimum) ? minimum : null;
  const max = Number.isFinite(maximum) ? maximum : null;

  if (min && max && min !== max) {
    return `${min}-${max} people`;
  }

  if (min && max) {
    return `${min} people`;
  }

  if (min) {
    return `${min}+ people`;
  }

  if (max) {
    return `Up to ${max} people`;
  }

  return "Capacity not set";
}

function parseCapacityInput(value) {
  const numbers = String(value || "")
    .match(/\d+/g)
    ?.map((item) => Number(item))
    .filter((item) => Number.isFinite(item) && item > 0) || [];

  if (!numbers.length) {
    return {
      capacityMin: null,
      capacityMax: null,
    };
  }

  if (numbers.length === 1) {
    return {
      capacityMin: numbers[0],
      capacityMax: numbers[0],
    };
  }

  return {
    capacityMin: Math.min(...numbers),
    capacityMax: Math.max(...numbers),
  };
}

function mapVenueFromApi(venue) {
  return {
    id: venue.id,
    name: venue.name,
    capacity: formatCapacityLabel(venue.capacityMin, venue.capacityMax),
    notes: venue.notes || "",
    status: String(venue.status || "AVAILABLE").toLowerCase(),
    venueType: normalizeVenueType(venue.venueType),
    sensorId: venue.sensorId || null,
  };
}

function mapReservationFromApi(reservation) {
  const venueData = reservation.venue || {};
  const venueKind = normalizeVenueType(venueData.venueType || reservation.venueType);
  const scheduledTime = String(reservation.scheduledTime || reservation.time || "");
  const startTime = String(reservation.startTime || scheduledTime || "");
  const endTime = venueKind === "room" ? String(reservation.endTime || "") : "";

  return {
    id: String(reservation.id || ""),
    name: String(reservation.customerName || reservation.name || "").trim(),
    email: String(reservation.customerEmail || reservation.email || "").trim(),
    phone: String(reservation.customerPhone || reservation.phone || "").trim(),
    date: toDateInputValue(reservation.reservationDate || reservation.date),
    time: venueKind === "room" ? startTime : scheduledTime,
    startTime,
    endTime,
    guests: String(reservation.guestCount || reservation.guests || ""),
    venueType: venueKind,
    venueId: venueData.id || reservation.venueId || null,
    venueName: String(venueData.name || reservation.venueName || "").trim(),
    downpaymentAmount: reservation.downpaymentAmount ?? null,
    downpaymentMethod: String(reservation.downpaymentMethod || "").trim(),
    downpaymentReference: String(reservation.downpaymentReference || "").trim(),
    downpaymentReceiptPath: String(reservation.downpaymentReceiptPath || "").trim(),
    idVerificationPath: String(reservation.idVerificationPath || "").trim(),
    downpaymentStatus: String(reservation.downpaymentStatus || "").trim().toLowerCase(),
    status: normalizeReservationStatus(String(reservation.status || "").toLowerCase()),
    createdAt: reservation.createdAt || new Date().toISOString(),
    updatedAt: reservation.updatedAt || reservation.createdAt || new Date().toISOString(),
  };
}

function loadInventory() {
  return {
    table: cloneInventory(inventoryState.table),
    room: cloneInventory(inventoryState.room),
  };
}

async function refreshInventoryState() {
  try {
    const venues = await window.ChopHouseApi.listVenues();
    const mappedVenues = Array.isArray(venues) ? venues.map(mapVenueFromApi) : [];
    inventoryLoadError = "";
    inventoryState = {
      table: mappedVenues.filter((venue) => venue.venueType === "table"),
      room: mappedVenues.filter((venue) => venue.venueType === "room"),
    };
  } catch (error) {
    console.error("Inventory load failed:", error);
    inventoryLoadError = error instanceof Error ? error.message : "Inventory load failed.";
    inventoryState = {
      table: [],
      room: [],
    };
  }
}

function normalizeVenueType(value) {
  const normalizedValue = String(value || "").trim().toLowerCase();
  return normalizedValue === "room" || normalizedValue === "ktv" ? "room" : "table";
}

function formatVenueType(value) {
  return normalizeVenueType(value) === "room" ? "KTV Room" : "VIP Lounge";
}

function formatDownpayment(reservation) {
  const amount = Number(reservation.downpaymentAmount || 0);
  const status = String(reservation.downpaymentStatus || "unpaid").trim().toLowerCase();
  const method = String(reservation.downpaymentMethod || "").trim();
  const reference = String(reservation.downpaymentReference || "").trim();
  const hasReceipt = Boolean(reservation.downpaymentReceiptPath);
  const hasId = Boolean(reservation.idVerificationPath);

  if (!amount && !method && !reference && !hasReceipt && !hasId) {
    return "Downpayment: Not recorded";
  }

  const amountLabel = amount ? `PHP ${amount.toFixed(2)}` : "Amount not set";
  const methodLabel = method ? ` via ${method}` : "";
  const referenceLabel = reference ? `, Ref: ${reference}` : "";
  const fileLabel = [hasReceipt ? "receipt uploaded" : "", hasId ? "ID uploaded" : ""]
    .filter(Boolean)
    .join(", ");

  return `Downpayment: ${amountLabel}${methodLabel}${referenceLabel}${
    fileLabel ? `, ${fileLabel}` : ""
  } (${status || "pending"})`;
}

function normalizeDownpaymentStatus(status) {
  return ["pending", "verified", "rejected", "unpaid"].includes(status)
    ? status
    : "unpaid";
}

function formatDownpaymentStatus(status) {
  const normalizedStatus = normalizeDownpaymentStatus(String(status || "").toLowerCase());
  const labels = {
    pending: "Payment Pending Review",
    verified: "Payment Verified",
    rejected: "Payment Rejected",
    unpaid: "No Payment Yet",
  };

  return labels[normalizedStatus] || "No Payment Yet";
}

function createPaymentReviewActions(reservation) {
  const status = normalizeDownpaymentStatus(String(reservation.downpaymentStatus || "").toLowerCase());
  const hasPaymentFile = Boolean(reservation.downpaymentReceiptPath || reservation.idVerificationPath);

  if (!hasPaymentFile && status === "unpaid") {
    return "";
  }

  return `
    <div class="payment-review">
      <span class="payment-review__label">${escapeHtml(formatDownpaymentStatus(status))}</span>
      <div class="payment-review__actions">
        <button
          class="button button--inline button--approve"
          type="button"
          data-action="verify-payment"
          data-reservation-id="${escapeHtml(reservation.id)}"
          ${status === "verified" ? "disabled" : ""}
        >
          ${status === "verified" ? "Verified" : "Verify Payment"}
        </button>
        <button
          class="button button--inline button--danger-soft"
          type="button"
          data-action="reject-payment"
          data-reservation-id="${escapeHtml(reservation.id)}"
          ${status === "rejected" ? "disabled" : ""}
        >
          ${status === "rejected" ? "Rejected" : "Reject Payment"}
        </button>
      </div>
    </div>
  `;
}

function createVerificationLinks(reservation) {
  const links = [];
  if (reservation.downpaymentReceiptPath) {
    links.push(
      `<a href="${escapeHtml(reservation.downpaymentReceiptPath)}" target="_blank" rel="noopener">Receipt</a>`
    );
  }
  if (reservation.idVerificationPath) {
    links.push(
      `<a href="${escapeHtml(reservation.idVerificationPath)}" target="_blank" rel="noopener">ID</a>`
    );
  }

  return links.length ? links.join(" | ") : "No files uploaded";
}

function isPreviewableUpload(path) {
  return /\.(jpe?g|png|webp|gif|svg)(\?.*)?$/i.test(String(path || ""));
}

function createVerificationTile(label, path) {
  const safeLabel = escapeHtml(label);
  const safePath = escapeHtml(path || "");

  if (!path) {
    return `
      <article class="verification-tile verification-tile--empty">
        <div class="verification-tile__frame">
          <span>No file</span>
        </div>
        <div class="verification-tile__body">
          <strong>${safeLabel}</strong>
          <span>Not uploaded</span>
        </div>
      </article>
    `;
  }

  const preview = isPreviewableUpload(path)
    ? `<img src="${safePath}" alt="${safeLabel} upload preview" loading="lazy" />`
    : `<span class="verification-tile__file">PDF</span>`;

  return `
    <article class="verification-tile">
      <a class="verification-tile__frame" href="${safePath}" target="_blank" rel="noopener">
        ${preview}
      </a>
      <div class="verification-tile__body">
        <strong>${safeLabel}</strong>
        <a href="${safePath}" target="_blank" rel="noopener">Open file</a>
      </div>
    </article>
  `;
}

function createVerificationReviewMarkup(reservation) {
  const receiptUploaded = Boolean(reservation.downpaymentReceiptPath);
  const idUploaded = Boolean(reservation.idVerificationPath);
  const uploadCount = [receiptUploaded, idUploaded].filter(Boolean).length;
  const uploadSummary =
    uploadCount === 0
      ? "No uploaded files"
      : `${uploadCount} uploaded file${uploadCount === 1 ? "" : "s"}`;

  return `
    <section class="reservation-upload-storage" aria-label="Uploaded verification files">
      <div class="reservation-upload-storage__bar">
        <div>
          <span>Uploaded Files</span>
          <strong>${escapeHtml(uploadSummary)}</strong>
        </div>
        <button
          class="button button--inline button--ghost reservation-upload-toggle"
          type="button"
          data-action="toggle-uploads"
          aria-expanded="false"
        >
          Show Uploads
        </button>
      </div>
      <div class="reservation-verification" hidden>
        ${createVerificationTile("GCash Receipt", reservation.downpaymentReceiptPath)}
        ${createVerificationTile("Customer ID", reservation.idVerificationPath)}
      </div>
    </section>
  `;
}

function normalizeReservationStatus(status) {
  const normalizedStatus = String(status || "").trim().toLowerCase();
  return ["pending", "approved", "cancelled", "checked_in", "checked_out", "late", "no_show"].includes(
    normalizedStatus
  )
    ? normalizedStatus
    : "pending";
}

function formatReservationStatus(status) {
  const labels = {
    pending: "Pending",
    approved: "Approved",
    cancelled: "Cancelled",
    checked_in: "Checked In",
    checked_out: "Checked Out",
    late: "Late",
    no_show: "No Show",
  };

  return labels[normalizeReservationStatus(status)] || "Pending";
}

function isActiveReservationStatus(status) {
  return ["approved", "late", "checked_in"].includes(normalizeReservationStatus(status));
}

function isClosedReservationStatus(status) {
  return ["cancelled", "checked_out", "no_show"].includes(normalizeReservationStatus(status));
}

function parseTimeValue(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(String(value || ""));
  if (!match) {
    return Number.NaN;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    return Number.NaN;
  }

  return hours * 60 + minutes;
}

function toOperationalMinutes(value) {
  const minutes = parseTimeValue(value);
  if (Number.isNaN(minutes)) {
    return Number.NaN;
  }

  return minutes < reservationOpeningMinutes ? minutes + 24 * 60 : minutes;
}

function formatTimeLabel(value) {
  const totalMinutes = toOperationalMinutes(value);
  if (Number.isNaN(totalMinutes)) {
    return String(value || "");
  }

  const normalizedMinutes = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const hours = Math.floor(normalizedMinutes / 60);
  const minutes = normalizedMinutes % 60;
  const suffix = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 || 12;
  return `${hour12}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

function createReservationDateTime(date, time) {
  if (!date || !time) {
    return Number.NaN;
  }

  const baseDate = new Date(`${date}T12:00:00`);
  const minutes = toOperationalMinutes(time);
  if (Number.isNaN(baseDate.getTime()) || Number.isNaN(minutes)) {
    return Number.NaN;
  }

  const result = new Date(baseDate);
  result.setHours(0, 0, 0, 0);
  if (minutes >= 24 * 60) {
    result.setDate(result.getDate() + 1);
  }
  result.setMinutes(minutes % (24 * 60));
  return result.getTime();
}

function isRoomVenue(value) {
  return normalizeVenueType(value) === "room";
}

function isValidTimeRange(startValue, endValue) {
  const startMinutes = toOperationalMinutes(startValue);
  const endMinutes = toOperationalMinutes(endValue);

  return (
    !Number.isNaN(startMinutes) &&
    !Number.isNaN(endMinutes) &&
    endMinutes > startMinutes
  );
}

function getReservationStartTime(reservation) {
  return String(reservation.startTime || reservation.time || "");
}

function getReservationEndTime(reservation) {
  return isRoomVenue(reservation.venueType) ? String(reservation.endTime || "") : "";
}

function loadReservations() {
  return reservationState.map((reservation) => ({ ...reservation }));
}

function loadAccounts() {
  return accountState.map((account) => ({ ...account }));
}

async function refreshAccountState() {
  if (currentPageRole !== "admin" || typeof window.ChopHouseApi.listAccounts !== "function") {
    return;
  }

  try {
    const accounts = await window.ChopHouseApi.listAccounts();
    accountLoadError = "";
    accountState = Array.isArray(accounts) ? accounts : [];
  } catch (error) {
    console.error("Account load failed:", error);
    accountLoadError = error instanceof Error ? error.message : "Account load failed.";
    accountState = [];
  }
}

async function loadAdminPaymentSettings() {
  const preview = document.getElementById("admin-gcash-qr-preview");
  const message = document.getElementById("payment-settings-message");

  if (!preview || typeof window.ChopHouseApi.getPaymentSettings !== "function") {
    return;
  }

  try {
    const settings = await window.ChopHouseApi.getPaymentSettings();
    if (settings?.gcashQrPath) {
      preview.src = `${settings.gcashQrPath}?v=${encodeURIComponent(settings.updatedAt || "")}`;
    }
    if (message) {
      message.classList.remove("is-error");
      message.classList.add("is-success");
      message.textContent = "Current GCash QR is loaded.";
    }
  } catch (error) {
    if (message) {
      message.classList.remove("is-success");
      message.classList.add("is-error");
      message.textContent = error.message || "GCash QR could not be loaded.";
    }
  }
}

function initializePaymentSettingsManager() {
  if (currentPageRole !== "admin") {
    return;
  }

  const form = document.getElementById("payment-settings-form");
  const fileField = document.getElementById("admin-gcash-qr-file");
  const message = document.getElementById("payment-settings-message");

  if (!form || !fileField || !message) {
    return;
  }

  loadAdminPaymentSettings();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const file = fileField.files?.[0] || null;
    if (!file) {
      message.classList.remove("is-success");
      message.classList.add("is-error");
      message.textContent = "Choose a GCash QR image to upload.";
      return;
    }

    const formData = new FormData();
    formData.append("gcashQr", file);
    message.classList.remove("is-success", "is-error");
    message.textContent = "Uploading GCash QR...";

    try {
      const settings = await window.ChopHouseApi.updateGcashQr(formData);
      const preview = document.getElementById("admin-gcash-qr-preview");
      if (preview && settings?.gcashQrPath) {
        preview.src = `${settings.gcashQrPath}?v=${Date.now()}`;
      }
      form.reset();
      message.classList.add("is-success");
      message.textContent = "GCash QR updated successfully.";
    } catch (error) {
      message.classList.add("is-error");
      message.textContent = error.message || "GCash QR upload failed.";
    }
  });
}

function getApprovedReservationVenueIds() {
  return loadReservations()
    .filter((reservation) => isActiveReservationStatus(reservation.status))
    .map((reservation) => reservation.venueId)
    .filter(Boolean);
}

function getApprovedReservationForVenue(venueId) {
  const approvedReservations = sortReservations(
    loadReservations().filter(
      (reservation) =>
        isActiveReservationStatus(reservation.status) &&
        String(reservation.venueId || "") === String(venueId)
    )
  );

  return approvedReservations[0] || null;
}

function getInventoryVenueById(venueId) {
  const inventory = loadInventory();
  return [...inventory.table, ...inventory.room].find(
    (venue) => String(venue.id || "") === String(venueId || "")
  ) || null;
}

function getOccupiedVenueConflictMessage(candidateReservation, existingReservation = null) {
  const targetVenue = getInventoryVenueById(candidateReservation.venueId);
  if (!targetVenue) {
    return "";
  }

  const venueStatus = normalizeVenueStatus(targetVenue.status);
  const isSameApprovedReservation =
    existingReservation &&
    isActiveReservationStatus(existingReservation.status) &&
    String(existingReservation.venueId || "") === String(candidateReservation.venueId || "");

  if (venueStatus !== "occupied" || isSameApprovedReservation) {
    return "";
  }

  return candidateReservation.venueType === "room"
    ? "That KTV room is already occupied and cannot accept another approved reservation yet."
    : "That VIP lounge is already occupied and cannot accept another approved reservation yet.";
}

async function refreshReservationState() {
  try {
    const reservations = await window.ChopHouseApi.listReservations();
    reservationLoadError = "";
    reservationState = Array.isArray(reservations) ? reservations.map(mapReservationFromApi) : [];
  } catch (error) {
    console.error("Reservation load failed:", error);
    reservationLoadError =
      error instanceof Error ? error.message : "Reservation load failed.";
    reservationState = [];
  }
}

function hasApprovedConflict(reservations, candidateReservation, ignoredReservationId = "") {
  const normalizedType = normalizeVenueType(candidateReservation.venueType);

  return reservations.some(
    (reservation) => {
      if (
        reservation.id === ignoredReservationId ||
        !isActiveReservationStatus(reservation.status) ||
        normalizeVenueType(reservation.venueType) !== normalizedType ||
        reservation.venueName !== candidateReservation.venueName ||
        reservation.date !== candidateReservation.date
      ) {
        return false;
      }

      if (normalizedType === "room") {
        const candidateStart = toOperationalMinutes(
          candidateReservation.startTime || candidateReservation.time || ""
        );
        const candidateEnd = toOperationalMinutes(candidateReservation.endTime || "");
        const reservationStart = toOperationalMinutes(getReservationStartTime(reservation));
        const reservationEnd = toOperationalMinutes(getReservationEndTime(reservation));

        if (
          Number.isNaN(candidateStart) ||
          Number.isNaN(candidateEnd) ||
          Number.isNaN(reservationStart) ||
          Number.isNaN(reservationEnd)
        ) {
          return getReservationStartTime(reservation) === (candidateReservation.startTime || "");
        }

        return candidateStart < reservationEnd && reservationStart < candidateEnd;
      }

      return true;
    }
  );
}

function getApprovedConflictMessage(candidateReservation) {
  return normalizeVenueType(candidateReservation.venueType) === "room"
    ? "That KTV room already has an active reservation in the selected time range."
    : "That VIP lounge already has an active reservation for the selected date.";
}

function formatReservationDate(date, startTime, endTime = "", venueType = "table") {
  if (!date) {
    return "Schedule not set";
  }

  const dateValue = new Date(`${date}T12:00:00`);
  const dateLabel = Number.isNaN(dateValue.getTime())
    ? date
    : dateValue.toLocaleDateString([], {
        month: "short",
        day: "numeric",
        year: "numeric",
      });

  if (!startTime) {
    return dateLabel;
  }

  if (isRoomVenue(venueType) && endTime) {
    return `${dateLabel} | ${formatTimeLabel(startTime)} - ${formatTimeLabel(endTime)}`;
  }

  return `${dateLabel} | ${formatTimeLabel(startTime)}`;
}

function formatAuditTimestamp(value) {
  const timestamp = new Date(value || "");
  if (Number.isNaN(timestamp.getTime())) {
    return "Not available";
  }

  return timestamp.toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function sortReservations(reservations) {
  const rank = {
    pending: 0,
    approved: 1,
    late: 2,
    checked_in: 3,
    checked_out: 4,
    no_show: 5,
    cancelled: 6,
  };

  return [...reservations].sort((left, right) => {
    const statusGap = rank[left.status] - rank[right.status];
    if (statusGap !== 0) {
      return statusGap;
    }

    const leftTimestamp = createReservationDateTime(left.date, getReservationStartTime(left));
    const rightTimestamp = createReservationDateTime(right.date, getReservationStartTime(right));

    if (
      !Number.isNaN(leftTimestamp) &&
      !Number.isNaN(rightTimestamp) &&
      leftTimestamp !== rightTimestamp
    ) {
      return leftTimestamp - rightTimestamp;
    }

    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  });
}

function createInventoryMarkup(items, emptyLabel, options = {}) {
  if (!items.length) {
    return `<div class="inventory-empty">${emptyLabel}</div>`;
  }

  const allowControls = options.allowControls !== false;
  const allowSensorControls = options.allowSensorControls === true;

  return items
    .map((item) => {
      const normalizedStatus = normalizeVenueStatus(item.status);
      const approvedReservation = getApprovedReservationForVenue(item.id);
      const isConfirmedOccupied = normalizedStatus === "occupied";
      const statusLabel = isConfirmedOccupied
        ? "Occupied"
        : approvedReservation
          ? "Reserved"
          : capitalize(normalizedStatus);
      const statusTone = isConfirmedOccupied
        ? "occupied"
        : approvedReservation
          ? "reserved"
          : normalizedStatus;
      const reservationSchedule = approvedReservation
        ? formatReservationDate(
            approvedReservation.date,
            getReservationStartTime(approvedReservation),
            getReservationEndTime(approvedReservation),
            approvedReservation.venueType
          )
        : "";
      const statusOptions = [
        { value: "available", label: "Available" },
        { value: "occupied", label: "Occupied" },
        { value: "reserved", label: "Reserved" },
        { value: "standby", label: "Standby" },
        { value: "maintenance", label: "Maintenance" },
      ];

      return `
        <article class="inventory-item inventory-item--${statusTone}">
          <div class="inventory-item__top">
            <div>
              <h4>${escapeHtml(item.name)}</h4>
              <p>Capacity: ${escapeHtml(item.capacity)}</p>
            </div>
            <div class="inventory-item__status">
              <span class="reservation-status reservation-status--${statusTone}">
                ${escapeHtml(statusLabel)}
              </span>
              ${
                approvedReservation && !isConfirmedOccupied
                  ? `<small class="inventory-item__reservation-info">${escapeHtml(
                      reservationSchedule
                    )}</small>`
                  : ""
              }
            </div>
          </div>
          <small>${escapeHtml(item.notes || "No extra notes provided.")}</small>
          ${
            allowSensorControls
              ? `<small>Sensor ID: ${escapeHtml(item.sensorId || "Not linked")}</small>`
              : ""
          }
          ${
            allowControls
              ? `
                <div class="inventory-item__controls">
                  <select
                    class="inventory-item__select"
                    data-status-select
                    data-venue-id="${escapeHtml(item.id)}"
                  >
                    ${statusOptions
                      .map(
                        (option) => `
                          <option value="${option.value}" ${
                            option.value === normalizedStatus ? "selected" : ""
                          }>
                            ${option.label}
                          </option>
                        `
                      )
                      .join("")}
                  </select>
                  <button
                    class="button button--inline button--status-save"
                    type="button"
                    data-save-status
                    data-venue-id="${escapeHtml(item.id)}"
                  >
                    Save Status
                  </button>
                  ${
                    approvedReservation && !isConfirmedOccupied
                      ? `
                        <button
                          class="button button--approve button--inline inventory-item__confirm"
                          type="button"
                          data-confirm-occupied
                          data-venue-id="${escapeHtml(item.id)}"
                        >
                          Confirm Occupied
                        </button>
                      `
                      : ""
                  }
                  ${
                    allowSensorControls
                      ? `
                        <button
                          class="button button--ghost button--inline"
                          type="button"
                          data-add-sensor
                          data-venue-id="${escapeHtml(item.id)}"
                        >
                          Add Sensor
                        </button>
                      `
                      : ""
                  }
                </div>
              `
              : ""
          }
        </article>
      `
    })
    .join("");
}

function createAccountMarkup(accounts) {
  if (!accounts.length) {
    return `<div class="inventory-empty">No accounts were found in the system.</div>`;
  }

  const rows = accounts
    .map((account) => {
      const role = String(account.role || "").toUpperCase();
      const roleClass = role === "ADMIN" ? "admin" : "staff";
      const roleLabel = role === "ADMIN" ? "Admin" : "Staff";
      const displayName = account.name || "Unnamed account";
      const isActive = account.isActive !== false;
      const canToggleStatus = Boolean(account.canToggleStatus ?? account.canDeactivate);
      const createdLabel = formatAuditTimestamp(account.createdAt);
      const updatedLabel = formatAuditTimestamp(account.updatedAt);
      const accountAction = isActive ? "deactivate" : "activate";
      const actionLabel = canToggleStatus
        ? isActive
          ? "Deactivate"
          : "Activate"
        : "Current account";

      return `
        <tr class="accounts-table__row${isActive ? "" : " accounts-table__row--inactive"}">
          <td data-label="ID">${escapeHtml(account.id || "")}</td>
          <td data-label="Name">
            <strong class="accounts-table__name">${escapeHtml(displayName)}</strong>
          </td>
          <td data-label="Email">${escapeHtml(account.email || "No email set")}</td>
          <td data-label="Role">
            <span class="reservation-status reservation-status--${roleClass}">
              ${escapeHtml(roleLabel)}
            </span>
          </td>
          <td data-label="Status">
            <span class="accounts-table__status${isActive ? "" : " accounts-table__status--inactive"}">
              ${isActive ? "Active" : "Inactive"}
            </span>
          </td>
          <td data-label="Created">${escapeHtml(createdLabel)}</td>
          <td data-label="Updated">${escapeHtml(updatedLabel)}</td>
          <td data-label="Action">
            <button
              class="button ${isActive ? "button--danger" : "button--approve"} accounts-table__action"
              type="button"
              data-deactivate-account
              data-account-id="${escapeHtml(account.id || "")}"
              data-account-name="${escapeHtml(displayName)}"
              data-account-action="${escapeHtml(accountAction)}"
              ${canToggleStatus ? "" : "disabled"}
            >
              ${escapeHtml(actionLabel)}
            </button>
          </td>
        </tr>
      `;
    })
    .join("");

  return `
    <div class="accounts-table-wrap">
      <table class="accounts-table">
        <thead>
          <tr>
            <th scope="col">ID</th>
            <th scope="col">Name</th>
            <th scope="col">Email</th>
            <th scope="col">Role</th>
            <th scope="col">Status</th>
            <th scope="col">Created</th>
            <th scope="col">Updated</th>
            <th scope="col">Action</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
  `;
}

async function reloadInventoryUi() {
  if (typeof inventoryUiReload === "function") {
    await inventoryUiReload();
    return;
  }

  await refreshInventoryState();
}

function getLiveStatusDevicePayload(venue, nextStatus, networkMode = "dashboard-sync") {
  if (!venue?.sensorId) {
    return null;
  }

  const normalizedStatus = normalizeVenueStatus(nextStatus).toLowerCase();
  return {
    sensorId: venue.sensorId,
    venueId: Number(venue.id),
    venueName: venue.name,
    label: venue.name,
    location: venue.name,
    status: normalizedStatus,
    statusLabel: capitalize(normalizedStatus),
    sensorOnline: true,
    networkMode,
    ipAddress: "dashboard-sync",
    lastSeenMs: Date.now(),
  };
}

async function syncLiveStatusForVenue(venue, nextStatus, networkMode = "dashboard-sync") {
  const payload = getLiveStatusDevicePayload(venue, nextStatus, networkMode);
  if (!payload) {
    return null;
  }

  try {
    await window.ChopHouseApi.updateLiveStatus(payload);
    return null;
  } catch (error) {
    return error instanceof Error ? error : new Error("Live status sync failed.");
  }
}

async function syncVenueStatusesForReservations(venueIds = []) {
  const inventory = loadInventory();
  const targetIds = [...new Set(venueIds.map((id) => String(id || "")).filter(Boolean))];
  const allVenues = [...inventory.table, ...inventory.room];
  const venuesToSync = targetIds.length
    ? allVenues.filter((venue) => targetIds.includes(String(venue.id)))
    : allVenues;

  if (!venuesToSync.length) {
    await reloadInventoryUi();
    return;
  }

  const updates = venuesToSync
    .map(async (venue) => {
      const approvedReservation = getApprovedReservationForVenue(venue.id);
      const hasPendingDownpaymentReservation = loadReservations().some(
        (reservation) =>
          normalizeReservationStatus(reservation.status) === "pending" &&
          String(reservation.venueId || "") === String(venue.id || "") &&
          String(reservation.downpaymentStatus || "").trim().toLowerCase() === "pending"
      );
      const currentStatus = normalizeVenueStatus(venue.status);

      if (approvedReservation) {
        if (currentStatus === "available" || currentStatus === "standby") {
          const syncedStatus = approvedReservation.status === "checked_in" ? "OCCUPIED" : "RESERVED";
          await window.ChopHouseApi.updateVenue(venue.id, { status: syncedStatus });
          const liveStatusError = await syncLiveStatusForVenue(
            venue,
            syncedStatus.toLowerCase(),
            "reservation-sync"
          );

          if (liveStatusError) {
            console.error("Live status sync failed:", liveStatusError);
          }
        }

        return null;
      }

      if ((currentStatus === "standby" || currentStatus === "reserved") && !hasPendingDownpaymentReservation) {
        await window.ChopHouseApi.updateVenue(venue.id, { status: "AVAILABLE" });
        const liveStatusError = await syncLiveStatusForVenue(
          venue,
          "available",
          "reservation-sync"
        );

        if (liveStatusError) {
          console.error("Live status sync failed:", liveStatusError);
        }
      }

      return null;
    })
    .filter(Boolean);

  if (updates.length) {
    await Promise.all(updates);
  }

  await reloadInventoryUi();
}

function createReservationCardMarkup(reservation, context = "queue") {
  const safeId = escapeHtml(reservation.id);
  const safeName = escapeHtml(reservation.name || "Guest");
  const safeEmail = escapeHtml(reservation.email || "No email provided");
  const safePhone = escapeHtml(reservation.phone || "No phone provided");
  const safeVenueName = escapeHtml(reservation.venueName || "Venue not selected");
  const safeGuests = escapeHtml(reservation.guests || "0");
  const safeStatus = normalizeReservationStatus(reservation.status);
  const isApproved = safeStatus === "approved";
  const isPending = safeStatus === "pending";
  const isCheckedIn = safeStatus === "checked_in";
  const isClosed = isClosedReservationStatus(safeStatus);
  const isActiveStorage = context === "active-storage";
  const paymentMarkup = isActiveStorage ? "" : createPaymentReviewActions(reservation);
  const actionMarkup = isActiveStorage
    ? `
          <button
            class="button button--inline button--ghost"
            type="button"
            data-action="check-out"
            data-reservation-id="${safeId}"
            ${!isCheckedIn ? "disabled" : ""}
          >
            Check Out
          </button>
          <button
            class="button button--inline button--ghost"
            type="button"
            data-action="adjust"
            data-reservation-id="${safeId}"
          >
            Adjust
          </button>
          <button
            class="button button--inline button--danger-soft"
            type="button"
            data-action="cancel"
            data-reservation-id="${safeId}"
            ${isClosed ? "disabled" : ""}
          >
            ${safeStatus === "cancelled" ? "Cancelled" : "Cancel"}
          </button>
      `
    : `
          <button
            class="button button--inline button--approve"
            type="button"
            data-action="approve"
            data-reservation-id="${safeId}"
            ${!isPending ? "disabled" : ""}
          >
            ${isApproved ? "Approved" : "Approve"}
          </button>
          <button
            class="button button--inline button--ghost"
            type="button"
            data-action="late"
            data-reservation-id="${safeId}"
            ${isPending || isCheckedIn || isClosed ? "disabled" : ""}
          >
            Mark Late
          </button>
          <button
            class="button button--inline button--approve"
            type="button"
            data-action="check-in"
            data-reservation-id="${safeId}"
            ${isPending || isCheckedIn || isClosed ? "disabled" : ""}
          >
            ${isCheckedIn ? "Checked In" : "Check In"}
          </button>
          <button
            class="button button--inline button--ghost"
            type="button"
            data-action="check-out"
            data-reservation-id="${safeId}"
            ${!isCheckedIn ? "disabled" : ""}
          >
            Check Out
          </button>
          <button
            class="button button--inline button--danger-soft"
            type="button"
            data-action="no-show"
            data-reservation-id="${safeId}"
            ${isPending || isCheckedIn || isClosed ? "disabled" : ""}
          >
            No Show
          </button>
          <button
            class="button button--inline button--ghost"
            type="button"
            data-action="adjust"
            data-reservation-id="${safeId}"
          >
            Adjust
          </button>
          <button
            class="button button--inline button--danger-soft"
            type="button"
            data-action="cancel"
            data-reservation-id="${safeId}"
            ${isClosed ? "disabled" : ""}
          >
            ${safeStatus === "cancelled" ? "Cancelled" : "Cancel"}
          </button>
      `;

  return `
    <article class="reservation-item" data-status="${safeStatus}">
      <div class="reservation-item__top">
        <div>
          <p class="reservation-item__eyebrow">${formatVenueType(reservation.venueType)}</p>
          <h3>${safeName}</h3>
        </div>
        <span class="reservation-status reservation-status--${safeStatus}">
          ${escapeHtml(formatReservationStatus(safeStatus))}
        </span>
      </div>

      <div class="reservation-item__meta">
        <span>${safeVenueName}</span>
        <span>${escapeHtml(
          formatReservationDate(
            reservation.date,
            getReservationStartTime(reservation),
            getReservationEndTime(reservation),
            reservation.venueType
          )
        )}</span>
        <span>${safeGuests} guest${reservation.guests === "1" ? "" : "s"}</span>
        <span>${escapeHtml(formatDownpayment(reservation))}</span>
      </div>

      <div class="reservation-item__contact">
        <span>${safeEmail}</span>
        <span>${safePhone}</span>
      </div>

      ${createVerificationReviewMarkup(reservation)}
      ${paymentMarkup}

      <div class="reservation-item__actions${isActiveStorage ? " reservation-item__actions--compact" : ""}">
        ${actionMarkup}
      </div>
    </article>
  `;
}

function createReservationGroupMarkup(title, eyebrow, itemsMarkup, count, modifier = "") {
  return `
    <section class="reservation-group${modifier ? ` ${modifier}` : ""}">
      <div class="reservation-group__header">
        <div>
          <p class="reservation-group__eyebrow">${escapeHtml(eyebrow)}</p>
          <h3>${escapeHtml(title)}</h3>
        </div>
        <span class="reservation-group__count">${escapeHtml(String(count))}</span>
      </div>
      ${itemsMarkup}
    </section>
  `;
}

function createActiveReservationStorageMarkup(approvedReservations) {
  return `
    <section class="reservation-storage-card">
      <div>
        <p class="reservation-group__eyebrow">Reserved and in-service bookings</p>
        <h3>Approved Schedule</h3>
        <p>${escapeHtml(approvedReservations.length)} active booking${approvedReservations.length === 1 ? "" : "s"} stored here.</p>
      </div>
      <button
        class="button button--ghost button--inline"
        type="button"
        data-action="open-active-reservations"
      >
        Open Storage
      </button>
    </section>
  `;
}

function createPendingReservationSummaryMarkup(pendingReservations) {
  return `
    <div class="pending-reservation-grid">
      ${pendingReservations
        .map((reservation, index) => {
          const safeId = escapeHtml(reservation.id);
          const safeName = escapeHtml(reservation.name || "Guest");

          return `
            <button
              class="pending-reservation-tile"
              type="button"
              data-action="open-pending-reservation"
              data-reservation-id="${safeId}"
            >
              <span>${escapeHtml(String(index + 1))}</span>
              <strong>${safeName}</strong>
            </button>
          `;
        })
        .join("")}
    </div>
  `;
}

function createActiveReservationsMarkup(approvedReservations) {
  if (!approvedReservations.length) {
    return `
      <div class="booking-empty">
        No approved or in-service reservations yet.
      </div>
    `;
  }

  return Object.entries(
    approvedReservations.reduce((groups, reservation) => {
      const key = reservation.date || "No date set";
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(reservation);
      return groups;
    }, {})
  )
    .map(([dateKey, items]) => {
      const dateValue = new Date(`${dateKey}T12:00:00`);
      const dateLabel = Number.isNaN(dateValue.getTime())
        ? dateKey
        : dateValue.toLocaleDateString([], {
            month: "long",
            day: "numeric",
            year: "numeric",
          });

      return `
        <section class="reservation-date-group">
          <div class="reservation-date-group__header">
            <div>
              <h4>${escapeHtml(dateLabel)}</h4>
              <p>Stored active bookings with checkout, adjust, and cancel controls.</p>
            </div>
            <span class="reservation-date-group__count">${escapeHtml(String(items.length))}</span>
          </div>
          <div class="reservation-group__list">
            ${items.map((reservation) => createReservationCardMarkup(reservation, "active-storage")).join("")}
          </div>
        </section>
      `;
    })
    .join("");
}

function createReservationMarkup(reservations) {
  const pendingReservations = sortReservations(
    reservations.filter((reservation) => normalizeReservationStatus(reservation.status) === "pending")
  );
  const approvedReservations = sortReservations(
    reservations.filter((reservation) => isActiveReservationStatus(reservation.status))
  );

  if (!pendingReservations.length && !approvedReservations.length) {
    return `
      <div class="booking-empty">
        No reservations yet. New VIP lounge and room requests from the website will show up here.
      </div>
    `;
  }

  const pendingMarkup = pendingReservations.length
    ? createPendingReservationSummaryMarkup(pendingReservations)
    : `
      <div class="booking-empty">
        No pending reservation requests at the moment.
      </div>
    `;

  return [
    createReservationGroupMarkup(
      "Pending Requests",
      "Awaiting approval",
      pendingMarkup,
      pendingReservations.length
    ),
    createActiveReservationStorageMarkup(approvedReservations),
  ].join("");
}

function createReservationCalendarMarkup(reservations, selectedDate) {
  const datedReservations = sortReservations(
    reservations.filter(
      (reservation) =>
        reservation.date === selectedDate &&
        !isClosedReservationStatus(reservation.status)
    )
  );

  if (!datedReservations.length) {
    return {
      summary: "No open bookings are scheduled for the selected date.",
      markup: `
        <div class="booking-empty">
          No pending or active bookings for this selected date. Future active bookings are still stored below.
        </div>
      `,
    };
  }

  const approvedCount = datedReservations.filter(
    (reservation) => reservation.status === "approved"
  ).length;
  const pendingCount = datedReservations.filter(
    (reservation) => reservation.status === "pending"
  ).length;
  const operationsCount = datedReservations.filter((reservation) =>
    ["late", "checked_in"].includes(normalizeReservationStatus(reservation.status))
  ).length;

  const markup = datedReservations
    .map((reservation) => {
      const status = normalizeReservationStatus(reservation.status);
      const schedule = formatReservationDate(
        reservation.date,
        getReservationStartTime(reservation),
        getReservationEndTime(reservation),
        reservation.venueType
      );

      return `
        <article class="calendar-reservation calendar-reservation--${status}">
          <div class="calendar-reservation__time">
            ${escapeHtml(
              isRoomVenue(reservation.venueType) && getReservationEndTime(reservation)
                ? `${formatTimeLabel(getReservationStartTime(reservation))} - ${formatTimeLabel(
                    getReservationEndTime(reservation)
                  )}`
                : formatTimeLabel(getReservationStartTime(reservation))
            )}
          </div>
          <div class="calendar-reservation__body">
            <div>
              <strong>${escapeHtml(reservation.venueName || "Venue not selected")}</strong>
              <span>${escapeHtml(reservation.name || "Guest")} | ${escapeHtml(
                reservation.guests || "0"
              )} guest${reservation.guests === "1" ? "" : "s"}</span>
            </div>
            <span class="reservation-status reservation-status--${status}">
              ${escapeHtml(formatReservationStatus(status))}
            </span>
          </div>
          <small>${escapeHtml(schedule)} | ${escapeHtml(formatDownpaymentStatus(reservation.downpaymentStatus))}</small>
        </article>
      `;
    })
    .join("");

  return {
    summary: `${datedReservations.length} open booking${
      datedReservations.length === 1 ? "" : "s"
    }: ${approvedCount} approved, ${pendingCount} pending, ${operationsCount} in operations.`,
    markup,
  };
}

function formatLogAction(actionType) {
  const normalizedAction = String(actionType || "").trim().toLowerCase();
  const labels = {
    created: "Created",
    adjusted: "Adjusted",
    approved: "Approved",
    cancelled: "Cancelled",
    checked_in: "Checked In",
    checked_out: "Checked Out",
    late: "Marked Late",
    no_show: "No Show",
    payment_verified: "Payment Verified",
    payment_rejected: "Payment Rejected",
    payment_pending: "Payment Pending",
    payment_unpaid: "Payment Unpaid",
    status_changed: "Status Changed",
  };

  return labels[normalizedAction] || capitalize(normalizedAction.replaceAll("_", " "));
}

function createReservationLogsMarkup(logData) {
  const reservations = Array.isArray(logData?.reservations)
    ? logData.reservations.map(mapReservationFromApi)
    : [];
  const activityLogs = Array.isArray(logData?.activityLogs) ? logData.activityLogs : [];

  const reservationRows = reservations.length
    ? reservations
        .map((reservation) => {
          const safeSchedule = escapeHtml(
            formatReservationDate(
              reservation.date,
              getReservationStartTime(reservation),
              getReservationEndTime(reservation),
              reservation.venueType
            )
          );

          return `
            <tr>
              <td>${escapeHtml(reservation.id || "")}</td>
              <td>${escapeHtml(reservation.name || "Guest")}</td>
              <td>${escapeHtml(formatVenueType(reservation.venueType))}</td>
              <td>${escapeHtml(reservation.venueName || "Venue not selected")}</td>
              <td>${safeSchedule}</td>
              <td>${escapeHtml(reservation.guests || "0")}</td>
              <td>${escapeHtml(formatDownpayment(reservation))}</td>
              <td>${createVerificationLinks(reservation)}</td>
              <td>${escapeHtml(formatReservationStatus(reservation.status))}</td>
              <td>${escapeHtml(formatAuditTimestamp(reservation.createdAt))}</td>
              <td>${escapeHtml(formatAuditTimestamp(reservation.updatedAt))}</td>
            </tr>
          `;
        })
        .join("")
    : `
      <tr>
        <td colspan="11">No reservation records were found.</td>
      </tr>
    `;

  const activityRows = activityLogs.length
    ? activityLogs
        .map((log) => {
          const actor = log.changedByName || log.changedByEmail || "Public request";
          const statusText =
            log.oldStatus || log.newStatus
              ? `${log.oldStatus || "None"} -> ${log.newStatus || "None"}`
              : "Not applicable";

          return `
            <tr>
              <td>${escapeHtml(formatAuditTimestamp(log.changedAt))}</td>
              <td>${escapeHtml(formatLogAction(log.actionType))}</td>
              <td>${escapeHtml(log.customerName || "Guest")}</td>
              <td>${escapeHtml(formatVenueType(log.venueType))}</td>
              <td>${escapeHtml(log.venueName || "Venue not selected")}</td>
              <td>${escapeHtml(statusText)}</td>
              <td>${escapeHtml(actor)}</td>
              <td>${escapeHtml(log.details || "")}</td>
            </tr>
          `;
        })
        .join("")
    : `
      <tr>
        <td colspan="8">No activity logs were found yet.</td>
      </tr>
    `;

  return `
    <section class="log-section">
      <h3>Reservation Records</h3>
      <table class="archive-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Customer</th>
            <th>Type</th>
            <th>VIP Lounge / Room</th>
            <th>Schedule</th>
            <th>Guests</th>
            <th>Downpayment</th>
            <th>Files</th>
            <th>Status</th>
            <th>Created</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>${reservationRows}</tbody>
      </table>
    </section>

    <section class="log-section">
      <h3>Activity History</h3>
      <table class="archive-table">
        <thead>
          <tr>
            <th>Time</th>
            <th>Action</th>
            <th>Customer</th>
            <th>Type</th>
            <th>VIP Lounge / Room</th>
            <th>Status</th>
            <th>Logged By</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>${activityRows}</tbody>
      </table>
    </section>
  `;
}

function initializeAdminInventory() {
  if (currentPageRole !== "admin" && currentPageRole !== "staff") {
    return;
  }

  const inventoryActionsModal = document.getElementById("inventory-actions-modal");
  const openInventoryActionsModalButton = document.getElementById(
    "open-inventory-actions-modal"
  );
  const closeInventoryActionsModalButton = document.getElementById(
    "close-inventory-actions-modal"
  );
  const inventoryActionEditButton = document.getElementById("inventory-action-edit");
  const inventoryActionAddButton = document.getElementById("inventory-action-add");
  const inventoryActionDeleteButton = document.getElementById("inventory-action-delete");
  const inventoryModal = document.getElementById("inventory-modal");
  const closeInventoryModalButton = document.getElementById("close-inventory-modal");
  const cancelInventoryModalButton = document.getElementById("cancel-inventory-modal");
  const editModal = document.getElementById("edit-modal");
  const closeEditModalButton = document.getElementById("close-edit-modal");
  const cancelEditModalButton = document.getElementById("cancel-edit-modal");
  const editForm = document.getElementById("edit-form");
  const editTypeField = document.getElementById("edit-type");
  const editItemField = document.getElementById("edit-item");
  const editNameField = document.getElementById("edit-name");
  const editCapacityField = document.getElementById("edit-capacity");
  const editNotesField = document.getElementById("edit-notes");
  const editFormMessage = document.getElementById("edit-form-message");
  const deleteModal = document.getElementById("delete-modal");
  const closeDeleteModalButton = document.getElementById("close-delete-modal");
  const cancelDeleteModalButton = document.getElementById("cancel-delete-modal");
  const deleteForm = document.getElementById("delete-form");
  const deleteTypeField = document.getElementById("delete-type");
  const deleteItemField = document.getElementById("delete-item");
  const sensorModal = document.getElementById("sensor-modal");
  const closeSensorModalButton = document.getElementById("close-sensor-modal");
  const cancelSensorModalButton = document.getElementById("cancel-sensor-modal");
  const sensorForm = document.getElementById("sensor-form");
  const sensorVenueIdField = document.getElementById("sensor-venue-id");
  const sensorVenueNameField = document.getElementById("sensor-venue-name");
  const sensorIdField = document.getElementById("sensor-id");
  const sensorLabelField = document.getElementById("sensor-label");
  const sensorLocationField = document.getElementById("sensor-location");
  const sensorFormMessage = document.getElementById("sensor-form-message");
  const inventoryForm = document.getElementById("inventory-form");
  const typeField = document.getElementById("inventory-type");
  const nameField = document.getElementById("inventory-name");
  const capacityField = document.getElementById("inventory-capacity");
  const notesField = document.getElementById("inventory-notes");
  const inventoryMessage = document.getElementById("inventory-message");
  const tableList = document.getElementById("table-list");
  const roomList = document.getElementById("room-list");
  const tableCount = document.getElementById("table-count");
  const roomCount = document.getElementById("room-count");
  const accountsMessage = document.getElementById("accounts-message");
  const accountsList = document.getElementById("accounts-list");
  const accountCount = document.getElementById("account-count");
  const canManageInventory = currentPageRole === "admin";
  const canManageVenueStatus = currentPageRole === "admin" || currentPageRole === "staff";

  if (
    !inventoryMessage ||
    !tableList ||
    !roomList ||
    !tableCount ||
    !roomCount
  ) {
    return;
  }

  if (
    canManageInventory &&
    (!inventoryActionsModal ||
      !openInventoryActionsModalButton ||
      !closeInventoryActionsModalButton ||
      !inventoryActionEditButton ||
      !inventoryActionAddButton ||
      !inventoryActionDeleteButton ||
      !inventoryModal ||
      !closeInventoryModalButton ||
      !cancelInventoryModalButton ||
      !editModal ||
      !closeEditModalButton ||
      !cancelEditModalButton ||
      !editForm ||
      !editTypeField ||
      !editItemField ||
      !editNameField ||
      !editCapacityField ||
      !editNotesField ||
      !editFormMessage ||
      !deleteModal ||
      !closeDeleteModalButton ||
      !cancelDeleteModalButton ||
      !deleteForm ||
      !deleteTypeField ||
      !deleteItemField ||
      !sensorModal ||
      !closeSensorModalButton ||
      !cancelSensorModalButton ||
      !sensorForm ||
      !sensorVenueIdField ||
      !sensorVenueNameField ||
      !sensorIdField ||
      !sensorLabelField ||
      !sensorLocationField ||
      !sensorFormMessage ||
      !inventoryForm ||
      !typeField ||
      !nameField ||
      !capacityField ||
      !notesField)
  ) {
    return;
  }

  let inventory = loadInventory();

  function setInventoryMessage(message, tone = "") {
    inventoryMessage.classList.remove("is-success", "is-error");
    inventoryMessage.textContent = message;
    if (tone) {
      inventoryMessage.classList.add(tone);
    }
  }

  function setEditFormMessage(message, tone = "") {
    editFormMessage.classList.remove("is-success", "is-error");
    editFormMessage.textContent = message;
    if (tone) {
      editFormMessage.classList.add(tone);
    }
  }

  function getInventoryItemsByType(type) {
    return type === "room" ? inventory.room : inventory.table;
  }

  function findInventoryItemById(type, itemId) {
    return getInventoryItemsByType(type).find((item) => String(item.id) === String(itemId)) || null;
  }

  function openInventoryActionsModal() {
    inventoryActionsModal.hidden = false;
    inventoryActionEditButton.focus();
  }

  function closeInventoryActionsModal() {
    inventoryActionsModal.hidden = true;
  }

  function openInventoryModal() {
    inventoryForm.reset();
    inventoryModal.hidden = false;
    typeField.value = "table";
    nameField.focus();
  }

  function closeInventoryModal() {
    inventoryModal.hidden = true;
    inventoryForm.reset();
  }

  function populateDeleteItems() {
    const selectedType = deleteTypeField.value;
    const items = getInventoryItemsByType(selectedType);

    deleteItemField.innerHTML = '<option value="">Choose a VIP lounge or room</option>';

    items.forEach((item) => {
      const option = document.createElement("option");
      option.value = item.name;
      option.textContent = item.name;
      deleteItemField.appendChild(option);
    });
  }

  function populateEditItems() {
    const selectedType = editTypeField.value;
    const items = getInventoryItemsByType(selectedType);
    const placeholder = items.length
      ? "Choose a VIP lounge or room"
      : `No ${selectedType === "room" ? "KTV rooms" : "VIP lounges"} available`;

    editItemField.innerHTML = `<option value="">${placeholder}</option>`;

    items.forEach((item) => {
      const option = document.createElement("option");
      option.value = String(item.id);
      option.textContent = item.name;
      editItemField.appendChild(option);
    });

    if (items.length) {
      editItemField.value = String(items[0].id);
      populateEditFields();
      return;
    }

    editNameField.value = "";
    editCapacityField.value = "";
    editNotesField.value = "";
  }

  function populateEditFields() {
    const selectedType = editTypeField.value;
    const selectedItem = findInventoryItemById(selectedType, editItemField.value);

    if (!selectedItem) {
      editNameField.value = "";
      editCapacityField.value = "";
      editNotesField.value = "";
      return;
    }

    editNameField.value = selectedItem.name || "";
    editCapacityField.value = selectedItem.capacity || "";
    editNotesField.value = selectedItem.notes || "";
  }

  function openDeleteModal() {
    populateDeleteItems();
    deleteModal.hidden = false;
    deleteTypeField.focus();
  }

  function closeDeleteModal() {
    deleteModal.hidden = true;
    deleteForm.reset();
    populateDeleteItems();
  }

  function setSensorFormMessage(message, tone = "") {
    sensorFormMessage.classList.remove("is-success", "is-error");
    sensorFormMessage.textContent = message;

    if (tone) {
      sensorFormMessage.classList.add(tone);
    }
  }

  function openSensorModal(venueId) {
    const selectedVenue = [...inventory.table, ...inventory.room].find(
      (item) => String(item.id || "") === String(venueId || "")
    );

    if (!selectedVenue?.id) {
      setInventoryMessage("Choose a VIP lounge or room before adding a sensor.", "is-error");
      return;
    }

    sensorForm.reset();
    sensorVenueIdField.value = String(selectedVenue.id);
    sensorVenueNameField.value = selectedVenue.name;
    sensorIdField.value = "";
    sensorLabelField.value = `${selectedVenue.name} Sensor`;
    sensorLocationField.value = selectedVenue.name;
    setSensorFormMessage("Enter the Sensor ID printed on the device or configured in the ESP32 sketch.");
    sensorModal.hidden = false;
    sensorIdField.focus();
  }

  function closeSensorModal() {
    sensorModal.hidden = true;
    sensorForm.reset();
    setSensorFormMessage("Enter the Sensor ID that will report occupancy for this venue.");
  }

  function openEditModal() {
    editForm.reset();
    editTypeField.value = "table";
    setEditFormMessage("Update the VIP lounge or room details before saving your changes.");
    populateEditItems();
    editModal.hidden = false;
    editTypeField.focus();
  }

  function closeEditModal() {
    editModal.hidden = true;
    editForm.reset();
    setEditFormMessage("Update the VIP lounge or room details before saving your changes.");
  }

  function renderInventory() {
    tableList.innerHTML = createInventoryMarkup(
      inventory.table,
      "No VIP lounges have been added yet.",
      { allowControls: canManageVenueStatus, allowSensorControls: canManageInventory }
    );
    roomList.innerHTML = createInventoryMarkup(
      inventory.room,
      "No KTV rooms have been added yet.",
      { allowControls: canManageVenueStatus, allowSensorControls: canManageInventory }
    );
    tableCount.textContent = String(inventory.table.length);
    roomCount.textContent = String(inventory.room.length);
    if (canManageInventory) {
      populateDeleteItems();
      populateEditItems();
    }

    if (inventoryLoadError) {
      setInventoryMessage(
        `Inventory is currently unavailable from the database: ${inventoryLoadError}`,
        "is-error"
      );
    }
  }

  function renderAccounts() {
    if (!accountsList || !accountCount || !accountsMessage) {
      return;
    }

    const accounts = loadAccounts();
    accountsList.innerHTML = createAccountMarkup(accounts);
    accountCount.textContent = String(accounts.length);
    accountsMessage.classList.remove("is-success", "is-error");
    accountsMessage.textContent = accounts.length
      ? `${accounts.length} account${accounts.length === 1 ? "" : "s"} found in the system.`
      : "Account records appear here for review.";

    if (accountLoadError) {
      accountsMessage.textContent =
        `Accounts are currently unavailable from the database: ${accountLoadError}`;
      accountsMessage.classList.add("is-error");
    }
  }

  function setAccountsMessage(message, tone = "") {
    if (!accountsMessage) {
      return;
    }

    accountsMessage.classList.remove("is-success", "is-error");
    accountsMessage.textContent = message;
    if (tone) {
      accountsMessage.classList.add(tone);
    }
  }

  async function reloadInventory() {
    await refreshInventoryState();
    inventory = loadInventory();
    renderInventory();
  }

  async function reloadAccounts() {
    if (currentPageRole !== "admin") {
      return;
    }

    await refreshAccountState();
    renderAccounts();
  }

  async function handleAccountStatusToggle(event) {
    const statusButton = event.target.closest("[data-deactivate-account]");
    if (!statusButton || statusButton.disabled) {
      return;
    }

    const accountId = statusButton.dataset.accountId || "";
    const accountName = statusButton.dataset.accountName || "this account";
    const accountAction = statusButton.dataset.accountAction === "activate"
      ? "activate"
      : "deactivate";
    const actionLabel = accountAction === "activate" ? "Activate" : "Deactivate";
    const actionProgressLabel = accountAction === "activate" ? "Activating..." : "Deactivating...";

    if (!accountId) {
      setAccountsMessage("That account could not be identified.", "is-error");
      return;
    }

    const shouldUpdate = window.confirm(
      accountAction === "activate"
        ? `Activate ${accountName}? This account will be able to log in again.`
        : `Deactivate ${accountName}? This account will no longer be able to log in.`
    );

    if (!shouldUpdate) {
      return;
    }

    statusButton.disabled = true;
    statusButton.textContent = actionProgressLabel;

    try {
      await window.ChopHouseApi.updateAccountStatus(accountId, accountAction);
      await reloadAccounts();
      setAccountsMessage(
        `${accountName} was ${accountAction === "activate" ? "activated" : "deactivated"} successfully.`,
        "is-success"
      );
    } catch (error) {
      statusButton.disabled = false;
      statusButton.textContent = actionLabel;
      setAccountsMessage(error.message || "Account status update failed.", "is-error");
    }
  }

  async function deleteInventoryItem(type, itemName) {
    const listKey = type === "room" ? "room" : "table";
    const itemToDelete = inventory[listKey].find((item) => item.name === itemName);
    if (!itemToDelete?.id) {
      throw new Error("That venue could not be found in the backend.");
    }

    await window.ChopHouseApi.deleteVenue(itemToDelete.id);
    await reloadInventory();

    setInventoryMessage(`${itemName} was removed from the ${listKey} inventory.`, "is-success");
  }

  async function saveInventoryStatus(venueId, nextStatus) {
    const selectedVenue = [...inventory.table, ...inventory.room].find(
      (item) => String(item.id) === String(venueId)
    );

    if (!selectedVenue?.id) {
      throw new Error("That venue could not be found in the backend.");
    }

    await window.ChopHouseApi.updateVenue(selectedVenue.id, {
      status: String(nextStatus || "").toUpperCase(),
    });
    const liveStatusError = await syncLiveStatusForVenue(
      selectedVenue,
      nextStatus,
      currentPageRole === "staff" ? "staff-manual" : "admin-manual"
    );
    await reloadInventory();

    if (liveStatusError) {
      throw new Error(
        `${selectedVenue.name} status was updated, but the main-site live room sync failed: ${
          liveStatusError.message || "Unknown error."
        }`
      );
    }

    setInventoryMessage(
      nextStatus === "occupied"
        ? `${selectedVenue.name} is now marked as occupied.`
        : `${selectedVenue.name} is now ${capitalize(nextStatus)}.`,
      "is-success"
    );
  }

  function handleInventoryStatusSave(event) {
    const sensorButton = event.target.closest("[data-add-sensor]");
    if (sensorButton) {
      openSensorModal(sensorButton.dataset.venueId || "");
      return;
    }

    const confirmButton = event.target.closest("[data-confirm-occupied]");
    if (confirmButton) {
      const venueId = confirmButton.dataset.venueId || "";
      const selectedVenue = [...inventory.table, ...inventory.room].find(
        (item) => String(item.id) === String(venueId)
      );
      const approvedReservation = selectedVenue
        ? getApprovedReservationForVenue(selectedVenue.id)
        : null;

      if (!selectedVenue?.id || !approvedReservation) {
        setInventoryMessage("There is no approved reservation to confirm.", "is-error");
        return;
      }

      const shouldConfirm = window.confirm(
        `Confirm ${selectedVenue.name} is now occupied for ${approvedReservation.name}?\n${formatReservationDate(
          approvedReservation.date,
          getReservationStartTime(approvedReservation),
          getReservationEndTime(approvedReservation),
          approvedReservation.venueType
        )}`
      );

      if (!shouldConfirm) {
        return;
      }

      saveInventoryStatus(venueId, "occupied")
        .then(() => {
          setInventoryMessage(`${selectedVenue.name} was confirmed as occupied.`, "is-success");
        })
        .catch((error) => {
          setInventoryMessage(error.message || "Confirmation failed.", "is-error");
        });
      return;
    }

    const statusButton = event.target.closest("[data-save-status]");
    if (!statusButton) {
      return;
    }

    const venueId = statusButton.dataset.venueId || "";
    const parentCard = statusButton.closest(".inventory-item");
    const statusSelect = parentCard?.querySelector("[data-status-select]");
    const nextStatus = statusSelect?.value || "";

    if (!venueId || !nextStatus) {
      setInventoryMessage("Choose a status first before saving.", "is-error");
      return;
    }

    saveInventoryStatus(venueId, nextStatus).catch((error) => {
      setInventoryMessage(error.message || "Status update failed.", "is-error");
    });
  }

  if (canManageVenueStatus) {
    tableList.addEventListener("click", handleInventoryStatusSave);
    roomList.addEventListener("click", handleInventoryStatusSave);
  }

  if (canManageInventory) {
    openInventoryActionsModalButton.addEventListener("click", openInventoryActionsModal);
    closeInventoryActionsModalButton.addEventListener("click", closeInventoryActionsModal);
    inventoryActionEditButton.addEventListener("click", () => {
      closeInventoryActionsModal();
      openEditModal();
    });
    inventoryActionAddButton.addEventListener("click", () => {
      closeInventoryActionsModal();
      openInventoryModal();
    });
    inventoryActionDeleteButton.addEventListener("click", () => {
      closeInventoryActionsModal();
      openDeleteModal();
    });
    closeInventoryModalButton.addEventListener("click", closeInventoryModal);
    cancelInventoryModalButton.addEventListener("click", closeInventoryModal);
    closeEditModalButton.addEventListener("click", closeEditModal);
    cancelEditModalButton.addEventListener("click", closeEditModal);
    closeDeleteModalButton.addEventListener("click", closeDeleteModal);
    cancelDeleteModalButton.addEventListener("click", closeDeleteModal);
    closeSensorModalButton.addEventListener("click", closeSensorModal);
    cancelSensorModalButton.addEventListener("click", closeSensorModal);
    deleteTypeField.addEventListener("change", populateDeleteItems);
    editTypeField.addEventListener("change", populateEditItems);
    editItemField.addEventListener("change", populateEditFields);
    inventoryActionsModal.addEventListener("click", (event) => {
      if (event.target === inventoryActionsModal) {
        closeInventoryActionsModal();
      }
    });

    inventoryModal.addEventListener("click", (event) => {
      if (event.target === inventoryModal) {
        closeInventoryModal();
      }
    });

    editModal.addEventListener("click", (event) => {
      if (event.target === editModal) {
        closeEditModal();
      }
    });

    deleteModal.addEventListener("click", (event) => {
      if (event.target === deleteModal) {
        closeDeleteModal();
      }
    });

    sensorModal.addEventListener("click", (event) => {
      if (event.target === sensorModal) {
        closeSensorModal();
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !inventoryActionsModal.hidden) {
        closeInventoryActionsModal();
      }
      if (event.key === "Escape" && !inventoryModal.hidden) {
        closeInventoryModal();
      }
      if (event.key === "Escape" && !editModal.hidden) {
        closeEditModal();
      }
      if (event.key === "Escape" && !deleteModal.hidden) {
        closeDeleteModal();
      }
      if (event.key === "Escape" && !sensorModal.hidden) {
        closeSensorModal();
      }
    });

    sensorForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      const venueId = sensorVenueIdField.value;
      const venueName = sensorVenueNameField.value.trim();
      const sensorId = sensorIdField.value.trim();
      const sensorLabel = sensorLabelField.value.trim();
      const sensorLocation = sensorLocationField.value.trim();

      if (!venueId || !venueName || !sensorId || !sensorLabel || !sensorLocation) {
        setSensorFormMessage("Complete the Sensor ID, label, and location.", "is-error");
        return;
      }

      try {
        await window.ChopHouseApi.updateLiveStatus({
          sensorId,
          venueId: Number(venueId),
          venueName,
          label: sensorLabel,
          location: sensorLocation,
          status: "available",
          statusLabel: "Available",
          sensorOnline: false,
          networkMode: "registered",
          ipAddress: "0.0.0.0",
          lastSeenMs: 0,
        });

        await reloadInventory();
        closeSensorModal();
        setInventoryMessage(`${sensorLabel} was linked to ${venueName}.`, "is-success");
      } catch (error) {
        setSensorFormMessage(error.message || "Sensor registration failed.", "is-error");
      }
    });

    inventoryForm.addEventListener("submit", async (event) => {
      event.preventDefault();

    const selectedType = typeField.value;
    const trimmedName = nameField.value.trim();
    const trimmedCapacity = capacityField.value.trim();
    const trimmedNotes = notesField.value.trim();
    const targetList = selectedType === "room" ? inventory.room : inventory.table;
    const normalizedName = trimmedName.toLowerCase();

    inventoryMessage.classList.remove("is-success", "is-error");

    if (!trimmedName || !trimmedCapacity) {
      setInventoryMessage("Name and capacity are required.", "is-error");
      return;
    }

    const duplicateItem = targetList.some((item) => item.name.toLowerCase() === normalizedName);

    if (duplicateItem) {
      setInventoryMessage(`${trimmedName} already exists in the ${selectedType} list.`, "is-error");
      return;
    }

    try {
      const parsedCapacity = parseCapacityInput(trimmedCapacity);
      await window.ChopHouseApi.createVenue({
        name: trimmedName,
        venueType: selectedType === "room" ? "ROOM" : "VIP_LOUNGE",
        capacityMin: parsedCapacity.capacityMin,
        capacityMax: parsedCapacity.capacityMax,
        notes: trimmedNotes || null,
        status: "AVAILABLE",
      });

      await reloadInventory();
      inventoryForm.reset();

      setInventoryMessage(
        `${trimmedName} added successfully to the ${selectedType} inventory.`,
        "is-success"
      );
      closeInventoryModal();
    } catch (error) {
      setInventoryMessage(error.message || "Venue creation failed.", "is-error");
    }
    });

    editForm.addEventListener("submit", async (event) => {
      event.preventDefault();

    const selectedType = editTypeField.value;
    const selectedItem = findInventoryItemById(selectedType, editItemField.value);
    const trimmedName = editNameField.value.trim();
    const trimmedCapacity = editCapacityField.value.trim();
    const trimmedNotes = editNotesField.value.trim();
    const targetList = getInventoryItemsByType(selectedType);
    const normalizedName = trimmedName.toLowerCase();

    if (!selectedItem?.id) {
      setEditFormMessage("Choose an existing VIP lounge or room to edit first.", "is-error");
      return;
    }

    if (!trimmedName || !trimmedCapacity) {
      setEditFormMessage("Name and capacity are required.", "is-error");
      return;
    }

    const duplicateItem = targetList.some(
      (item) =>
        String(item.id) !== String(selectedItem.id) &&
        item.name.toLowerCase() === normalizedName
    );

    if (duplicateItem) {
      setEditFormMessage(`${trimmedName} already exists in the ${selectedType} list.`, "is-error");
      return;
    }

    try {
      const parsedCapacity = parseCapacityInput(trimmedCapacity);
      await window.ChopHouseApi.updateVenue(selectedItem.id, {
        name: trimmedName,
        capacityMin: parsedCapacity.capacityMin,
        capacityMax: parsedCapacity.capacityMax,
        notes: trimmedNotes || null,
      });

      await reloadInventory();
      closeEditModal();
      setInventoryMessage(`${trimmedName} was updated successfully.`, "is-success");
    } catch (error) {
      setEditFormMessage(error.message || "Item update failed.", "is-error");
    }
    });

    deleteForm.addEventListener("submit", async (event) => {
      event.preventDefault();

    const selectedType = deleteTypeField.value;
    const selectedItemName = deleteItemField.value;

    if (!selectedItemName) {
      setInventoryMessage("Choose an item to delete first.", "is-error");
      return;
    }

    try {
      await deleteInventoryItem(selectedType, selectedItemName);
      closeDeleteModal();
    } catch (error) {
      setInventoryMessage(error.message || "Item deletion failed.", "is-error");
    }
    });
  }

  accountsList?.addEventListener("click", handleAccountStatusToggle);

  inventoryUiReload = reloadInventory;
  reloadInventory();
  reloadAccounts();

  setInterval(async () => {
    if (document.hidden) {
      return;
    }

    await Promise.all([reloadInventory(), reloadAccounts()]);
  }, liveStatusRefreshIntervalMs);
}

function createStatusManagerMarkup(item) {
  const safeStatus = normalizeVenueStatus(item.status);
  const safeName = escapeHtml(item.name);
  const safeCapacity = escapeHtml(item.capacity || "Capacity not set");
  const safeNotes = escapeHtml(item.notes || "No extra notes provided.");
  const safeId = escapeHtml(item.id);
  const statusOptions = [
    { value: "available", label: "Available" },
    { value: "occupied", label: "Occupied" },
    { value: "reserved", label: "Reserved" },
    { value: "standby", label: "Standby" },
    { value: "maintenance", label: "Maintenance" },
  ];

  return `
    <article class="status-manager-card" data-venue-id="${safeId}">
      <div class="status-manager-card__top">
        <div>
          <h4>${safeName}</h4>
          <p class="status-manager-card__meta">Capacity: ${safeCapacity}</p>
        </div>
        <span class="reservation-status reservation-status--${safeStatus}">
          ${escapeHtml(capitalize(safeStatus))}
        </span>
      </div>
      <p class="status-manager-card__meta">${safeNotes}</p>
      <div class="status-manager-card__controls">
        <select data-status-select>
          ${statusOptions
            .map(
              (option) => `
                <option value="${option.value}" ${option.value === safeStatus ? "selected" : ""}>
                  ${option.label}
                </option>
              `
            )
            .join("")}
        </select>
        <button class="button button--approve" type="button" data-save-status>
          Save Status
        </button>
      </div>
    </article>
  `;
}

function initializeReservationOperations() {
  const reservationList = document.getElementById("reservation-list");
  const bookingMessage = document.getElementById("booking-message");
  const reservationTotalCount = document.getElementById("reservation-total-count");
  const reservationPendingCount = document.getElementById("reservation-pending-count");
  const reservationApprovedCount = document.getElementById("reservation-approved-count");
  const reservationCancelledCount = document.getElementById("reservation-cancelled-count");
  const reservationCalendarDate = document.getElementById("reservation-calendar-date");
  const reservationCalendarSummary = document.getElementById("reservation-calendar-summary");
  const reservationCalendarList = document.getElementById("reservation-calendar-list");
  const pendingReservationModal = document.getElementById("pending-reservation-modal");
  const pendingReservationDetail = document.getElementById("pending-reservation-detail");
  const pendingReservationMessage = document.getElementById("pending-reservation-message");
  const closePendingReservationModalButton = document.getElementById("close-pending-reservation-modal");
  const cancelPendingReservationModalButton = document.getElementById("cancel-pending-reservation-modal");
  const activeReservationModal = document.getElementById("active-reservations-modal");
  const activeReservationList = document.getElementById("active-reservation-list");
  const activeReservationMessage = document.getElementById("active-reservations-message");
  const closeActiveReservationModalButton = document.getElementById("close-active-reservations-modal");
  const cancelActiveReservationModalButton = document.getElementById("cancel-active-reservations-modal");
  const archiveModal = document.getElementById("archive-modal");
  const openArchiveModalButton = document.getElementById("open-archive-modal");
  const exportReservationsCsvButton = document.getElementById("export-reservations-csv");
  const exportReservationsPdfButton = document.getElementById("export-reservations-pdf");
  const closeArchiveModalButton = document.getElementById("close-archive-modal");
  const cancelArchiveModalButton = document.getElementById("cancel-archive-modal");
  const archiveList = document.getElementById("archive-list");
  const archiveMessage = document.getElementById("archive-message");
  const reservationModal = document.getElementById("reservation-modal");
  const reservationModalEyebrow = document.getElementById("reservation-modal-eyebrow");
  const reservationModalTitle = document.getElementById("reservation-modal-title");
  const closeReservationModalButton = document.getElementById("close-reservation-modal");
  const cancelReservationModalButton = document.getElementById("cancel-reservation-modal");
  const reservationSaveButton = document.getElementById("reservation-save-button");
  const openNewReservationModalButton = document.getElementById("open-new-reservation-modal");
  const reservationAdjustForm = document.getElementById("reservation-adjust-form");
  const reservationNameField = document.getElementById("reservation-customer-name");
  const reservationEmailField = document.getElementById("reservation-customer-email");
  const reservationPhoneField = document.getElementById("reservation-customer-phone");
  const reservationGuestsField = document.getElementById("reservation-guests");
  const reservationDateField = document.getElementById("reservation-date");
  const reservationSingleTimeGroup = document.getElementById("reservation-single-time-group");
  const reservationTimeField = document.getElementById("reservation-time");
  const reservationStartTimeGroup = document.getElementById("reservation-start-time-group");
  const reservationStartTimeField = document.getElementById("reservation-start-time");
  const reservationEndTimeGroup = document.getElementById("reservation-end-time-group");
  const reservationEndTimeField = document.getElementById("reservation-end-time");
  const reservationVenueTypeField = document.getElementById("reservation-venue-type");
  const reservationVenueNameField = document.getElementById("reservation-venue-name");
  const reservationStatusField = document.getElementById("reservation-status-field");
  const reservationModalMessage = document.getElementById("reservation-modal-message");

  if (
    !reservationList ||
    !bookingMessage ||
    !reservationTotalCount ||
    !reservationPendingCount ||
    !reservationApprovedCount ||
    !reservationCancelledCount ||
    !reservationCalendarDate ||
    !reservationCalendarSummary ||
    !reservationCalendarList ||
    !pendingReservationModal ||
    !pendingReservationDetail ||
    !pendingReservationMessage ||
    !closePendingReservationModalButton ||
    !cancelPendingReservationModalButton ||
    !activeReservationModal ||
    !activeReservationList ||
    !activeReservationMessage ||
    !closeActiveReservationModalButton ||
    !cancelActiveReservationModalButton ||
    !archiveModal ||
    !openArchiveModalButton ||
    !closeArchiveModalButton ||
    !cancelArchiveModalButton ||
    !archiveList ||
    !archiveMessage ||
    !reservationModal ||
    !closeReservationModalButton ||
    !cancelReservationModalButton ||
    !reservationAdjustForm ||
    !reservationNameField ||
    !reservationEmailField ||
    !reservationPhoneField ||
    !reservationGuestsField ||
    !reservationDateField ||
    !reservationSingleTimeGroup ||
    !reservationTimeField ||
    !reservationStartTimeGroup ||
    !reservationStartTimeField ||
    !reservationEndTimeGroup ||
    !reservationEndTimeField ||
    !reservationVenueTypeField ||
    !reservationVenueNameField ||
    !reservationStatusField ||
    !reservationModalMessage
  ) {
    return;
  }

  let editingReservationId = "";
  let selectedPendingReservationId = "";

  reservationCalendarDate.value = getTodayDateInputValue();

  function setBookingMessage(message, tone = "") {
    bookingMessage.classList.remove("is-success", "is-error");
    bookingMessage.textContent = message;

    if (tone) {
      bookingMessage.classList.add(tone);
    }
  }

  function setReservationModalMessage(message, tone = "") {
    reservationModalMessage.classList.remove("is-success", "is-error");
    reservationModalMessage.textContent = message;

    if (tone) {
      reservationModalMessage.classList.add(tone);
    }
  }

  function setReservationModalContext(mode, reservationName = "") {
    if (reservationModalEyebrow) {
      reservationModalEyebrow.textContent =
        currentPageRole === "staff" ? "Staff Booking Desk" : "Booking Oversight";
    }

    if (reservationModalTitle) {
      reservationModalTitle.textContent =
        mode === "create"
          ? "Add manual reservation"
          : reservationName
            ? `Adjust ${reservationName}`
            : "Adjust reservation";
    }

    if (reservationSaveButton) {
      reservationSaveButton.textContent =
        mode === "create" ? "Save Reservation" : "Save Changes";
    }

    setReservationModalMessage(
      mode === "create"
        ? "Input the customer's desired reservation details, then save the booking."
        : "Update reservation details before saving your changes."
    );
  }

  function toggleReservationTimeFields(selectedType, reservation = null) {
    const useTimeRange = isRoomVenue(selectedType);

    reservationSingleTimeGroup.hidden = useTimeRange;
    reservationStartTimeGroup.hidden = !useTimeRange;
    reservationEndTimeGroup.hidden = !useTimeRange;
    reservationTimeField.required = !useTimeRange;
    reservationStartTimeField.required = useTimeRange;
    reservationEndTimeField.required = useTimeRange;

    if (reservation) {
      reservationTimeField.value = getReservationStartTime(reservation);
      reservationStartTimeField.value = getReservationStartTime(reservation);
      reservationEndTimeField.value = getReservationEndTime(reservation);
      return;
    }

    if (useTimeRange) {
      reservationTimeField.value = "";
      return;
    }

    reservationStartTimeField.value = "";
    reservationEndTimeField.value = "";
  }

  function renderReservations() {
    const reservations = loadReservations();
    const activeReservations = reservations.filter(
      (reservation) => !isClosedReservationStatus(reservation.status)
    );
    const storedActiveReservations = sortReservations(
      activeReservations.filter((reservation) => isActiveReservationStatus(reservation.status))
    );
    const archivedReservations = reservations.filter(
      (reservation) => isClosedReservationStatus(reservation.status)
    );

    reservationList.innerHTML = createReservationMarkup(activeReservations);
    activeReservationList.innerHTML = createActiveReservationsMarkup(storedActiveReservations);
    renderPendingReservationDetail();
    renderReservationCalendar(activeReservations);
    reservationTotalCount.textContent = String(activeReservations.length);
    reservationPendingCount.textContent = String(
      activeReservations.filter((reservation) => reservation.status === "pending").length
    );
    reservationApprovedCount.textContent = String(
      activeReservations.filter((reservation) => isActiveReservationStatus(reservation.status)).length
    );
    reservationCancelledCount.textContent = String(
      archivedReservations.length
    );
    archiveMessage.textContent = "Reservation records and activity history are stored here for review.";
    activeReservationMessage.textContent =
      storedActiveReservations.length === 0
        ? "No reserved or in-service bookings are stored right now."
        : `${storedActiveReservations.length} reserved or in-service booking${storedActiveReservations.length === 1 ? "" : "s"} stored here.`;

    if (reservationLoadError) {
      setBookingMessage(
        `Reservation data is currently unavailable from the database: ${reservationLoadError}`,
        "is-error"
      );
    }
  }

  function renderReservationCalendar(reservations = loadReservations()) {
    const selectedDate = reservationCalendarDate.value || getTodayDateInputValue();
    const calendar = createReservationCalendarMarkup(reservations, selectedDate);
    reservationCalendarSummary.textContent = calendar.summary;
    reservationCalendarList.innerHTML = calendar.markup;
  }

  async function openArchiveModal() {
    archiveModal.hidden = false;
    archiveMessage.classList.remove("is-success", "is-error");
    archiveMessage.textContent = "Loading reservation logs...";
    archiveList.innerHTML = "";
    closeArchiveModalButton.focus();

    try {
      const logData = await window.ChopHouseApi.listReservationLogs();
      const recordCount = Array.isArray(logData?.reservations) ? logData.reservations.length : 0;
      const activityCount = Array.isArray(logData?.activityLogs) ? logData.activityLogs.length : 0;
      archiveList.innerHTML = createReservationLogsMarkup(logData);
      archiveMessage.textContent =
        `${recordCount} reservation record${recordCount === 1 ? "" : "s"} and ${activityCount} activity log${activityCount === 1 ? "" : "s"} stored in the system.`;
      archiveMessage.classList.add("is-success");
    } catch (error) {
      archiveList.innerHTML = `
        <div class="booking-empty">
          Reservation logs could not be loaded.
        </div>
      `;
      archiveMessage.textContent = error.message || "Reservation logs could not be loaded.";
      archiveMessage.classList.add("is-error");
    }
  }

  function closeArchiveModal() {
    archiveModal.hidden = true;
  }

  function renderPendingReservationDetail() {
    if (!selectedPendingReservationId) {
      pendingReservationDetail.innerHTML = "";
      pendingReservationMessage.textContent = "Select a pending request to review its full details.";
      return;
    }

    const reservation = loadReservations().find(
      (item) =>
        item.id === selectedPendingReservationId &&
        normalizeReservationStatus(item.status) === "pending"
    );

    if (!reservation) {
      pendingReservationDetail.innerHTML = `
        <div class="booking-empty">
          This pending request is no longer in the queue.
        </div>
      `;
      pendingReservationMessage.textContent = "The selected request may have been approved, cancelled, or moved.";
      return;
    }

    pendingReservationDetail.innerHTML = createReservationCardMarkup(reservation, "pending-detail");
    pendingReservationMessage.textContent = `${reservation.name || "Guest"}'s pending reservation details.`;
  }

  function openPendingReservationModal(reservationId) {
    selectedPendingReservationId = reservationId;
    renderPendingReservationDetail();
    pendingReservationModal.hidden = false;
    closePendingReservationModalButton.focus();
  }

  function closePendingReservationModal() {
    pendingReservationModal.hidden = true;
    selectedPendingReservationId = "";
    pendingReservationDetail.innerHTML = "";
  }

  function openActiveReservationModal() {
    activeReservationModal.hidden = false;
    closeActiveReservationModalButton.focus();
  }

  function closeActiveReservationModal() {
    activeReservationModal.hidden = true;
  }

  async function downloadReservations(format) {
    if (typeof window.ChopHouseApi.downloadReservationExport !== "function") {
      setBookingMessage("Reservation export is not available.", "is-error");
      return;
    }

    setBookingMessage(`Preparing ${format.toUpperCase()} export...`);

    try {
      const fileName = await window.ChopHouseApi.downloadReservationExport(format);
      setBookingMessage(`${fileName} was downloaded.`, "is-success");
    } catch (error) {
      setBookingMessage(error.message || "Reservation export failed.", "is-error");
    }
  }

  function populateReservationVenueOptions(selectedType, selectedVenueName = "") {
    const inventory = loadInventory();
    const items = selectedType === "room" ? inventory.room : inventory.table;

    reservationVenueNameField.innerHTML = '<option value="">Choose a VIP lounge or room</option>';

    items.forEach((item) => {
      const option = document.createElement("option");
      option.value = item.name;
      option.textContent = item.name;
      reservationVenueNameField.appendChild(option);
    });

    if (selectedVenueName && !items.some((item) => item.name === selectedVenueName)) {
      const legacyOption = document.createElement("option");
      legacyOption.value = selectedVenueName;
      legacyOption.textContent = `${selectedVenueName} (not in inventory)`;
      reservationVenueNameField.appendChild(legacyOption);
    }

    reservationVenueNameField.value = selectedVenueName;
  }

  function openNewReservationModal() {
    editingReservationId = "";
    reservationAdjustForm.reset();
    reservationGuestsField.value = "1";
    reservationDateField.value = getTodayDateInputValue();
    reservationVenueTypeField.value = "table";
    reservationStatusField.value = "pending";
    toggleReservationTimeFields("table");
    populateReservationVenueOptions("table");
    setReservationModalContext("create");
    reservationModal.hidden = false;
    reservationNameField.focus();
  }

  function openReservationModal(reservationId) {
    const reservations = loadReservations();
    const targetReservation = reservations.find(
      (reservation) => reservation.id === reservationId
    );

    if (!targetReservation) {
      setBookingMessage("That reservation could not be found anymore.", "is-error");
      return;
    }

    editingReservationId = reservationId;
    reservationNameField.value = targetReservation.name;
    reservationEmailField.value = targetReservation.email;
    reservationPhoneField.value = targetReservation.phone;
    reservationGuestsField.value = targetReservation.guests;
    reservationDateField.value = targetReservation.date;
    reservationVenueTypeField.value = normalizeVenueType(targetReservation.venueType);
    reservationStatusField.value = normalizeReservationStatus(targetReservation.status);
    toggleReservationTimeFields(normalizeVenueType(targetReservation.venueType), targetReservation);
    populateReservationVenueOptions(
      normalizeVenueType(targetReservation.venueType),
      targetReservation.venueName
    );
    setReservationModalContext("edit", targetReservation.name);
    reservationModal.hidden = false;
    reservationNameField.focus();
  }

  function closeReservationModal() {
    editingReservationId = "";
    reservationModal.hidden = true;
    reservationAdjustForm.reset();
    toggleReservationTimeFields(reservationVenueTypeField.value);
    reservationVenueNameField.innerHTML = '<option value="">Choose a VIP lounge or room</option>';
    setReservationModalContext("edit");
  }

  async function updateReservationStatus(reservationId, nextStatus) {
    const reservations = loadReservations();
    const reservationIndex = reservations.findIndex(
      (reservation) => reservation.id === reservationId
    );

    if (reservationIndex === -1) {
      setBookingMessage("That reservation could not be found anymore.", "is-error");
      return;
    }

    const targetReservation = reservations[reservationIndex];

    if (
      isActiveReservationStatus(nextStatus) &&
      hasApprovedConflict(reservations, targetReservation, reservationId)
    ) {
      const actionLabel = formatReservationStatus(nextStatus).toLowerCase();
      setBookingMessage(
        `Cannot mark ${targetReservation.venueName} as ${actionLabel} because ${getApprovedConflictMessage(
          targetReservation
        ).toLowerCase()}`,
        "is-error"
      );
      return;
    }

    if (isActiveReservationStatus(nextStatus) && nextStatus !== "checked_in") {
      const occupiedVenueMessage = getOccupiedVenueConflictMessage(targetReservation);
      if (occupiedVenueMessage) {
        setBookingMessage(occupiedVenueMessage, "is-error");
        return;
      }
    }

    const statusResult = await window.ChopHouseApi.updateReservationStatus(
      Number(reservationId),
      nextStatus.toUpperCase()
    );
    const approvalEmailSent = Boolean(
      nextStatus === "approved" &&
        statusResult &&
        typeof statusResult === "object" &&
        "approvalEmailSent" in statusResult &&
        statusResult.approvalEmailSent
    );
    const statusEmailSent = Boolean(
      nextStatus !== "approved" &&
        statusResult &&
        typeof statusResult === "object" &&
        "statusEmailSent" in statusResult &&
        statusResult.statusEmailSent
    );
    await refreshReservationState();
    await syncVenueStatusesForReservations([targetReservation.venueId]);
    renderReservations();

    if (
      selectedPendingReservationId === String(reservationId) &&
      normalizeReservationStatus(nextStatus) !== "pending"
    ) {
      closePendingReservationModal();
    }

    const emailNote =
      approvalEmailSent || statusEmailSent
        ? " A customer email was sent."
        : " Email delivery depends on the server mail setup.";
    const messages = {
      approved: `${targetReservation.name}'s reservation was approved and marked as reserved.`,
      cancelled: `${targetReservation.name}'s reservation was cancelled, removed from the active queue, and logged.`,
      late: `${targetReservation.name}'s reservation was marked as late.`,
      checked_in: `${targetReservation.name}'s reservation was checked in and the venue was marked occupied.`,
      checked_out: `${targetReservation.name}'s reservation was checked out and moved to logs.`,
      no_show: `${targetReservation.name}'s reservation was marked as no-show and moved to logs.`,
    };
    setBookingMessage(`${messages[nextStatus] || `${targetReservation.name}'s reservation was updated.`}${emailNote}`, "is-success");
  }

  function readReservationForm(existingReservation = null) {
    const reservation = {
      ...(existingReservation || {
        id: "",
        createdAt: new Date().toISOString(),
      }),
      name: reservationNameField.value.trim(),
      email: reservationEmailField.value.trim(),
      phone: reservationPhoneField.value.trim(),
      guests: reservationGuestsField.value.trim(),
      date: reservationDateField.value,
      venueType: normalizeVenueType(reservationVenueTypeField.value),
      venueName: reservationVenueNameField.value,
      status: normalizeReservationStatus(reservationStatusField.value),
      updatedAt: new Date().toISOString(),
    };

    if (reservation.venueType === "room") {
      reservation.startTime = reservationStartTimeField.value;
      reservation.endTime = reservationEndTimeField.value;
      reservation.time = reservationStartTimeField.value;
    } else {
      reservation.time = reservationTimeField.value;
      reservation.startTime = reservationTimeField.value;
      reservation.endTime = "";
    }

    return reservation;
  }

  function validateReservationDraft(reservations, reservationDraft, ignoredReservationId = "") {
    if (
      !reservationDraft.name ||
      !reservationDraft.email ||
      !reservationDraft.phone ||
      !reservationDraft.guests ||
      !reservationDraft.date ||
      !reservationDraft.venueName
    ) {
      return "Fill in all reservation details before saving.";
    }

    if (
      reservationDraft.venueType === "room" &&
      (!reservationDraft.startTime || !reservationDraft.endTime)
    ) {
      return "Fill in both the KTV room start time and end time.";
    }

    if (
      reservationDraft.venueType === "room" &&
      !isValidTimeRange(reservationDraft.startTime, reservationDraft.endTime)
    ) {
      return "Set an end time that is later than the start time.";
    }

    if (reservationDraft.venueType !== "room" && !reservationDraft.time) {
      return "Fill in the reservation time before saving.";
    }

    if (
      isActiveReservationStatus(reservationDraft.status) &&
      hasApprovedConflict(reservations, reservationDraft, ignoredReservationId)
    ) {
      return getApprovedConflictMessage(reservationDraft);
    }

    if (isActiveReservationStatus(reservationDraft.status) && reservationDraft.status !== "checked_in") {
      const existingReservation =
        ignoredReservationId
          ? reservations.find((reservation) => reservation.id === ignoredReservationId) || null
          : null;
      const occupiedVenueMessage = getOccupiedVenueConflictMessage(
        reservationDraft,
        existingReservation
      );
      if (occupiedVenueMessage) {
        return occupiedVenueMessage;
      }
    }

    return "";
  }

  async function handleReservationAction(event) {
    const actionButton = event.target.closest("[data-action]");
    if (!actionButton) {
      return;
    }

    const reservationId = actionButton.dataset.reservationId || "";
    const action = actionButton.dataset.action || "";

    if (action === "open-pending-reservation") {
      openPendingReservationModal(reservationId);
      return;
    }

    if (action === "open-active-reservations") {
      openActiveReservationModal();
      return;
    }

    if (action === "toggle-uploads") {
      const storage = actionButton.closest(".reservation-upload-storage");
      const uploadPanel = storage?.querySelector(".reservation-verification");
      const isExpanded = actionButton.getAttribute("aria-expanded") === "true";

      if (!uploadPanel) {
        return;
      }

      uploadPanel.hidden = isExpanded;
      actionButton.setAttribute("aria-expanded", String(!isExpanded));
      actionButton.textContent = isExpanded ? "Show Uploads" : "Hide Uploads";
      return;
    }

    if (action === "approve") {
      try {
        await updateReservationStatus(reservationId, "approved");
      } catch (error) {
        setBookingMessage(error.message || "Reservation approval failed.", "is-error");
      }
      return;
    }

    if (["late", "check-in", "check-out", "no-show"].includes(action)) {
      const nextStatusByAction = {
        late: "late",
        "check-in": "checked_in",
        "check-out": "checked_out",
        "no-show": "no_show",
      };
      const reservations = loadReservations();
      const targetReservation = reservations.find(
        (reservation) => reservation.id === reservationId
      );
      const actionText = {
        late: "mark this reservation as late",
        "check-in": "check this customer in",
        "check-out": "check this customer out",
        "no-show": "mark this reservation as no-show",
      }[action];

      const shouldContinue = window.confirm(
        targetReservation
          ? `Confirm you want to ${actionText} for ${targetReservation.name}?`
          : `Confirm you want to ${actionText}?`
      );

      if (!shouldContinue) {
        return;
      }

      try {
        await updateReservationStatus(reservationId, nextStatusByAction[action]);
      } catch (error) {
        setBookingMessage(error.message || "Reservation operation failed.", "is-error");
      }
      return;
    }

    if (action === "cancel") {
      const reservations = loadReservations();
      const targetReservation = reservations.find(
        (reservation) => reservation.id === reservationId
      );
      const shouldCancel = window.confirm(
        targetReservation
          ? `Cancel ${targetReservation.name}'s reservation for ${targetReservation.venueName}?\n${formatReservationDate(
              targetReservation.date,
              getReservationStartTime(targetReservation),
              getReservationEndTime(targetReservation),
              targetReservation.venueType
            )}`
          : "Cancel this reservation request?"
      );

      if (!shouldCancel) {
        return;
      }

      try {
        await updateReservationStatus(reservationId, "cancelled");
      } catch (error) {
        setBookingMessage(error.message || "Reservation cancellation failed.", "is-error");
      }
      return;
    }

    if (action === "verify-payment" || action === "reject-payment") {
      const reservations = loadReservations();
      const targetReservation = reservations.find(
        (reservation) => reservation.id === reservationId
      );
      const nextPaymentStatus = action === "verify-payment" ? "VERIFIED" : "REJECTED";
      const actionLabel = action === "verify-payment" ? "verify" : "reject";
      const defaultRemark =
        action === "verify-payment"
          ? "Downpayment receipt and ID were verified."
          : "Downpayment verification was rejected.";
      const remarks = window.prompt(
        targetReservation
          ? `Add a short note to ${actionLabel} ${targetReservation.name}'s payment:`
          : `Add a short note to ${actionLabel} this payment:`,
        defaultRemark
      );

      if (remarks === null) {
        return;
      }

      try {
        await window.ChopHouseApi.updateDownpaymentStatus(
          Number(reservationId),
          nextPaymentStatus,
          remarks.trim() || defaultRemark
        );
        await refreshReservationState();
        renderReservations();
        setBookingMessage(
          targetReservation
            ? `${targetReservation.name}'s downpayment was marked as ${nextPaymentStatus.toLowerCase()}.`
            : `Downpayment was marked as ${nextPaymentStatus.toLowerCase()}.`,
          "is-success"
        );
      } catch (error) {
        setBookingMessage(error.message || "Downpayment status update failed.", "is-error");
      }
      return;
    }

    if (action === "adjust") {
      openReservationModal(reservationId);
    }
  }

  reservationList.addEventListener("click", handleReservationAction);
  pendingReservationDetail.addEventListener("click", handleReservationAction);
  activeReservationList.addEventListener("click", handleReservationAction);

  reservationCalendarDate.addEventListener("change", () => {
    renderReservationCalendar(
      loadReservations().filter((reservation) => !isClosedReservationStatus(reservation.status))
    );
  });

  reservationVenueTypeField.addEventListener("change", () => {
    toggleReservationTimeFields(reservationVenueTypeField.value);
    populateReservationVenueOptions(reservationVenueTypeField.value);
  });

  openNewReservationModalButton?.addEventListener("click", openNewReservationModal);
  openArchiveModalButton.addEventListener("click", openArchiveModal);
  exportReservationsCsvButton?.addEventListener("click", () => downloadReservations("csv"));
  exportReservationsPdfButton?.addEventListener("click", () => downloadReservations("pdf"));
  closeArchiveModalButton.addEventListener("click", closeArchiveModal);
  cancelArchiveModalButton.addEventListener("click", closeArchiveModal);
  closePendingReservationModalButton.addEventListener("click", closePendingReservationModal);
  cancelPendingReservationModalButton.addEventListener("click", closePendingReservationModal);
  closeActiveReservationModalButton.addEventListener("click", closeActiveReservationModal);
  cancelActiveReservationModalButton.addEventListener("click", closeActiveReservationModal);
  closeReservationModalButton.addEventListener("click", closeReservationModal);
  cancelReservationModalButton.addEventListener("click", closeReservationModal);

  pendingReservationModal.addEventListener("click", (event) => {
    if (event.target === pendingReservationModal) {
      closePendingReservationModal();
    }
  });

  activeReservationModal.addEventListener("click", (event) => {
    if (event.target === activeReservationModal) {
      closeActiveReservationModal();
    }
  });

  archiveModal.addEventListener("click", (event) => {
    if (event.target === archiveModal) {
      closeArchiveModal();
    }
  });

  reservationModal.addEventListener("click", (event) => {
    if (event.target === reservationModal) {
      closeReservationModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !archiveModal.hidden) {
      closeArchiveModal();
    }
    if (event.key === "Escape" && !pendingReservationModal.hidden) {
      closePendingReservationModal();
    }
    if (event.key === "Escape" && !activeReservationModal.hidden) {
      closeActiveReservationModal();
    }
    if (event.key === "Escape" && !reservationModal.hidden) {
      closeReservationModal();
    }
  });

  reservationAdjustForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const reservations = loadReservations();
    const existingReservation = editingReservationId
      ? reservations.find((reservation) => reservation.id === editingReservationId) || null
      : null;

    if (editingReservationId && !existingReservation) {
      setBookingMessage("That reservation could not be found anymore.", "is-error");
      closeReservationModal();
      return;
    }

    const reservationDraft = readReservationForm(existingReservation);
    const validationMessage = validateReservationDraft(
      reservations,
      reservationDraft,
      editingReservationId
    );

    if (validationMessage) {
      setReservationModalMessage(validationMessage, "is-error");
      return;
    }

    try {
      const matchedVenue = loadInventory()
        [reservationDraft.venueType === "room" ? "room" : "table"]
        .find((item) => item.name === reservationDraft.venueName);
      const nextVenueId = matchedVenue?.id || reservationDraft.venueId;

      if (!nextVenueId) {
        setReservationModalMessage(
          "The selected venue could not be matched to the backend.",
          "is-error"
        );
        return;
      }

      const reservationPayload = {
        customerName: reservationDraft.name,
        customerEmail: reservationDraft.email,
        customerPhone: reservationDraft.phone,
        venueId: nextVenueId,
        reservationDate: reservationDraft.date,
        scheduledTime: reservationDraft.venueType === "room" ? null : reservationDraft.time,
        startTime: reservationDraft.venueType === "room" ? reservationDraft.startTime : null,
        endTime: reservationDraft.venueType === "room" ? reservationDraft.endTime : null,
        guestCount: Number(reservationDraft.guests || 0),
      };

      if (editingReservationId) {
        await window.ChopHouseApi.updateReservation(Number(editingReservationId), reservationPayload);

        if (reservationDraft.status !== existingReservation.status) {
          await window.ChopHouseApi.updateReservationStatus(
            Number(editingReservationId),
            reservationDraft.status.toUpperCase()
          );
        }
      } else {
        const createdReservation = await window.ChopHouseApi.createReservation(reservationPayload);

        if (reservationDraft.status !== "pending" && createdReservation?.id) {
          await window.ChopHouseApi.updateReservationStatus(
            Number(createdReservation.id),
            reservationDraft.status.toUpperCase()
          );
        }
      }

      await refreshReservationState();
      await syncVenueStatusesForReservations(
        [existingReservation?.venueId, nextVenueId].filter(Boolean)
      );
      renderReservations();
      setBookingMessage(
        editingReservationId
          ? reservationDraft.status === "cancelled"
            ? `${reservationDraft.name}'s reservation was cancelled, removed from the active queue, and logged.`
            : `${reservationDraft.name}'s reservation was updated successfully.`
          : `${reservationDraft.name}'s reservation was saved successfully.`,
        "is-success"
      );
      closeReservationModal();
    } catch (error) {
      setReservationModalMessage(error.message || "Reservation save failed.", "is-error");
    }
  });

  document.addEventListener("visibilitychange", async () => {
    if (document.hidden) {
      return;
    }

    await Promise.all([refreshInventoryState(), refreshReservationState()]);
    await syncVenueStatusesForReservations(getApprovedReservationVenueIds());
    renderReservations();

    if (!reservationModal.hidden) {
      toggleReservationTimeFields(reservationVenueTypeField.value);
      populateReservationVenueOptions(
        reservationVenueTypeField.value,
        reservationVenueNameField.value
      );
    }
  });

  (async () => {
    await Promise.all([refreshInventoryState(), refreshReservationState()]);
    await syncVenueStatusesForReservations(getApprovedReservationVenueIds());
    toggleReservationTimeFields(reservationVenueTypeField.value);
    renderReservations();
  })();

  setInterval(async () => {
    if (document.hidden) {
      return;
    }

    await Promise.all([refreshInventoryState(), refreshReservationState()]);
    renderReservations();
  }, liveStatusRefreshIntervalMs);
}

function initializeStaffStatusManager() {
  return;
}

initializeAdminInventory();
initializeReservationOperations();
initializePaymentSettingsManager();
initializeStaffStatusManager();
