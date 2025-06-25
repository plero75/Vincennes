const STOP_POINTS = {
  rer: {
    name: "RER A Joinville-le-Pont",
    realtimeUrl: "https://ratp-proxy.hippodrome-proxy42.workers.dev/?url=https://prim.iledefrance-mobilites.fr/marketplace/stop-monitoring?MonitoringRef=STIF:StopPoint:Q:43135:",
    scheduleUrl: "https://ratp-proxy.hippodrome-proxy42.workers.dev/?url=https://prim.iledefrance-mobilites.fr/marketplace/v2/navitia/stop_points/stop_point:IDFM:monomodalStopPlace:43135/route_schedules?line=line:IDFM:C01742&from_datetime=",
    icon: "img/picto-rer-a.svg"
  },
  bus77: {
    name: "BUS 77 Hippodrome de Vincennes",
    realtimeUrl: "https://ratp-proxy.hippodrome-proxy42.workers.dev/?url=https://prim.iledefrance-mobilites.fr/marketplace/stop-monitoring?MonitoringRef=STIF:StopPoint:Q:463641:",
    scheduleUrl: "https://ratp-proxy.hippodrome-proxy42.workers.dev/?url=https://prim.iledefrance-mobilites.fr/marketplace/v2/navitia/stop_points/stop_point:IDFM:463640/route_schedules?line=line:IDFM:C02251&from_datetime=",
    icon: "img/picto-bus.svg"
  },
  bus201: {
    name: "BUS 201 Ecole du Breuil",
    realtimeUrl: "https://ratp-proxy.hippodrome-proxy42.workers.dev/?url=https://prim.iledefrance-mobilites.fr/marketplace/stop-monitoring?MonitoringRef=STIF:StopPoint:Q:463644:",
    scheduleUrl: "https://ratp-proxy.hippodrome-proxy42.workers.dev/?url=https://prim.iledefrance-mobilites.fr/marketplace/v2/navitia/stop_points/stop_point:IDFM:463646/route_schedules?line=line:IDFM:C01219&from_datetime=",
    icon: "img/picto-bus.svg"
  }
};

const VELIB_IDS = {
  vincennes: "1074333296",
  breuil: "508042092"
};

const stopsCache = {};

function updateDateTime() {
  const now = new Date();
  document.getElementById("display-date").textContent =
    "Nous sommes le " + now.toLocaleDateString("fr-FR", {weekday: "long", year: "numeric", month: "long", day: "numeric"});
  document.getElementById("display-time").textContent =
    now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function updateLastUpdate(id) {
  const now = new Date();
  document.getElementById(id).textContent =
    "Dernière mise à jour : " + now.toLocaleString("fr-FR", {hour: "2-digit", minute: "2-digit", second: "2-digit"});
}

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Erreur HTTP ${res.status}`);
  return await res.json();
}

function formatTime(iso, withSeconds = false) {
  if (!iso) return "-";
  const date = new Date(iso);
  if (isNaN(date.getTime())) return "-";
  const options = withSeconds
    ? { hour: "2-digit", minute: "2-digit", second: "2-digit" }
    : { hour: "2-digit", minute: "2-digit" };
  return date.toLocaleTimeString("fr-FR", options);
}

function getDestinationName(d) {
  if (!d) return "Destination inconnue";
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d[0]?.value || "Destination inconnue";
  if (typeof d === "object") return d.value || "Destination inconnue";
  return "Destination inconnue";
}

function minutesUntil(dateTimeStr) {
  const now = new Date();
  const target = new Date(dateTimeStr);
  const diff = (target - now) / 60000;
  if (isNaN(diff)) return "";
  if (diff < 1.5) return `<span class='imminent'>(passage imminent)</span>`;
  return `<span class='temps'> (${Math.round(diff)} min)</span>`;
}

// Utilitaire pour la clé unique du voyage
function getVehicleJourneyRef(mvj) {
  return mvj?.FramedVehicleJourneyRef?.DatedVehicleJourneyRef || null;
}

// Appel Navitia pour arrêts (avec cache JS)
async function getStopsForPassage(mvj) {
  const ref = getVehicleJourneyRef(mvj);
  if (!ref) return [];
  if (stopsCache[ref]) return stopsCache[ref];
  try {
    const url = `https://ratp-proxy.hippodrome-proxy42.workers.dev/?url=https://prim.iledefrance-mobilites.fr/marketplace/v2/navitia/vehicle_journeys/${encodeURIComponent(ref)}/stop_points`;
    const data = await fetchJSON(url);
    const stops = (data.stop_points || []).map(sp => sp.name);
    stopsCache[ref] = stops;
    return stops;
  } catch (e) {
    stopsCache[ref] = [];
    return [];
  }
}

async function renderDepartures(id, title, data, icon, first, last, infoTrafic = null) {
  const el = document.getElementById(id);
  let html = `<div class='title-line'><img src='${icon}' class='icon-inline'>${title}</div>`;
  if (infoTrafic) html += `<div class='info-trafic'>${infoTrafic}</div>`;
  if (!data || data.length === 0) {
    html += `<ul><li>Aucun passage à venir</li></ul>`;
  } else {
    // Grouper par direction
    const grouped = {};
    data.forEach(d => {
      const dir = getDestinationName(d.MonitoredVehicleJourney.DirectionName);
      if (!grouped[dir]) grouped[dir] = [];
      grouped[dir].push(d);
    });
    for (const dir in grouped) {
      html += `<h4 class='direction-title'>Direction ${dir}</h4><ul>`;
      for (const d of grouped[dir].slice(0, 4)) {
        const mvj = d.MonitoredVehicleJourney;
        const ref = getVehicleJourneyRef(mvj);
        const call = mvj.MonitoredCall;
        const expected = call.ExpectedDepartureTime || call.AimedDepartureTime;
        const aimed = call.AimedDepartureTime;
        const isLast = mvj.FirstOrLastJourney?.value === "LAST_SERVICE_OF_DAY";
        const delay = expected && aimed && expected !== aimed ?
          `<span class='delay'>(+${Math.round((new Date(expected) - new Date(aimed)) / 60000)} min)</span>` : "";

        // "Squelette" pour arrêts, rempli en asynchrone après
        html += `<li>
          ▶ ${formatTime(expected)}${minutesUntil(expected)} ${delay} ${isLast ? "<span class='last-train'>(dernier train)</span>" : ""}
          <span id="arrets-train-${ref}" class="liste-arrets defile-arrets"></span>
        </li>`;

        // Appel asynchrone arrêts : affiché après rendu (évite X appels)
        getStopsForPassage(mvj).then(stops => {
          const elt = document.getElementById(`arrets-train-${ref}`);
          if (elt) elt.textContent = stops.length ? stops.join(" → ") : "";
        });
      }
      html += `</ul>`;
    }
  }
  html += `<div class='schedule-extremes'>Premier départ : ${first || "-"}<br>Dernier départ : ${last || "-"}</div>`;
  el.innerHTML = html;
  updateLastUpdate(`${id}-maj`);
}

async function fetchTransport(stopKey, elementId) {
  try {
    const data = await fetchJSON(STOP_POINTS[stopKey].realtimeUrl);
    const visits = data?.Siri?.ServiceDelivery?.StopMonitoringDelivery?.[0]?.MonitoredStopVisit || [];
    // Info trafic possible via disruptions, à compléter par une autre API si besoin
    await renderDepartures(
      elementId,
      STOP_POINTS[stopKey].name,
      visits,
      STOP_POINTS[stopKey].icon,
      localStorage.getItem(`${stopKey}-first`),
      localStorage.getItem(`${stopKey}-last`),
      null // info trafic si dispo
    );
  } catch (e) {
    document.getElementById(elementId).innerHTML =
      `<div class='title-line'><img src='${STOP_POINTS[stopKey].icon}' class='icon-inline'>${STOP_POINTS[stopKey].name}</div><div class='error'>Données indisponibles</div>`;
  }
}

async function fetchSchedulesOncePerDay() {
  const today = new Date().toISOString().slice(0, 10);
  if (localStorage.getItem("schedule-day") === today) return;

  for (let key in STOP_POINTS) {
    try {
      const url = STOP_POINTS[key].scheduleUrl + today.replace(/-/g, "") + "T000000";
      const data = await fetchJSON(url);
      const rows = data.route_schedules?.[0]?.table?.rows || [];
      const times = [];
      rows.forEach(row => {
        row.stop_date_times?.forEach(sdt => {
          if (sdt.departure_time) times.push(sdt.departure_time);
        });
      });
      times.sort();
      if (times.length) {
        const fmt = t => `${t.slice(0, 2)}:${t.slice(2, 4)}`;
        localStorage.setItem(`${key}-first`, fmt(times[0]));
        localStorage.setItem(`${key}-last`, fmt(times[times.length - 1]));
      }
    } catch (e) {}
  }
  localStorage.setItem("schedule-day", today);
}

async function fetchVelib(stationId, elementId) {
  try {
    const url = "https://prim.iledefrance-mobilites.fr/marketplace/velib/station_status.json";
    const data = await fetchJSON(url);
    const station = data.data.stations.find(s => s.station_id == stationId);
    if (!station) throw new Error("Station Vélib non trouvée");
    const mechanical = station.num_bikes_available_types.find(b => b.mechanical !== undefined)?.mechanical || 0;
    const ebike = station.num_bikes_available_types.find(b => b.ebike !== undefined)?.ebike || 0;
    const free = station.num_docks_available || 0;
    document.getElementById(elementId).innerHTML = `
      <div class='title-line'><img src='img/picto-velib.svg' class='icon-inline'>Vélib'</div>
      🚲 Mécaniques : ${mechanical}<br>
      ⚡ Électriques : ${ebike}<br>
      🅿️ Places libres : ${free}
      <br><span class='schedule-extremes' id='${elementId}-maj'></span>
    `;
    updateLastUpdate(`${elementId}-maj`);
  } catch (e) {
    document.getElementById(elementId).innerHTML = `
      <div class='title-line'><img src='img/picto-velib.svg' class='icon-inline'>Vélib'</div>
      <div class='error'>Erreur chargement</div>
    `;
  }
}

async function fetchWeather() {
  try {
    const url = "https://api.open-meteo.com/v1/forecast?latitude=48.824&longitude=2.452&current_weather=true";
    const data = await fetchJSON(url);
    const w = data.current_weather;
    document.getElementById("weather-content").innerHTML =
      `<div class='title-line'><img src='img/picto-meteo.svg' class='icon-inline'>Météo</div>
       ${w.temperature}°C · Vent ${w.windspeed} km/h · ${w.weathercode || "Ciel dégagé"}<br>
       <span class='schedule-extremes' id='weather-content-maj'></span>
      `;
    updateLastUpdate('weather-content-maj');
  } catch {
    document.getElementById("weather-content").innerHTML = "🌤 Météo indisponible";
  }
}

// Bloc Info trafic Petit Futé (à adapter à ton contenu)
function setInfoTraficPetitFute() {
  document.getElementById("info-trafic-petitfute").innerHTML = `
    <div class='title-line'><img src='img/picto-bus.svg' class='icon-inline'>Info Trafic Petit Futé</div>
    <div>
      <b>Travaux, ralentissements, plans B</b> : consultez le site officiel <a href="https://www.ratp.fr/" style="color:#ffd900">ratp.fr</a> ou l’appli IDFM.
      <br><span class='schedule-extremes' id='info-trafic-petitfute-maj'></span>
    </div>
  `;
  updateLastUpdate('info-trafic-petitfute-maj');
}

function refreshAll() {
  updateDateTime();
  fetchSchedulesOncePerDay();
  fetchTransport("rer", "rer-content");
  fetchTransport("bus77", "bus77-content");
  fetchTransport("bus201", "bus201-content");
  fetchVelib(VELIB_IDS.vincennes, "velib-vincennes");
  fetchVelib(VELIB_IDS.breuil, "velib-breuil");
  fetchWeather();
  setInfoTraficPetitFute();
}

setInterval(refreshAll, 60000);
refreshAll();
