// public/js/nav-active.js
(function () {
  // Resaltar el link activo según la URL
  const here = location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".navbar-nav .nav-link").forEach(a => {
    const href = a.getAttribute("href");
    if (!href) return;
    const last = href.split("/").pop();
    if (last === here) a.classList.add("active");
  });

  // Mostrar/ocultar elementos según sesión
  if (window.Auth?.applyAuthVisibility) {
    window.Auth.applyAuthVisibility();
  }

  // Botones de "Cerrar sesión"
  if (window.Auth?.wireLogoutButtons) {
    window.Auth.wireLogoutButtons();
  }

  console.log("[nav-active] ready");
})();
