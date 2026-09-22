const statusForm = document.getElementById("reservation-status-form");
const statusEmailField = document.getElementById("status-email");
const statusReservationIdField = document.getElementById("status-reservation-id");
const statusReferenceField = document.getElementById("status-reference");
const statusMessage = document.getElementById("reservation-status-message");
const statusResult = document.getElementById("reservation-status-result");

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeVenueType(value) {
  const normalizedValue = String(value || "").trim().toLowerCase();
  return normalizedValue === "room" || normalizedValue === "ktv" ? "KTV Room" : "VIP Lounge";
}

function normalizeStatus(value) {
  return String(value || "pending").trim().toLowerCase();
}

function formatReservationStatus(value) {
  const labels = {
    pending: "Pending",
    approved: "Approved",
    cancelled: "Cancelled",
    checked_in: "Checked In",
    checked_out: "Checked Out",
    late: "Late",
    no_show: "No Show",
  };

  return labels[normalizeStatus(value)] || "Pending";
}

function formatDate(value) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value || "Schedule not set";
  }

  return date.toLocaleDateString([], {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(value) {
  const [hoursText, minutesText] = String(value || "").split(":");
  const hours = Number(hoursText);
  const minutes = Number(minutesText);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return value || "";
  }

  const suffix = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 || 12;
  return `${hour12}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

function formatSchedule(reservation) {
  const venueType = normalizeVenueType(reservation.venue?.venueType);
  const date = formatDate(reservation.reservationDate);
  if (venueType === "KTV Room") {
    return `${date} | ${formatTime(reservation.startTime)} - ${formatTime(reservation.endTime)}`;
  }

  return `${date} | ${formatTime(reservation.scheduledTime)}`;
}

function formatPaymentStatus(value) {
  const status = normalizeStatus(value);
  const labels = {
    pending: "Payment pending review",
    verified: "Payment verified",
    rejected: "Payment rejected",
    unpaid: "No payment recorded",
  };

  return labels[status] || "No payment recorded";
}

function setMessage(message, tone = "") {
  statusMessage.classList.remove("is-success", "is-error");
  statusMessage.textContent = message;
  if (tone) {
    statusMessage.classList.add(tone);
  }
}

function renderReservationStatus(reservation) {
  const status = normalizeStatus(reservation.status);
  const paymentStatus = normalizeStatus(reservation.downpaymentStatus);
  const venue = reservation.venue || {};

  statusResult.hidden = false;
  statusResult.innerHTML = `
    <article class="status-result-card">
      <div class="status-result-card__top">
        <div>
          <span>Reservation #${escapeHtml(reservation.id)}</span>
          <h2>${escapeHtml(reservation.customerName || "Guest")}</h2>
        </div>
        <span class="status-result-pill status-result-pill--${escapeHtml(status)}">
          ${escapeHtml(formatReservationStatus(status))}
        </span>
      </div>
      <dl class="status-result-grid">
        <div>
          <dt>Venue</dt>
          <dd>${escapeHtml(venue.name || "Venue not selected")} (${escapeHtml(
            normalizeVenueType(venue.venueType)
          )})</dd>
        </div>
        <div>
          <dt>Schedule</dt>
          <dd>${escapeHtml(formatSchedule(reservation))}</dd>
        </div>
        <div>
          <dt>Guests</dt>
          <dd>${escapeHtml(reservation.guestCount || "0")}</dd>
        </div>
        <div>
          <dt>Downpayment</dt>
          <dd>${escapeHtml(formatPaymentStatus(paymentStatus))}</dd>
        </div>
        <div>
          <dt>Reference</dt>
          <dd>${escapeHtml(reservation.downpaymentReference || "Not provided")}</dd>
        </div>
        <div>
          <dt>Last Updated</dt>
          <dd>${escapeHtml(new Date(reservation.updatedAt || "").toLocaleString())}</dd>
        </div>
      </dl>
    </article>
  `;
}

if (statusForm) {
  statusForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = statusEmailField.value.trim();
    const reservationId = statusReservationIdField.value.trim();
    const reference = statusReferenceField.value.trim();

    statusResult.hidden = true;
    statusResult.innerHTML = "";

    if (!email || (!reservationId && !reference)) {
      setMessage("Enter your email and reservation ID or GCash reference number.", "is-error");
      return;
    }

    setMessage("Checking reservation status...");

    try {
      const reservation = await window.ChopHouseApi.lookupReservationStatus({
        email,
        reservationId,
        reference,
      });
      renderReservationStatus(reservation);
      setMessage("Reservation found.", "is-success");
    } catch (error) {
      setMessage(error.message || "Reservation status could not be loaded.", "is-error");
    }
  });
}
