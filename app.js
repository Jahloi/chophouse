const inventoryStorageKey = "chophouseAdminInventory";
const reservationStorageKey = "chophouseReservations";
const tableStatusGrid = document.getElementById("table-status-grid");
const roomStatusGrid = document.getElementById("room-status-grid");
const venueType = document.getElementById("venue-type");
const venueName = document.getElementById("venue-name");
const venueTypePicker = document.getElementById("venue-type-picker");
const venueTypeTrigger = document.getElementById("venue-type-trigger");
const venueTypeLabel = document.getElementById("venue-type-label");
const venueTypeMenu = document.getElementById("venue-type-menu");
const venueTypeOptions = document.getElementById("venue-type-options");
const venueNamePicker = document.getElementById("venue-name-picker");
const venueNameTrigger = document.getElementById("venue-name-trigger");
const venueNameLabel = document.getElementById("venue-name-label");
const venueNameMenu = document.getElementById("venue-name-menu");
const venueNameOptions = document.getElementById("venue-name-options");
const reservationForm = document.getElementById("reservation-form");
const reservationMessage = document.getElementById("reservation-message");
const reservationSubmitButton = document.getElementById("reservation-submit-button");
const reservationTermsAccepted = document.getElementById("reservation-terms-accepted");
const reservationTermsModal = document.getElementById("reservation-terms-modal");
const reservationTermsContent = document.getElementById("reservation-terms-content");
const reservationTermsHint = document.getElementById("reservation-terms-hint");
const reservationTermsModalCheck = document.getElementById("reservation-terms-modal-check");
const acceptReservationTermsButton = document.getElementById("accept-reservation-terms");
const closeReservationTermsButton = document.getElementById("close-reservation-terms");
const cancelReservationTermsButton = document.getElementById("cancel-reservation-terms");
const downpaymentModal = document.getElementById("downpayment-modal");
const downpaymentForm = document.getElementById("downpayment-form");
const downpaymentSummary = document.getElementById("downpayment-summary");
const downpaymentMethod = document.getElementById("downpayment-method");
const downpaymentReceipt = document.getElementById("downpayment-receipt");
const idVerification = document.getElementById("id-verification");
const downpaymentConfirm = document.getElementById("downpayment-confirm");
const downpaymentMessage = document.getElementById("downpayment-message");
const gcashQrPreview = document.getElementById("gcash-qr-preview");
const closeDownpaymentModalButton = document.getElementById("close-downpayment-modal");
const cancelDownpaymentModalButton = document.getElementById("cancel-downpayment-modal");
const submitDownpaymentButton = document.getElementById("submit-downpayment-button");
const reservationDateField = reservationForm?.querySelector('input[name="date"]') || null;
const reservationSingleTimeField = document.getElementById("reservation-time");
const reservationSingleTimeFieldWrap = document.getElementById("reservation-single-time-field");
const reservationSingleTimePicker = document.getElementById("reservation-time-picker");
const reservationSingleTimeTrigger = document.getElementById("reservation-time-trigger");
const reservationSingleTimeLabel = document.getElementById("reservation-time-label");
const reservationSingleTimeMenu = document.getElementById("reservation-time-menu");
const reservationSingleTimeOptions = document.getElementById("reservation-time-options");
const reservationStartTimeField = document.getElementById("reservation-start-time");
const reservationStartTimeFieldWrap = document.getElementById("reservation-start-time-field");
const reservationStartTimePicker = document.getElementById("reservation-start-time-picker");
const reservationStartTimeTrigger = document.getElementById("reservation-start-time-trigger");
const reservationStartTimeLabel = document.getElementById("reservation-start-time-label");
const reservationStartTimeMenu = document.getElementById("reservation-start-time-menu");
const reservationStartTimeOptions = document.getElementById("reservation-start-time-options");
const reservationEndTimeField = document.getElementById("reservation-end-time");
const reservationEndTimeFieldWrap = document.getElementById("reservation-end-time-field");
const reservationEndTimePicker = document.getElementById("reservation-end-time-picker");
const reservationEndTimeTrigger = document.getElementById("reservation-end-time-trigger");
const reservationEndTimeLabel = document.getElementById("reservation-end-time-label");
const reservationEndTimeMenu = document.getElementById("reservation-end-time-menu");
const reservationEndTimeOptions = document.getElementById("reservation-end-time-options");
const reservationOpeningMinutes = 17 * 60;
const reservationClosingMinutes = 3 * 60;
const reservationIntervalMinutes = 30;
const liveStatusRefreshIntervalMs = 5000;
const requiredDownpaymentAmount = 500;
const reservationTermsContinueMessage = "Read and Accept the Terms and Condition to Continue.";
let pendingReservationPayload = null;
let pendingReservationVenueName = "";
let shouldSubmitReservationAfterTerms = false;

let inventoryState = {
  table: [],
  ktv: [],
};
let reservationState = [];

const defaultInventory = {
  table: [
    { name: "VIP Lounge 1", capacity: "2-4 people", notes: "Near the entrance", status: "available" },
    { name: "VIP Lounge 2", capacity: "4-6 people", notes: "Best for family groups", status: "occupied" },
    { name: "VIP Lounge 3", capacity: "2 people", notes: "Quiet corner seating", status: "available" },
    { name: "VIP Lounge 4", capacity: "6-8 people", notes: "Large dining group", status: "occupied" },
    { name: "VIP Lounge 5", capacity: "2-4 people", notes: "Close to the service area", status: "available" },
  ],
  room: [
    { name: "KTV Room 1", capacity: "4-8 people", notes: "VIP room package", status: "available" },
    { name: "KTV Room 2", capacity: "6-10 people", notes: "Large room with bar", status: "occupied" },
    { name: "KTV Room 3", capacity: "4-6 people", notes: "Standard KTV package", status: "available" },
  ],
};

let venueOptions = {
  table: [],
  ktv: [],
};

const venueTypeChoices = [
  { value: "table", label: "VIP Lounge" },
  { value: "ktv", label: "KTV Room" },
];

function cloneInventory(source) {
  return JSON.parse(JSON.stringify(source));
}

function toDateInputValue(value) {
  return String(value || "").slice(0, 10);
}

function getTodayDateInputValue() {
  const dateParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(dateParts.map((part) => [part.type, part.value]));

  return `${values.year}-${values.month}-${values.day}`;
}

function enforceReservationDateLimit(showMessage = false) {
  if (!reservationDateField) {
    return false;
  }

  const minimumReservationDate = getTodayDateInputValue();
  reservationDateField.min = minimumReservationDate;

  if (!reservationDateField.value || reservationDateField.value >= minimumReservationDate) {
    reservationDateField.setCustomValidity("");
    return false;
  }

  reservationDateField.value = "";
  reservationDateField.setCustomValidity("Choose a valid date for your reservation.");

  if (showMessage && reservationMessage) {
    reservationMessage.textContent = "Choose a valid date for your reservation.";
  }

  return true;
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
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function normalizeStatus(status) {
  return ["available", "occupied", "reserved", "standby", "maintenance"].includes(status)
    ? status
    : "available";
}

function normalizeReservationStatus(status) {
  return ["pending", "approved", "cancelled", "checked_in", "checked_out", "late", "no_show"].includes(status)
    ? status
    : "pending";
}

function isActiveReservationStatus(status) {
  return ["approved", "late", "checked_in"].includes(normalizeReservationStatus(status));
}

function normalizeVenueType(value) {
  const normalizedValue = String(value || "").trim().toLowerCase();
  return normalizedValue === "room" || normalizedValue === "ktv" ? "room" : "table";
}

function createReservationId() {
  return `reservation-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
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

function mapVenueFromApi(venue) {
  return {
    id: venue.id,
    name: venue.name,
    capacity: formatCapacityLabel(venue.capacityMin, venue.capacityMax),
    notes: venue.notes || "",
    status: normalizeStatus(String(venue.status || "").toLowerCase()),
    venueType: normalizeVenueType(venue.venueType),
  };
}

function mapReservationFromApi(reservation) {
  const venueData = reservation.venue || {};
  const venueKind = normalizeVenueType(venueData.venueType || reservation.venueType);
  const dateValue = toDateInputValue(reservation.reservationDate || reservation.date);
  const scheduledTime = String(reservation.scheduledTime || reservation.time || "");
  const startTime = String(reservation.startTime || scheduledTime || "");
  const endTime = venueKind === "room" ? String(reservation.endTime || "") : "";

  return {
    id: String(reservation.id || ""),
    name: String(reservation.customerName || reservation.name || "").trim(),
    email: String(reservation.customerEmail || reservation.email || "").trim(),
    phone: String(reservation.customerPhone || reservation.phone || "").trim(),
    date: dateValue,
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
    downpaymentStatus: String(reservation.downpaymentStatus || "").trim().toLowerCase(),
    status: normalizeReservationStatus(String(reservation.status || "").toLowerCase()),
    createdAt: reservation.createdAt || new Date().toISOString(),
    updatedAt: reservation.updatedAt || reservation.createdAt || new Date().toISOString(),
  };
}

async function refreshInventoryState() {
  try {
    const venues = await window.ChopHouseApi.listVenues();
    const mappedVenues = Array.isArray(venues) ? venues.map(mapVenueFromApi) : [];

    inventoryState = {
      table: mappedVenues.filter((venue) => venue.venueType === "table"),
      ktv: mappedVenues.filter((venue) => venue.venueType === "room"),
    };
  } catch (error) {
    console.error("Inventory load failed:", error);
    inventoryState = {
      table: cloneInventory(defaultInventory.table),
      ktv: cloneInventory(defaultInventory.room),
    };
  }

  venueOptions = {
    table: inventoryState.table.map((item) => ({ id: item.id, name: item.name, status: item.status })),
    ktv: inventoryState.ktv.map((item) => ({ id: item.id, name: item.name, status: item.status })),
  };
}

async function refreshReservationState() {
  try {
    const reservations = await window.ChopHouseApi.listPublicReservations();
    reservationState = Array.isArray(reservations) ? reservations.map(mapReservationFromApi) : [];
  } catch (error) {
    console.error("Reservation load failed:", error);
    reservationState = [];
  }
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

function formatStoredTimeLabel(value) {
  const minutes = toOperationalMinutes(value);
  return Number.isNaN(minutes) ? String(value || "") : formatTimeLabel(minutes);
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

function createReservationTimestamp(reservation) {
  if (!reservation?.date) {
    return Number.POSITIVE_INFINITY;
  }

  const baseDate = new Date(`${reservation.date}T12:00:00`);
  const startMinutes = toOperationalMinutes(getReservationStartTime(reservation));
  if (Number.isNaN(baseDate.getTime()) || Number.isNaN(startMinutes)) {
    return Number.POSITIVE_INFINITY;
  }

  const result = new Date(baseDate);
  result.setHours(0, 0, 0, 0);
  if (startMinutes >= 24 * 60) {
    result.setDate(result.getDate() + 1);
  }
  result.setMinutes(startMinutes % (24 * 60));
  return result.getTime();
}

function getApprovedReservationForVenue(venueId, venueName = "") {
  const matchingReservations = loadReservations()
    .filter(
      (reservation) =>
        isActiveReservationStatus(reservation.status) &&
        (String(reservation.venueId || "") === String(venueId || "") ||
          (venueName && reservation.venueName === venueName))
    )
    .sort((left, right) => createReservationTimestamp(left) - createReservationTimestamp(right));

  return matchingReservations[0] || null;
}

function getPublicReservationConflict(venue, reservations, selectedType, selectedDate, selectedTime, selectedStartTime, selectedEndTime) {
  const normalizedVenueType = normalizeVenueType(selectedType);
  const scheduleReady =
    normalizedVenueType === "room"
      ? Boolean(selectedDate) && isValidTimeRange(selectedStartTime, selectedEndTime)
      : Boolean(selectedDate);

  if (!scheduleReady) {
    return false;
  }

  return hasApprovedConflict(reservations, {
    venueType: normalizedVenueType,
    venueName: venue.name,
    date: selectedDate,
    time: normalizedVenueType === "room" ? selectedStartTime : selectedTime,
    startTime: selectedStartTime,
    endTime: normalizedVenueType === "room" ? selectedEndTime : "",
  });
}

function formatReservationSchedule(reservation) {
  if (!reservation?.date) {
    return "";
  }

  const dateValue = new Date(`${reservation.date}T12:00:00`);
  const dateLabel = Number.isNaN(dateValue.getTime())
    ? reservation.date
    : dateValue.toLocaleDateString([], {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
  const startLabel = formatStoredTimeLabel(getReservationStartTime(reservation));
  const endTime = getReservationEndTime(reservation);

  if (isRoomVenue(reservation.venueType) && endTime) {
    return `${dateLabel} | ${startLabel} - ${formatStoredTimeLabel(endTime)}`;
  }

  return `${dateLabel} | ${startLabel}`;
}

function formatTimeLabel(totalMinutes) {
  const normalizedMinutes = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const hours = Math.floor(normalizedMinutes / 60);
  const minutes = normalizedMinutes % 60;
  const suffix = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 || 12;
  return `${hour12}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

function closePicker(picker, trigger, menu) {
  if (!picker || !trigger || !menu) {
    return;
  }

  picker.classList.remove("is-open");
  trigger.setAttribute("aria-expanded", "false");
  menu.hidden = true;
}

function openPicker(picker, trigger, menu) {
  if (!picker || !trigger || !menu) {
    return;
  }

  picker.classList.add("is-open");
  trigger.setAttribute("aria-expanded", "true");
  menu.hidden = false;
}

function closeReservationSingleTimeMenu() {
  closePicker(reservationSingleTimePicker, reservationSingleTimeTrigger, reservationSingleTimeMenu);
}

function closeReservationStartTimeMenu() {
  closePicker(reservationStartTimePicker, reservationStartTimeTrigger, reservationStartTimeMenu);
}

function closeReservationEndTimeMenu() {
  closePicker(reservationEndTimePicker, reservationEndTimeTrigger, reservationEndTimeMenu);
}

function closeVenueTypeMenu() {
  closePicker(venueTypePicker, venueTypeTrigger, venueTypeMenu);
}

function closeVenueNameMenu() {
  closePicker(venueNamePicker, venueNameTrigger, venueNameMenu);
}

function closeAllTimeMenus() {
  closeReservationSingleTimeMenu();
  closeReservationStartTimeMenu();
  closeReservationEndTimeMenu();
}

function syncPickerLabel(field, label, optionsContainer, placeholder) {
  if (!field || !label) {
    return;
  }

  const activeOption = optionsContainer?.querySelector(`[data-value="${field.value}"]`);

  label.textContent = activeOption?.dataset.label || activeOption?.textContent || placeholder;
}

function updatePickerSelection(optionsContainer, selectedValue) {
  if (!optionsContainer) {
    return;
  }

  optionsContainer.querySelectorAll(".time-picker__option").forEach((option) => {
    const isSelected = option.dataset.value === selectedValue;
    option.classList.toggle("is-selected", isSelected);
    option.setAttribute("aria-selected", isSelected ? "true" : "false");
  });
}

function setPickerValue(
  field,
  optionsContainer,
  label,
  placeholder,
  value,
  closeMenu
) {
  if (!field) {
    return;
  }

  const previousValue = field.value;
  field.value = value;
  updatePickerSelection(optionsContainer, value);
  syncPickerLabel(field, label, optionsContainer, placeholder);
  if (previousValue !== value) {
    field.dispatchEvent(new Event("change", { bubbles: true }));
  }

  if (closeMenu) {
    closeMenu();
  }
}

function clearPickerValue(field, optionsContainer, label, placeholder) {
  if (!field) {
    return;
  }

  field.value = "";
  updatePickerSelection(optionsContainer, "");
  syncPickerLabel(field, label, optionsContainer, placeholder);
}

function populateVenueTypeOptions() {
  if (!venueTypeOptions) {
    return;
  }

  venueTypeOptions.innerHTML = venueTypeChoices
    .map((choice) => {
      const isSelected = choice.value === venueType.value;
      return `
        <button
          class="time-picker__option${isSelected ? " is-selected" : ""}"
          type="button"
          role="option"
          data-value="${choice.value}"
          data-label="${choice.label}"
          aria-selected="${isSelected ? "true" : "false"}"
        >
          ${choice.label}
        </button>
      `;
    })
    .join("");

  syncPickerLabel(venueType, venueTypeLabel, venueTypeOptions, "Select Venue Type");
}

function populateTimePickerOptions(
  field,
  optionsContainer,
  label,
  placeholder,
  isAllowed = () => true,
  emptyLabel = "No available times"
) {
  if (!field || !optionsContainer) {
    return;
  }

  const selectedTime = field.value;
  const slotOptions = [];
  let selectionIsValid = false;
  let currentMinutes = reservationOpeningMinutes;
  const endMinutes =
    reservationClosingMinutes <= reservationOpeningMinutes
      ? reservationClosingMinutes + 24 * 60
      : reservationClosingMinutes;

  while (currentMinutes <= endMinutes) {
    const normalizedMinutes = currentMinutes % (24 * 60);
    const hours = Math.floor(normalizedMinutes / 60);
    const minutes = normalizedMinutes % 60;
    const value = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    if (!isAllowed(value, currentMinutes)) {
      currentMinutes += reservationIntervalMinutes;
      continue;
    }

    const label = formatTimeLabel(currentMinutes);
    const isSelected = value === selectedTime;
    if (isSelected) {
      selectionIsValid = true;
    }

    slotOptions.push(`
      <button
        class="time-picker__option${isSelected ? " is-selected" : ""}"
        type="button"
        role="option"
        data-value="${value}"
        data-label="${label}"
        aria-selected="${isSelected ? "true" : "false"}"
      >
        ${label}
      </button>
    `);
    currentMinutes += reservationIntervalMinutes;
  }

  if (!selectionIsValid) {
    field.value = "";
  }

  optionsContainer.innerHTML =
    slotOptions.join("") ||
    `
      <button class="time-picker__option" type="button" disabled>
        ${escapeHtml(emptyLabel)}
      </button>
    `;

  syncPickerLabel(field, label, optionsContainer, placeholder);
}

function populateReservationTimeOptions() {
  populateTimePickerOptions(
    reservationSingleTimeField,
    reservationSingleTimeOptions,
    reservationSingleTimeLabel,
    "Select scheduled time"
  );
}

function populateReservationStartTimeOptions() {
  populateTimePickerOptions(
    reservationStartTimeField,
    reservationStartTimeOptions,
    reservationStartTimeLabel,
    "Select start time"
  );
}

function populateReservationEndTimeOptions() {
  if (!reservationEndTimeField || !reservationEndTimeOptions || !reservationEndTimeLabel) {
    return;
  }

  const selectedStartMinutes = toOperationalMinutes(reservationStartTimeField?.value || "");
  if (Number.isNaN(selectedStartMinutes)) {
    reservationEndTimeField.value = "";
    reservationEndTimeOptions.innerHTML = `
      <button class="time-picker__option" type="button" disabled>
        Select start time first
      </button>
    `;
    syncPickerLabel(
      reservationEndTimeField,
      reservationEndTimeLabel,
      reservationEndTimeOptions,
      "Select end time"
    );
    return;
  }

  populateTimePickerOptions(
    reservationEndTimeField,
    reservationEndTimeOptions,
    reservationEndTimeLabel,
    "Select end time",
    (_value, currentMinutes) => currentMinutes > selectedStartMinutes,
    "No later times available"
  );
}

function syncReservationTimeMode() {
  const useTimeRange = isRoomVenue(venueType?.value || "");

  if (reservationSingleTimeFieldWrap) {
    reservationSingleTimeFieldWrap.hidden = useTimeRange;
  }
  if (reservationStartTimeFieldWrap) {
    reservationStartTimeFieldWrap.hidden = !useTimeRange;
  }
  if (reservationEndTimeFieldWrap) {
    reservationEndTimeFieldWrap.hidden = !useTimeRange;
  }

  if (useTimeRange) {
    clearPickerValue(
      reservationSingleTimeField,
      reservationSingleTimeOptions,
      reservationSingleTimeLabel,
      "Select scheduled time"
    );
    populateReservationStartTimeOptions();
    populateReservationEndTimeOptions();
    closeReservationSingleTimeMenu();
    return;
  }

  clearPickerValue(
    reservationStartTimeField,
    reservationStartTimeOptions,
    reservationStartTimeLabel,
    "Select start time"
  );
  clearPickerValue(
    reservationEndTimeField,
    reservationEndTimeOptions,
    reservationEndTimeLabel,
    "Select end time"
  );
  populateReservationTimeOptions();
  closeReservationStartTimeMenu();
  closeReservationEndTimeMenu();
}

function loadInventory() {
  return {
    table: cloneInventory(inventoryState.table),
    room: cloneInventory(inventoryState.ktv),
  };
}

function loadReservations() {
  return reservationState.map((reservation) => ({ ...reservation }));
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
    ? "That KTV room already has an active reservation for part of the selected time range."
    : "That VIP lounge already has an active reservation for the selected date.";
}

function createSeatCard(item, type) {
  const approvedReservation = getApprovedReservationForVenue(item.id, item.name);
  const currentStatus = normalizeStatus(item.status);
  const isConfirmedOccupied = currentStatus === "occupied";
  const safeStatus = isConfirmedOccupied ? "occupied" : approvedReservation ? "reserved" : currentStatus;
  const safeName = escapeHtml(item.name);
  const safeCapacity = escapeHtml(item.capacity || "Capacity not set");
  const safeNotes = escapeHtml(item.notes || "No extra notes provided.");
  const statusLabel = isConfirmedOccupied
    ? "Occupied"
    : approvedReservation
      ? "Reserved"
      : capitalize(safeStatus);
  const scheduleLabel = approvedReservation && !isConfirmedOccupied
    ? escapeHtml(`Reserved for ${formatReservationSchedule(approvedReservation)}`)
    : "";

  return `
    <article class="seat-card" data-status="${safeStatus}">
      <div class="seat-card__top">
        <h4>${safeName}</h4>
        <span class="status-pill">${statusLabel}</span>
      </div>
      <p>Capacity: ${safeCapacity}</p>
      <small>${scheduleLabel || safeNotes}</small>
    </article>
  `;
}

function getPublicVenueBlockReason(venue, reservations, selectedType, selectedDate, selectedTime, selectedStartTime, selectedEndTime) {
  const normalizedStatus = normalizeStatus(venue.status);
  if (normalizedStatus === "occupied") {
    return "occupied";
  }

  if (normalizedStatus === "maintenance") {
    return "maintenance";
  }

  if (normalizedStatus === "reserved" || normalizedStatus === "standby") {
    return "reserved";
  }

  if (
    getPublicReservationConflict(
      venue,
      reservations,
      selectedType,
      selectedDate,
      selectedTime,
      selectedStartTime,
      selectedEndTime
    )
  ) {
    return "reserved";
  }

  return "";
}

function hasAcceptedReservationTerms() {
  return reservationTermsAccepted?.value === "accepted";
}

function reservationTermsContentIsRead() {
  if (!reservationTermsContent) {
    return true;
  }

  return (
    reservationTermsContent.scrollTop + reservationTermsContent.clientHeight >=
    reservationTermsContent.scrollHeight - 4
  );
}

function updateReservationTermsReadState() {
  const isRead = reservationTermsContentIsRead();

  if (reservationTermsModalCheck) {
    reservationTermsModalCheck.disabled = !isRead;
    if (!isRead) {
      reservationTermsModalCheck.checked = false;
    }
  }

  if (reservationTermsHint) {
    reservationTermsHint.textContent = isRead
      ? "You can now check the confirmation box."
      : "Scroll to the end of the terms to enable the confirmation checkbox.";
  }

  if (acceptReservationTermsButton) {
    acceptReservationTermsButton.disabled = !reservationTermsModalCheck?.checked;
  }
}

function resetReservationTermsModalReadState() {
  if (reservationTermsContent) {
    reservationTermsContent.scrollTop = 0;
  }
  if (reservationTermsModalCheck) {
    reservationTermsModalCheck.checked = false;
    reservationTermsModalCheck.disabled = true;
  }
  if (acceptReservationTermsButton) {
    acceptReservationTermsButton.disabled = true;
  }
  if (reservationTermsHint) {
    reservationTermsHint.textContent =
      "Scroll to the end of the terms to enable the confirmation checkbox.";
  }
}

function resetReservationTermsAcceptance() {
  if (reservationTermsAccepted) {
    reservationTermsAccepted.value = "";
  }
  resetReservationTermsModalReadState();
  shouldSubmitReservationAfterTerms = false;
}

function openReservationTermsModal() {
  if (!reservationTermsModal) {
    return;
  }

  resetReservationTermsModalReadState();
  reservationTermsModal.hidden = false;

  requestAnimationFrame(() => {
    updateReservationTermsReadState();
    reservationTermsContent?.focus();
  });
}

function closeReservationTermsModal() {
  if (reservationTermsModal) {
    reservationTermsModal.hidden = true;
  }
}

function promptReservationTerms(submitAfterTerms = false) {
  shouldSubmitReservationAfterTerms = submitAfterTerms;

  if (reservationMessage) {
    reservationMessage.textContent = reservationTermsContinueMessage;
  }

  openReservationTermsModal();
}

function acceptReservationTerms() {
  if (!reservationTermsModalCheck?.checked || !reservationTermsAccepted) {
    return;
  }

  reservationTermsAccepted.value = "accepted";
  updateReservationSubmitLabel();
  closeReservationTermsModal();

  if (reservationMessage) {
    reservationMessage.textContent = "";
  }

  if (shouldSubmitReservationAfterTerms) {
    shouldSubmitReservationAfterTerms = false;
    if (reservationSubmitButton) {
      reservationForm?.requestSubmit(reservationSubmitButton);
    } else {
      reservationForm?.requestSubmit();
    }
    return;
  }

  reservationSubmitButton?.focus();
}

function isReservationFormReadyForDownpayment() {
  if (!reservationForm || !venueType || !venueName || !reservationDateField) {
    return false;
  }

  const selectedVenueType = normalizeVenueType(venueType.value);
  const customerName = reservationForm.querySelector('input[name="name"]')?.value.trim() || "";
  const customerEmail = reservationForm.querySelector('input[name="email"]')?.value.trim() || "";
  const customerPhone = reservationForm.querySelector('input[name="phone"]')?.value.trim() || "";
  const guestCount = Number(reservationForm.querySelector('input[name="guests"]')?.value || 0);
  const selectedDate = reservationDateField.value || "";

  if (
    !venueType.value ||
    !venueName.value ||
    !hasAcceptedReservationTerms() ||
    !customerName ||
    !customerEmail ||
    !customerPhone ||
    !selectedDate ||
    selectedDate < getTodayDateInputValue() ||
    !Number.isFinite(guestCount) ||
    guestCount <= 0
  ) {
    return false;
  }

  const emailField = reservationForm.querySelector('input[name="email"]');
  if (emailField && !emailField.validity.valid) {
    return false;
  }

  if (selectedVenueType === "room") {
    return (
      Boolean(reservationStartTimeField?.value) &&
      Boolean(reservationEndTimeField?.value) &&
      isValidTimeRange(reservationStartTimeField.value, reservationEndTimeField.value)
    );
  }

  return Boolean(reservationSingleTimeField?.value);
}

function updateReservationSubmitLabel() {
  if (!reservationSubmitButton) {
    return;
  }

  if (!hasAcceptedReservationTerms()) {
    reservationSubmitButton.textContent = reservationTermsContinueMessage;
    return;
  }

  reservationSubmitButton.textContent = isReservationFormReadyForDownpayment()
    ? "Proceed to Downpayment"
    : "Reserve Now";
}

function renderInventory() {
  const inventory = loadInventory();
  const tables = inventory.table.map((item) => ({
    ...item,
    status: normalizeStatus(item.status),
  }));
  const rooms = inventory.room.map((item) => ({
    ...item,
    status: normalizeStatus(item.status),
  }));

  if (tableStatusGrid) {
    tableStatusGrid.innerHTML = tables.map((item) => createSeatCard(item, "table")).join("");
  }

  if (roomStatusGrid) {
    roomStatusGrid.innerHTML = rooms.map((item) => createSeatCard(item, "room")).join("");
  }

  venueOptions = {
    table: tables.map((item) => ({ id: item.id, name: item.name, status: item.status })),
    ktv: rooms.map((item) => ({ id: item.id, name: item.name, status: item.status })),
  };

  populateVenueOptions();
  updateReservationSubmitLabel();
}

function populateVenueOptions() {
  if (!venueType || !venueName || !venueNameOptions) {
    return;
  }

  const selectedType = venueType.value;
  const selectedDate = reservationDateField?.value || "";
  const selectedTime = reservationSingleTimeField?.value || "";
  const selectedStartTime = reservationStartTimeField?.value || "";
  const selectedEndTime = reservationEndTimeField?.value || "";
  const reservations = loadReservations();
  const previousSelection = venueName.value;

  if (!selectedType || !venueOptions[selectedType]) {
    venueName.value = "";
    venueNameOptions.innerHTML = "";
    syncPickerLabel(venueName, venueNameLabel, venueNameOptions, "Select a VIP Lounge or Room");
    return;
  }

  const optionMarkup = [];
  let selectionIsValid = false;

  venueOptions[selectedType].forEach((venue) => {
    const blockReason = getPublicVenueBlockReason(
      venue,
      reservations,
      selectedType,
      selectedDate,
      selectedTime,
      selectedStartTime,
      selectedEndTime
    );
    const isDisabled = Boolean(blockReason);
    const displayLabel =
      blockReason === "occupied"
        ? `${venue.name} - Occupied`
        : blockReason === "maintenance"
          ? `${venue.name} - Maintenance`
        : blockReason === "reserved"
          ? `${venue.name} - Reserved`
          : `${venue.name} - Available`;
    const isSelected = venue.name === previousSelection && !isDisabled;

    if (isSelected) {
      selectionIsValid = true;
    }

    optionMarkup.push(`
      <button
        class="time-picker__option${isSelected ? " is-selected" : ""}"
        type="button"
        role="option"
        data-value="${escapeHtml(venue.name)}"
        data-label="${escapeHtml(displayLabel)}"
        aria-selected="${isSelected ? "true" : "false"}"
        ${isDisabled ? "disabled" : ""}
      >
        ${escapeHtml(displayLabel)}
      </button>
    `);
  });

  venueNameOptions.innerHTML = optionMarkup.join("");
  venueName.value = selectionIsValid ? previousSelection : "";
  syncPickerLabel(venueName, venueNameLabel, venueNameOptions, "Select a VIP Lounge or Room");
}

if (venueType) {
  venueType.addEventListener("change", () => {
    syncReservationTimeMode();
    populateVenueOptions();
    updateReservationSubmitLabel();
  });
}

if (reservationDateField) {
  enforceReservationDateLimit();
  reservationDateField.addEventListener("input", () => {
    enforceReservationDateLimit(true);
    populateVenueOptions();
    updateReservationSubmitLabel();
  });
  reservationDateField.addEventListener("change", () => {
    enforceReservationDateLimit(true);
    populateVenueOptions();
    updateReservationSubmitLabel();
  });
}

[reservationDateField, reservationSingleTimeField, reservationStartTimeField, reservationEndTimeField]
  .filter(Boolean)
  .forEach((field) => {
  field.addEventListener("change", () => {
    populateVenueOptions();
    updateReservationSubmitLabel();
  });
});

if (reservationStartTimeField) {
  reservationStartTimeField.addEventListener("change", () => {
    populateReservationEndTimeOptions();
    populateVenueOptions();
    updateReservationSubmitLabel();
  });
}

if (reservationSingleTimeTrigger) {
  reservationSingleTimeTrigger.addEventListener("click", () => {
    if (reservationSingleTimeMenu?.hidden) {
      closeReservationStartTimeMenu();
      closeReservationEndTimeMenu();
      closeVenueTypeMenu();
      closeVenueNameMenu();
      openPicker(
        reservationSingleTimePicker,
        reservationSingleTimeTrigger,
        reservationSingleTimeMenu
      );
      return;
    }

    closeReservationSingleTimeMenu();
  });
}

if (reservationSingleTimeOptions) {
  reservationSingleTimeOptions.addEventListener("click", (event) => {
    const option = event.target.closest(".time-picker__option");
    if (!option) {
      return;
    }

    setPickerValue(
      reservationSingleTimeField,
      reservationSingleTimeOptions,
      reservationSingleTimeLabel,
      "Select scheduled time",
      option.dataset.value || "",
      closeReservationSingleTimeMenu
    );
  });
}

if (reservationStartTimeTrigger) {
  reservationStartTimeTrigger.addEventListener("click", () => {
    if (reservationStartTimeMenu?.hidden) {
      closeReservationSingleTimeMenu();
      closeReservationEndTimeMenu();
      closeVenueTypeMenu();
      closeVenueNameMenu();
      openPicker(
        reservationStartTimePicker,
        reservationStartTimeTrigger,
        reservationStartTimeMenu
      );
      return;
    }

    closeReservationStartTimeMenu();
  });
}

if (reservationStartTimeOptions) {
  reservationStartTimeOptions.addEventListener("click", (event) => {
    const option = event.target.closest(".time-picker__option");
    if (!option || option.disabled) {
      return;
    }

    setPickerValue(
      reservationStartTimeField,
      reservationStartTimeOptions,
      reservationStartTimeLabel,
      "Select start time",
      option.dataset.value || "",
      closeReservationStartTimeMenu
    );
  });
}

if (reservationEndTimeTrigger) {
  reservationEndTimeTrigger.addEventListener("click", () => {
    if (reservationEndTimeMenu?.hidden) {
      closeReservationSingleTimeMenu();
      closeReservationStartTimeMenu();
      closeVenueTypeMenu();
      closeVenueNameMenu();
      openPicker(reservationEndTimePicker, reservationEndTimeTrigger, reservationEndTimeMenu);
      return;
    }

    closeReservationEndTimeMenu();
  });
}

if (reservationEndTimeOptions) {
  reservationEndTimeOptions.addEventListener("click", (event) => {
    const option = event.target.closest(".time-picker__option");
    if (!option || option.disabled) {
      return;
    }

    setPickerValue(
      reservationEndTimeField,
      reservationEndTimeOptions,
      reservationEndTimeLabel,
      "Select end time",
      option.dataset.value || "",
      closeReservationEndTimeMenu
    );
  });
}

if (venueTypeTrigger) {
  venueTypeTrigger.addEventListener("click", () => {
    if (venueTypeMenu?.hidden) {
      closeAllTimeMenus();
      closeVenueNameMenu();
      openPicker(venueTypePicker, venueTypeTrigger, venueTypeMenu);
      return;
    }

    closeVenueTypeMenu();
  });
}

if (venueTypeOptions) {
  venueTypeOptions.addEventListener("click", (event) => {
    const option = event.target.closest(".time-picker__option");
    if (!option || option.disabled) {
      return;
    }

    setPickerValue(
      venueType,
      venueTypeOptions,
      venueTypeLabel,
      "Select Venue Type",
      option.dataset.value || "",
      closeVenueTypeMenu
    );
  });
}

if (venueNameTrigger) {
  venueNameTrigger.addEventListener("click", () => {
    if (venueNameMenu?.hidden) {
      closeAllTimeMenus();
      closeVenueTypeMenu();
      openPicker(venueNamePicker, venueNameTrigger, venueNameMenu);
      return;
    }

    closeVenueNameMenu();
  });
}

if (venueNameOptions) {
  venueNameOptions.addEventListener("click", (event) => {
    const option = event.target.closest(".time-picker__option");
    if (!option || option.disabled) {
      return;
    }

    setPickerValue(
      venueName,
      venueNameOptions,
      venueNameLabel,
      "Select a VIP Lounge or Room",
      option.dataset.value || "",
      closeVenueNameMenu
    );
  });
}

closeReservationTermsButton?.addEventListener("click", closeReservationTermsModal);
cancelReservationTermsButton?.addEventListener("click", closeReservationTermsModal);
reservationTermsContent?.addEventListener("scroll", updateReservationTermsReadState);
reservationTermsModalCheck?.addEventListener("change", updateReservationTermsReadState);
acceptReservationTermsButton?.addEventListener("click", acceptReservationTerms);
reservationTermsAccepted?.addEventListener("change", () => {
  if (!hasAcceptedReservationTerms()) {
    resetReservationTermsAcceptance();
  }
  updateReservationSubmitLabel();
});
reservationTermsModal?.addEventListener("click", (event) => {
  if (event.target === reservationTermsModal) {
    closeReservationTermsModal();
  }
});

document.addEventListener("click", (event) => {
  if (
    reservationSingleTimePicker &&
    !reservationSingleTimeMenu?.hidden &&
    !reservationSingleTimePicker.contains(event.target)
  ) {
    closeReservationSingleTimeMenu();
  }

  if (
    reservationStartTimePicker &&
    !reservationStartTimeMenu?.hidden &&
    !reservationStartTimePicker.contains(event.target)
  ) {
    closeReservationStartTimeMenu();
  }

  if (
    reservationEndTimePicker &&
    !reservationEndTimeMenu?.hidden &&
    !reservationEndTimePicker.contains(event.target)
  ) {
    closeReservationEndTimeMenu();
  }

  if (venueTypePicker && !venueTypeMenu?.hidden && !venueTypePicker.contains(event.target)) {
    closeVenueTypeMenu();
  }

  if (venueNamePicker && !venueNameMenu?.hidden && !venueNamePicker.contains(event.target)) {
    closeVenueNameMenu();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeAllTimeMenus();
    closeVenueTypeMenu();
    closeVenueNameMenu();
    if (downpaymentModal && !downpaymentModal.hidden) {
      closeDownpaymentModal();
    }
    if (reservationTermsModal && !reservationTermsModal.hidden) {
      closeReservationTermsModal();
    }
  }
});

function closeDownpaymentModal() {
  if (!downpaymentModal) {
    return;
  }

  downpaymentModal.hidden = true;
  pendingReservationPayload = null;
  pendingReservationVenueName = "";
  downpaymentForm?.reset();
  if (downpaymentMessage) {
    downpaymentMessage.textContent = "";
  }
}

function openDownpaymentModal(payload, venueName) {
  pendingReservationPayload = payload;
  pendingReservationVenueName = venueName;

  if (downpaymentSummary) {
    downpaymentSummary.textContent =
      `${venueName} is ready to be requested. Complete the required PHP ${requiredDownpaymentAmount.toFixed(
        2
      )} downpayment details to block this reservation for admin review.`;
  }

  if (downpaymentMessage) {
    downpaymentMessage.textContent = "";
  }
  downpaymentForm?.reset();

  if (downpaymentModal) {
    downpaymentModal.hidden = false;
    downpaymentReceipt?.focus();
  }
}

async function loadPaymentSettings() {
  if (!gcashQrPreview || !window.ChopHouseApi?.getPaymentSettings) {
    return;
  }

  try {
    const settings = await window.ChopHouseApi.getPaymentSettings();
    if (settings?.gcashQrPath) {
      gcashQrPreview.src = `${settings.gcashQrPath}?v=${encodeURIComponent(settings.updatedAt || "")}`;
    }
  } catch (error) {
    console.error("Payment settings load failed:", error);
  }
}

function resetReservationFormAfterSubmit() {
  reservationForm.reset();
  resetReservationTermsAcceptance();
  populateVenueTypeOptions();
  populateReservationTimeOptions();
  populateReservationStartTimeOptions();
  populateReservationEndTimeOptions();
  syncReservationTimeMode();
  populateVenueOptions();
  closeAllTimeMenus();
  closeVenueTypeMenu();
  closeVenueNameMenu();
  updateReservationSubmitLabel();
}

async function submitPendingReservationWithDownpayment() {
  if (!pendingReservationPayload || !downpaymentMethod || !downpaymentReceipt || !idVerification || !downpaymentConfirm) {
    return;
  }

  const selectedMethod = downpaymentMethod.value.trim();
  const receiptFile = downpaymentReceipt.files?.[0] || null;
  const idFile = idVerification.files?.[0] || null;

  if (selectedMethod !== "GCash" || !receiptFile || !idFile || !downpaymentConfirm.checked) {
    if (downpaymentMessage) {
      downpaymentMessage.textContent =
        "Upload the GCash receipt, upload your ID verification, and confirm payment before submitting.";
    }
    return;
  }

  if (downpaymentMessage) {
    downpaymentMessage.textContent = "Submitting your reservation request...";
  }
  if (submitDownpaymentButton) {
    submitDownpaymentButton.disabled = true;
  }

  try {
    const submittedVenueName = pendingReservationVenueName || "Your reservation";
    const reservationFormData = new FormData();

    Object.entries({
      ...pendingReservationPayload,
      downpaymentRequired: "1",
      downpaymentAmount: String(requiredDownpaymentAmount),
      downpaymentMethod: selectedMethod,
    }).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        reservationFormData.append(key, String(value));
      }
    });
    reservationFormData.append("downpaymentReceipt", receiptFile);
    reservationFormData.append("idVerification", idFile);

    const createdReservation = await window.ChopHouseApi.createReservation(reservationFormData);
    const reservationId = createdReservation?.id ? `#${createdReservation.id}` : "your new ID";
    const emailNote = createdReservation?.receivedEmailSent
      ? " We also sent this Reservation ID to your email."
      : " Please save this Reservation ID. Email delivery depends on the local mail setup.";

    await Promise.all([refreshInventoryState(), refreshReservationState()]);
    resetReservationFormAfterSubmit();
    closeDownpaymentModal();

    reservationMessage.textContent =
      `${submittedVenueName} was blocked with your downpayment details. Your Reservation ID is ${reservationId}.${emailNote}`;
  } catch (error) {
    if (downpaymentMessage) {
      downpaymentMessage.textContent =
        error.message || "Reservation request failed. Please try again.";
    }
    populateVenueOptions();
  } finally {
    if (submitDownpaymentButton) {
      submitDownpaymentButton.disabled = false;
    }
  }
}

closeDownpaymentModalButton?.addEventListener("click", closeDownpaymentModal);
cancelDownpaymentModalButton?.addEventListener("click", closeDownpaymentModal);
downpaymentModal?.addEventListener("click", (event) => {
  if (event.target === downpaymentModal) {
    closeDownpaymentModal();
  }
});
downpaymentForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  await submitPendingReservationWithDownpayment();
});

if (reservationForm) {
  reservationForm.addEventListener(
    "click",
    (event) => {
      if (hasAcceptedReservationTerms()) {
        return;
      }

      const control = event.target.closest("input, button, select, .time-picker__trigger");
      if (!control || !reservationForm.contains(control) || control === reservationTermsAccepted) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      promptReservationTerms(control === reservationSubmitButton);
    },
    true
  );

  reservationForm.addEventListener(
    "focusin",
    (event) => {
      if (hasAcceptedReservationTerms()) {
        return;
      }

      const control = event.target.closest("input, button, select, .time-picker__trigger");
      if (!control || !reservationForm.contains(control) || control === reservationTermsAccepted) {
        return;
      }

      event.preventDefault();
      promptReservationTerms(control === reservationSubmitButton);
    },
    true
  );

  reservationSubmitButton?.addEventListener("click", (event) => {
    if (hasAcceptedReservationTerms()) {
      return;
    }

    event.preventDefault();
    promptReservationTerms(true);
  });

  reservationForm.addEventListener("input", updateReservationSubmitLabel);
  reservationForm.addEventListener("change", updateReservationSubmitLabel);

  reservationForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const formData = new FormData(reservationForm);
    const selectedVenue = String(formData.get("venueName") || "").trim();
    const selectedVenueTypeRaw = String(formData.get("venueType") || "").trim();
    const selectedVenueType = normalizeVenueType(selectedVenueTypeRaw);
    const selectedDate = String(formData.get("date") || "");
    const selectedTime = String(formData.get("time") || "");
    const selectedStartTime = String(formData.get("startTime") || "");
    const selectedEndTime = String(formData.get("endTime") || "");
    const reservations = loadReservations();
    const selectedVenueOption = venueOptions[selectedVenueTypeRaw]?.find(
      (item) => item.name === selectedVenue
    );

    if (!hasAcceptedReservationTerms()) {
      promptReservationTerms(true);
      return;
    }

    if (!selectedVenueTypeRaw) {
      reservationMessage.textContent = "Select a venue type first.";
      return;
    }

    if (!selectedDate) {
      reservationMessage.textContent = "Select a reservation date first.";
      return;
    }

    if (enforceReservationDateLimit()) {
      reservationMessage.textContent = "Choose a valid date for your reservation.";
      reservationDateField?.focus();
      populateVenueOptions();
      return;
    }

    if (selectedVenueType === "room") {
      if (!selectedStartTime || !selectedEndTime) {
        reservationMessage.textContent = "Select both the start time and end time for the KTV room.";
        return;
      }

      if (!isValidTimeRange(selectedStartTime, selectedEndTime)) {
        reservationMessage.textContent =
          "Choose an end time that is later than the KTV room start time.";
        return;
      }
    } else if (!selectedTime) {
      reservationMessage.textContent = "Select a scheduled time first.";
      return;
    }

    if (!selectedVenue) {
      reservationMessage.textContent = "Choose an available VIP lounge or room first.";
      return;
    }

    const blockReason = selectedVenueOption
      ? getPublicVenueBlockReason(
          selectedVenueOption,
          reservations,
          selectedVenueTypeRaw,
          selectedDate,
          selectedTime,
          selectedStartTime,
          selectedEndTime
        )
      : "";

    if (blockReason === "occupied") {
      reservationMessage.textContent =
        selectedVenueType === "room"
          ? "That KTV room is already occupied and cannot be reserved right now."
          : "That VIP lounge is already occupied and cannot be reserved right now.";
      populateVenueOptions();
      return;
    }

    if (blockReason === "reserved") {
      reservationMessage.textContent =
        selectedVenueType === "room"
          ? "That KTV room is already reserved and cannot accept another customer request right now."
          : "That VIP lounge is already reserved and cannot accept another customer request right now.";
      populateVenueOptions();
      return;
    }

    if (blockReason === "maintenance") {
      reservationMessage.textContent =
        selectedVenueType === "room"
          ? "That KTV room is under maintenance and cannot be reserved right now."
          : "That VIP lounge is under maintenance and cannot be reserved right now.";
      populateVenueOptions();
      return;
    }

    if (
      hasApprovedConflict(reservations, {
        venueType: selectedVenueType,
        venueName: selectedVenue,
        date: selectedDate,
        time: selectedVenueType === "room" ? selectedStartTime : selectedTime,
        startTime: selectedVenueType === "room" ? selectedStartTime : selectedTime,
        endTime: selectedVenueType === "room" ? selectedEndTime : "",
      })
    ) {
      reservationMessage.textContent = getApprovedConflictMessage({
        venueType: selectedVenueType,
      });
      populateVenueOptions();
      return;
    }

    if (!selectedVenueOption?.id) {
      reservationMessage.textContent = "The selected venue is missing from the backend inventory.";
      return;
    }

    reservationMessage.textContent = "Complete the required downpayment to block this reservation.";
    openDownpaymentModal(
      {
        customerName: String(formData.get("name") || "").trim(),
        customerEmail: String(formData.get("email") || "").trim(),
        customerPhone: String(formData.get("phone") || "").trim(),
        venueId: selectedVenueOption.id,
        reservationDate: selectedDate,
        scheduledTime: selectedVenueType === "room" ? undefined : selectedTime,
        startTime: selectedVenueType === "room" ? selectedStartTime : undefined,
        endTime: selectedVenueType === "room" ? selectedEndTime : undefined,
        guestCount: Number(formData.get("guests") || 0),
      },
      selectedVenue
    );
  });
}

async function initializeFrontendState() {
  await Promise.all([refreshInventoryState(), refreshReservationState(), loadPaymentSettings()]);
  renderInventory();
  populateVenueTypeOptions();
  populateReservationTimeOptions();
  populateReservationStartTimeOptions();
  populateReservationEndTimeOptions();
  syncReservationTimeMode();
  resetReservationTermsAcceptance();
  updateReservationSubmitLabel();
  setInterval(async () => {
    await Promise.all([refreshInventoryState(), refreshReservationState()]);
    renderInventory();
  }, liveStatusRefreshIntervalMs);
}

initializeFrontendState();
