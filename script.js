// =======================
//  CONFIGURATION
// =======================

const API_KEY = "pKjUX6JVy3uLQJXsT0cfkFbsPJZUsKob";
const PROXY = "https://ratp-proxy.hippodrome-proxy42.workers.dev/?url=";
const VELIB_IDS = { vincennes: "1074333296", breuil: "508042092" };
const VEHICLE_JOURNEY_CACHE = {}; // { [DatedVehicleJourneyRef]: [arret1, arret2, ...] }

const STOP_POINTS = {
  rer: {
    name: "RER A Joinville-le-Pont",
    realtimeUrl: PROXY + encodeURIComponent("https://prim.iledefrance-mobilites.fr/marketplace/stop-monitoring?MonitoringRef=STIF:StopPoint:Q:43135:"),
    scheduleUrl: PROXY + encodeURIComponent("https://prim.iledefrance-mobilites.fr/marketplace/v2/navitia/stop_points/stop_point:IDFM:monomodalStopPlace:43135/route_schedules?line=line:IDFM:C01742&from_datetime="),
    icon: "img/picto-rer-a.svg"
  },
  bus77: {
    name: "BUS 77 Hippodrome de Vincennes",
    realtimeUrl: PROXY + encodeURIComponent("https://prim.iledefrance-mobilites.fr/marketplace/stop-monitoring?MonitoringRef=STIF:StopPoint:Q:463641:"),
    scheduleUrl: PROXY + encodeURIComponent("https://prim.iledefrance-mobilites.fr/marketplace/v2/navitia/stop_points/stop_point:IDFM:463640/route_schedules?line=line:IDFM:C02251&from_datetime="),
    icon: "img/picto-bus.svg"
  },
  bus201: {
    name: "BUS 201 Ecole du Breuil",
    realtimeUrl: PROXY + encodeURIComponent("https://prim.iledefrance-mobilites.fr/marketplace/stop-monitoring?MonitoringRef=STIF:StopPoint:Q:463644:"),
    scheduleUrl: PROXY + encodeURIComponent("https://prim.iledefrance-mobilites.fr/marketplace/v2/navitia/stop_points/stop_point:IDFM:463646/route_schedules?line=line:IDFM:C01219&from_datetime="),
    icon: "img/picto-bus.svg"
  }
};

async function fetchJSON(url) {
  const response = await fetch(url, {
    headers: { apikey: API_KEY }
  });
  if (!response.ok) throw new Error("Erreur HTTP " + response.status);
  return await response.json();
}

function formatTime(iso, showSeconds = false) {
  try {
    const date = new Date(iso);
    return date.toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
      second: showSeconds ? "2-digit" : undefined
    });
  } catch {
    return "-";
  }
}

function getVehicleJourneyRef(mvj) {
  return mvj?.FramedVehicleJourneyRef?.DatedVehicleJourneyRef || null;
}

async function fetchStopsForJourney(vehicleJourneyRef) {
  if (VEHICLE_JOURNEY_CACHE[vehicleJourneyRef]) {
    return VEHICLE_JOURNEY_CACHE[vehicleJourneyRef];
  }
  const url = PROXY + encodeURIComponent(`https://prim.iledefrance-mobilites.fr/marketplace/v2/navitia/vehicle_journeys/${vehicleJourneyRef}/stop_points`);
  const res = await fetch(url, { headers: { apikey: API_KEY } });
  if (!res.ok) throw new Error("Erreur stop_points " + res.status);
  const data = await res.json();
  const stops = data.stop_points?.map(s => s.name) || [];
  VEHICLE_JOURNEY_CACHE[vehicleJourneyRef] = stops;
  return stops;
}

function updateDateTime() {
  const now = new Date();
  document.getElementById("current-date").textContent = now.toLocaleDateString("fr-FR", { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  document.getElementById("current-time").textContent = now.toLocaleTimeString("fr-FR", { hour: '2-digit', minute: '2-digit' });
}

function renderDepartures(id, title, departuresByDirection, icon) {
  const el = document.getElementById(id);
  let html = `<div class='title-line'><img src='${icon}' class='icon-inline'>${title}</div>`;
  for (const [direction, list] of Object.entries(departuresByDirection)) {
    html += `<div class='direction-block'><strong>Direction ${direction}</strong><ul>`;
    list.forEach(dep => {
      html += `<li>${dep}</li>`;
    });
    html += `</ul></div>`;
  }
  el.innerHTML = html;
}

async function fetchTransport(stopKey, elementId) {
  const data = await fetchJSON(STOP_POINTS[stopKey].realtimeUrl);
  const visits = data?.Siri?.ServiceDelivery?.StopMonitoringDelivery?.[0]?.MonitoredStopVisit || [];

  const departuresByDirection = {};
  for (let visit of visits) {
    const mvj = visit.MonitoredVehicleJourney;
    const dir = mvj.DirectionName?.[0]?.value || "?";
    const time = formatTime(mvj.MonitoredCall.ExpectedDepartureTime);
    const aimed = mvj.MonitoredCall.AimedDepartureTime;
    const delay = new Date(mvj.MonitoredCall.ExpectedDepartureTime) - new Date(aimed);
    const ref = getVehicleJourneyRef(mvj);
    const stops = ref ? await fetchStopsForJourney(ref).catch(() => []) : [];

    const stopList = stops.length ? stops.join(" → ") : "?";
    const delayInfo = Math.abs(delay) < 90000 ? "Passage imminent" : delay > 120000 ? "+ Retard" : "";
    const label = `▶ ${time} ${delayInfo ? `(${delayInfo})` : ""} → ${mvj.DestinationName?.[0]?.value || "?"} <br><small>${stopList}</small>`;
    if (!departuresByDirection[dir]) departuresByDirection[dir] = [];
    if (departuresByDirection[dir].length < 4) departuresByDirection[dir].push(label);
  }

  renderDepartures(elementId, STOP_POINTS[stopKey].name, departuresByDirection, STOP_POINTS[stopKey].icon);
}

async function fetchVelib(stationId, elementId) {
  try {
    const url = PROXY + encodeURIComponent("https://prim.iledefrance-mobilites.fr/marketplace/velib/station_status.json");
    const data = await fetchJSON(url);
    const s = data.data.stations.find(st => st.station_id == stationId);
    if (!s) throw new Error("station not found");
    const mec = s.num_bikes_available_types.find(t => t.mechanical !== undefined)?.mechanical || 0;
    const elec = s.num_bikes_available_types.find(t => t.ebike !== undefined)?.ebike || 0;
    const free = s.num_docks_available;
    document.getElementById(elementId).innerHTML = `<img src='img/picto-velib.svg' class='icon-inline'> Vélib’<br>🚲 Mécaniques : ${mec}<br>⚡ Électriques : ${elec}<br>🅿️ Places libres : ${free}`;
  } catch(e) {
    console.error("Erreur Vélib:", elementId, e);
    document.getElementById(elementId).innerHTML = `<img src='img/picto-velib.svg' class='icon-inline'> Vélib’<br><span class='error'>Erreur chargement</span>`;
  }
}

function refreshAll() {
  updateDateTime();
  fetchTransport("rer", "rer-content");
  fetchTransport("bus77", "bus77-content");
  fetchTransport("bus201", "bus201-content");
  fetchVelib(VELIB_IDS.vincennes, "velib-vincennes");
  fetchVelib(VELIB_IDS.breuil, "velib-breuil");
}

setInterval(refreshAll, 60000);
refreshAll();
