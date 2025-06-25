const API_PROXY = "https://ratp-proxy.hippodrome-proxy42.workers.dev/?url=";

const STOP_POINTS = {
  rer: {
    name: "RER A Joinville-le-Pont",
    realtimeUrl: API_PROXY + "https://prim.iledefrance-mobilites.fr/marketplace/stop-monitoring?MonitoringRef=STIF:StopPoint:Q:43135:",
    scheduleUrl: API_PROXY + "https://prim.iledefrance-mobilites.fr/marketplace/v2/navitia/stop_points/stop_point:IDFM:monomodalStopPlace:43135/route_schedules?line=line:IDFM:C01742&from_datetime=",
    icon: "🚆"
  },
  bus77: {
    name: "BUS 77 Hippodrome de Vincennes",
    realtimeUrl: API_PROXY + "https://prim.iledefrance-mobilites.fr/marketplace/stop-monitoring?MonitoringRef=STIF:StopPoint:Q:463641:",
    scheduleUrl: API_PROXY + "https://prim.iledefrance-mobilites.fr/marketplace/v2/navitia/stop_points/stop_point:IDFM:463640/route_schedules?line=line:IDFM:C02251&from_datetime=",
    icon: "🚌"
  },
  bus201: {
    name: "BUS 201 Ecole du Breuil",
    realtimeUrl: API_PROXY + "https://prim.iledefrance-mobilites.fr/marketplace/stop-monitoring?MonitoringRef=STIF:StopPoint:Q:463644:",
    scheduleUrl: API_PROXY + "https://prim.iledefrance-mobilites.fr/marketplace/v2/navitia/stop_points/stop_point:IDFM:463646/route_schedules?line=line:IDFM:C01219&from_datetime=",
    icon: "🚌"
  }
};

const VELIB_IDS = {
  vincennes: "1074333296",
  breuil: "508042092"
};

const VEHICLE_JOURNEY_CACHE = {}; // { ref: stops[] }

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(Erreur HTTP ${res.status});
  return await res.json();
}

// Formatage date/heure
function updateDateTime() {
  const now = new Date();
  document.getElementById("current-date").textContent = now.toLocaleDateString("fr-FR", { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  document.getElementById("current-time").textContent = now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

// format '2025-06-25T19:36:00.000Z' > '19:36'
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
  if (diff < 1.5) return <span class='imminent'>(passage imminent)</span>;
  return <span class='temps'>(${Math.round(diff)} min)</span>;
}

// --- NEW: récupère les arrêts via Navitia vehicle_journeys/stop_points (1 seule fois par ref) ---
async function fetchStopsForJourney(vehicleJourneyRef) {
  if (!vehicleJourneyRef) return [];
  if (VEHICLE_JOURNEY_CACHE[vehicleJourneyRef]) return VEHICLE_JOURNEY_CACHE[vehicleJourneyRef];
  const url = API_PROXY + "https://prim.iledefrance-mobilites.fr/marketplace/v2/navitia/vehicle_journeys/" + encodeURIComponent(vehicleJourneyRef) + "/stop_points";
  try {
    const data = await fetchJSON(url);
    const stops = data.stop_points?.map(sp => sp.name) || [];
    VEHICLE_JOURNEY_CACHE[vehicleJourneyRef] = stops;
    return stops;
  } catch (e) {
    // 404 si train supprimé, quota etc.
    console.warn("Erreur fetchStopsForJourney", e);
    VEHICLE_JOURNEY_CACHE[vehicleJourneyRef] = ["Arrêts indisponibles"];
    return ["Arrêts indisponibles"];
  }
}

// Regroupement par direction
function groupByDirection(data) {
  const result = {};
  data.forEach(d => {
    const dir = getDestinationName(d.MonitoredVehicleJourney.DirectionName);
    if (!result[dir]) result[dir] = [];
    result[dir].push(d);
  });
  return result;
}

// Rendu de chaque bloc d'arrêt
async function renderDepartures(id, title, data, icon, first, last) {
  const el = document.getElementById(id);
  let html = <div class='title-line'><span class='icon-inline'>${icon}</span> ${title}</div>;
  if (!data || data.length === 0) {
    html += <ul><li>Aucun passage à venir</li></ul>;
  } else {
    const grouped = groupByDirection(data);
    for (const dir in grouped) {
      html += <div class='direction-title'>Direction ${dir}</div><ul>;
      // Pour chaque direction, 4 prochains passages
      for (const d of grouped[dir].slice(0, 4)) {
        const mvj = d.MonitoredVehicleJourney;
        const call = mvj.MonitoredCall;
        const expected = call.ExpectedDepartureTime;
        const aimed = call.AimedDepartureTime;
        const isLast = mvj.FirstOrLastJourney?.value === "LAST_SERVICE_OF_DAY";
        const delay = expected && aimed && expected !== aimed
          ? <span class='delay'>(+${Math.round((new Date(expected) - new Date(aimed)) / 60000)} min)</span> : "";
        const ref = mvj.FramedVehicleJourneyRef?.DatedVehicleJourneyRef;
        // --- ARRETS DESSERVIS ---
        let stops = "";
        if (ref) {
          stops = VEHICLE_JOURNEY_CACHE[ref]
            ? VEHICLE_JOURNEY_CACHE[ref].join(" – ")
            : "<span class='loading'>Chargement arrêts…</span>";
          // Déclenche l'appel si pas déjà fait
          if (!VEHICLE_JOURNEY_CACHE[ref]) {
            fetchStopsForJourney(ref).then(arrs => {
              // Force le refresh du bloc seulement si il existe encore
              if (document.getElementById(id)) renderDepartures(id, title, data, icon, first, last);
            });
          }
        }
        html += `<li>▶ ${formatTime(expected)} ${minutesUntil(expected)} ${delay} ${isLast ? "<span class='last-train'>(dernier passage)</span>" : ""}
          <div class='defile-arrets'>${stops}</div>
        </li>`;
      }
      html += </ul>;
    }
  }
  html += <div class='schedule-extremes'>Premier départ : ${first || "-"}<br>Dernier départ : ${last || "-"}</div>;
  el.innerHTML = html;
}

// Appels principaux pour chaque arrêt/lignes
async function fetchTransport(stopKey, elementId) {
  try {
    const data = await fetchJSON(STOP_POINTS[stopKey].realtimeUrl);
    const visits = data?.Siri?.ServiceDelivery?.StopMonitoringDelivery?.[0]?.MonitoredStopVisit || [];
    await renderDepartures(
      elementId,
      STOP_POINTS[stopKey].name,
      visits,
      STOP_POINTS[stopKey].icon,
      localStorage.getItem(${stopKey}-first),
      localStorage.getItem(${stopKey}-last)
    );
  } catch (e) {
    console.error(Erreur fetchTransport ${stopKey}:, e);
    document.getElementById(elementId).innerHTML =
      <div class='title-line'><span class='icon-inline'>${STOP_POINTS[stopKey].icon}</span> ${STOP_POINTS[stopKey].name}</div><div class='error'>Données indisponibles</div>;
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
        const fmt = t => ${t.slice(0, 2)}:${t.slice(2, 4)};
        localStorage.setItem(${key}-first, fmt(times[0]));
        localStorage.setItem(${key}-last, fmt(times[times.length - 1]));
      }
    } catch (e) {
      console.error(Erreur fetchSchedulesOncePerDay ${key}:, e);
    }
  }
  localStorage.setItem("schedule-day", today);
}

// VELIB (toujours via proxy)
async function fetchVelib(stationId, elementId) {
  try {
    const url = API_PROXY + "https://prim.iledefrance-mobilites.fr/marketplace/velib/station_status.json";
    const data = await fetchJSON(url);
    const station = data.data.stations.find(s => s.station_id == stationId);
    if (!station) throw new Error("Station Vélib non trouvée");
    const mechanical = station.num_bikes_available_types.find(b => b.mechanical !== undefined)?.mechanical || 0;
    const ebike = station.num_bikes_available_types.find(b => b.ebike !== undefined)?.ebike || 0;
    const free = station.num_docks_available || 0;
    document.getElementById(elementId).innerHTML = `
      <div class='title-line'><span class='icon-inline'>🚲</span> Vélib'</div>
      🚲 Mécaniques : ${mechanical}<br>
      ⚡ Électriques : ${ebike}<br>
      🅿 Places libres : ${free}
    `;
  } catch (e) {
    console.error("Erreur Vélib:", e);
    document.getElementById(elementId).innerHTML = `
      <div class='title-line'><span class='icon-inline'>🚲</span> Vélib'</div>
      <div class='error'>Erreur chargement</div>
    `;
  }
}

function refreshAll() {
  updateDateTime();
  fetchSchedulesOncePerDay();
  fetchTransport("rer", "rer-content");
  fetchTransport("bus77", "bus77-content");
  fetchTransport("bus201", "bus201-content");
  fetchVelib(VELIB_IDS.vincennes, "velib-vincennes");
  fetchVelib(VELIB_IDS.breuil, "velib-breuil");
}

setInterval(refreshAll, 60000);
refreshAll();
