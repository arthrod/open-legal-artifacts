import "./styles.css";
import { render } from "./router.js";

// Keep --header-h in sync with the real header height (nav wraps on mobile),
// so the sticky index toolbar pins directly under it. CSS fallback: 3.4rem.
const header = document.querySelector<HTMLElement>(".site-header");
if (header) {
  const setHeaderH = () =>
    document.documentElement.style.setProperty("--header-h", `${header.offsetHeight}px`);
  setHeaderH();
  new ResizeObserver(setHeaderH).observe(header);
}

window.addEventListener("hashchange", render);
window.addEventListener("DOMContentLoaded", render);
