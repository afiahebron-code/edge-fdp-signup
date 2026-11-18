// Address of the Cloudflare Worker that stores sign-ups.
// Same address as the pages when served from Cloudflare; set the full Worker address for GitHub Pages.
window.FDP_API = location.hostname.endsWith("github.io") ? "https://edge-fdp-signup.REPLACE.workers.dev" : "";

// Lagos time (WAT, UTC+1, no daylight saving), shown to hundredths of a second.
window.lagosTime = function (ms, withDate) {
  const d = new Date(ms + 3600000); // shift to UTC+1, then read UTC fields
  let h = d.getUTCHours(); const ap = h >= 12 ? "PM" : "AM"; h = h % 12 || 12;
  const pad = (n, w = 2) => String(n).padStart(w, "0");
  const t = `${h}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}.${pad(Math.floor(d.getUTCMilliseconds() / 10))} ${ap}`;
  if (!withDate) return t;
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]}, ${t}`;
};
window.lagosShort = function (ms) {
  const d = new Date(ms + 3600000);
  let h = d.getUTCHours(); const ap = h >= 12 ? "PM" : "AM"; h = h % 12 || 12;
  const days = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"], months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${days[d.getUTCDay()]} ${d.getUTCDate()} ${months[d.getUTCMonth()]}, ${h}:${String(d.getUTCMinutes()).padStart(2,"0")} ${ap} Lagos time`;
};

// Test mode: add ?test to any page address. Test sign-ups go to a separate list the class never sees,
// with its own opening time set from the admin page.
window.FDP_TEST = new URLSearchParams(location.search).has("test");
window.apiUrl = function (path) {
  if (!FDP_TEST) return FDP_API + path;
  return FDP_API + path + (path.includes("?") ? "&" : "?") + "mode=test";
};
document.addEventListener("DOMContentLoaded", function () {
  if (!FDP_TEST) return;
  document.querySelectorAll("a[href$='.html'], a[href*='.html?']").forEach(function (a) {
    a.href = a.getAttribute("href") + (a.getAttribute("href").includes("?") ? "&" : "?") + "test";
  });
  var b = document.createElement("div");
  b.className = "testbar";
  b.textContent = "TEST MODE — same pages as the class link, but a separate list the class can't see.";
  document.body.prepend(b);
});
