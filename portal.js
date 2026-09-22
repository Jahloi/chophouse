const portalUser = document.getElementById("portal-user");
const storedUser = sessionStorage.getItem("portalUserEmail");

if (portalUser && storedUser) {
  portalUser.textContent = storedUser;
}
