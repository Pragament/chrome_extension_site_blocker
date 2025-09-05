// blocked.js
document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(location.search);
  const orig = params.get("orig");
  if (orig) {
    const el = document.getElementById("orig");
    el.innerHTML =
      "<strong>Attempted URL:</strong><br/><span class='url'>" +
      decodeURIComponent(orig) +
      "</span>";
  }
  document.getElementById("goBack").addEventListener("click", () => {
    history.back();
  });
});
