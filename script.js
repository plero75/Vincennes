// Script principal – simplifié
const API_KEY = "pKjUX6JVy3uLQJXsT0cfkFbsPJZUsKob";
const PROXY = "https://ratp-proxy.hippodrome-proxy42.workers.dev/?url=";

document.addEventListener("DOMContentLoaded", () => {
  const now = new Date();
  document.getElementById("datetime").textContent = 
    `Nous sommes le ${now.toLocaleDateString("fr-FR", {weekday:'long', year:'numeric', month:'long', day:'numeric'})}, il est ${now.getHours()}h${now.getMinutes().toString().padStart(2,'0')}`;
  document.getElementById("last-update").textContent = `Dernière mise à jour : ${now.toLocaleString("fr-FR")}`;
});
