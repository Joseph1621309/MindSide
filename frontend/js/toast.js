function ensureToastWrap() {
  let wrap = document.querySelector("#toast-container, .toast-wrap");
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.id = "toast-container";
    wrap.className = "toast-wrap";
    wrap.setAttribute("role", "status");
    wrap.setAttribute("aria-live", "polite");
    document.body.appendChild(wrap);
  }
  return wrap;
}
function toast(message, type = "info") {
  const wrap = ensureToastWrap();
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = message;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 4200);
}
