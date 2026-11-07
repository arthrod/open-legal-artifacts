import "./styles.css";
import { render } from "./router.js";

window.addEventListener("hashchange", render);
window.addEventListener("DOMContentLoaded", render);
