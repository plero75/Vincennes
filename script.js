// script.js – version corrigée (23/06/2025)

// Fonction utilitaire pour décoder les entités HTML
function decodeEntities(encoded) {
  const txt = document.createElement('textarea');
  txt.innerHTML = encoded;
  return txt.value;
}

const STOP_POINTS = {
  rer: {
    name: "RER A",
    icon: "img/picto-rer-a.svg",
    realtimeUrl: "https://ratp-proxy.hippodrome-proxy42.workers.dev/?url=https://prim.iledefrance-mobilites.fr/marketplace/stop-monitoring?MonitoringRef=STIF:StopPoint:Q:43867:",
    scheduleUrl: "https://ratp-proxy.hippodrome-proxy42.workers.dev/?url=https://prim.iledefrance-mobilites.fr/marketplace/v2/navitia/stop_points/stop_point:IDFM:43867/route_schedules?line=line:IDFM:C01742&from_datetime=",
    trafficUrl: "https://ratp-proxy.hippodrome-proxy42.workers.dev/?url=https://prim.iledefrance-mobilites.fr/marketplace/v2/navitia/line_reports/lines/line:IDFM:C01742"
  },
  bus77: {
    name: "BUS 77",
    icon: "img/picto-bus.svg",
    realtimeUrl: "https://ratp-proxy.hippodrome-proxy42.workers.dev/?url=https://prim.iledefrance-mobilites.fr/marketplace/stop-monitoring?MonitoringRef=STIF:StopPoint:Q:463641:",
    scheduleUrl: "https://ratp-proxy.hippodrome-proxy42.workers.dev/?url=https://prim.iledefrance-mobilites.fr/marketplace/v2/navitia/stop_points/stop_point:IDFM:463641/route_schedules?line=line:IDFM:C02251&from_datetime=",
    trafficUrl: "https://ratp-proxy.hippodrome-proxy42.workers.dev/?url=https://prim.iledefrance-mobilites.fr/marketplace/v2/navitia/line_reports/lines/line:IDFM:C02251"
  },
  bus201: {
    name: "BUS 201",
    icon: "img/picto-bus.svg",
    realtimeUrl: "https://ratp-proxy.hippodrome-proxy42.workers.dev/?url=https://prim.iledefrance-mobilites.fr/marketplace/stop-monitoring?MonitoringRef=STIF:StopPoint:Q:463644:",
    scheduleUrl: "https://ratp-proxy.hippodrome-proxy42.workers.dev/?url=https://prim.iledefrance-mobilites.fr/marketplace/v2/navitia/stop_points/stop_point:IDFM:463644/route_schedules?line=line:IDFM:C01219&from_datetime=",
    trafficUrl: "https://ratp-proxy.hippodrome-proxy42.workers.dev/?url=https://prim.iledefrance-mobilites.fr/marketplace/v2/navitia/line_reports/lines/line:IDFM:C01219"
  }
};

const VELIB_IDS = {
  vincennes: "1074333296",
  breuil: "508042092"
};

function updateDateTime() {
  const now = new Date();
  document.getElementById("current-date").textContent = now.toLocaleDateString("fr-FR");
  document.getElementById("current-time").textContent = now.toLocaleTimeString("fr-FR");
  document.getElementById("last-update").textContent = now.toLocaleString("fr-FR");
}

function formatTime(iso) {
  if (!iso) return "–";
  const d = new Date(iso);
  return isNaN(d) ? "–" : d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function getDestination(dest) {
  if (!dest) return "–";
  if (typeof dest === "string") return dest;
  if (Array.isArray(dest)) {
    const first = dest[0];
    return typeof first === "string" ? first : Object.values(first)[0] || "–";
  }
  return Object.values(dest)[0] || "–";
}

function renderDepartures($1) {
  const el = document.getElementById(id);
  let iconsHtml = '';
  disruptions.filter(d => d.lineId).forEach(d => {
    let cls = 'perturb-icon';
    if (d.type === 'delay') cls = 'delay-icon';
    else if (d.type === 'cancel') cls = 'cancel-icon';
    iconsHtml += `<img src="img/picto-${d.lineId}.svg" class="${cls}" title="${decodeEntities(d.messages[0]?.text || '')}">`;
  });

  if (disruptions.length > 4) iconsHtml += `<div class="perturb-more">+${disruptions.length - 4}</div>`;

  let html = `<div class="title-line"><img src="${icon}" class="icon-inline">${name}</div>`;
  html += `<div class="perturb-header">${iconsHtml}</div><ul>`;
  if (visits.length === 0) {
    html += "<li>Aucun passage à venir</li>";
  } else {
    visits.slice(0, 4).forEach(d => {
      const call = d.MonitoredVehicleJourney.MonitoredCall;
      html += `<li>▶ ${formatTime(call.AimedDepartureTime || call.ExpectedDepartureTime)} → ${getDestination(d.MonitoredVehicleJourney.DestinationName)}</li>`;
    });
  }
  html += `</ul><div class="schedule-extremes">Premier départ : ${first}<br>Dernier départ : ${last}</div>`;
  html += `<div class="traffic-info">${message || 'Pas de message'}</div>`;
  el.innerHTML = html;
}

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Erreur HTTP ${res.status}`);
  return res.json();
}

async function fetchTransportBlock($1) {
  document.getElementById(containerId).innerHTML = `<div class="loading">Chargement...</div>`;
  try {
    const [realtime, traffic] = await Promise.all([
      fetchJSON(STOP_POINTS[key].realtimeUrl),
      fetchJSON(STOP_POINTS[key].trafficUrl)
    ]);

    let visits = realtime.Siri.ServiceDelivery.StopMonitoringDelivery[0]?.MonitoredStopVisit || [];
    const disruptionsData = traffic.disruptions || [];
    const enrichedMsg = disruptionsData.map(d => d.messages[0]?.text || '').join("<br>");

    const disruptions = disruptionsData.filter(d => d.line_id).map(d => ({
      lineId: d.line_id,
      messages: d.messages,
      type: d.kind === 'major' ? 'cancel' : (d.kind === 'delay' ? 'delay' : 'normal')
    }));

    renderDepartures(
      containerId,
      STOP_POINTS[key].name,
      visits,
      STOP_POINTS[key].icon,
      localStorage.getItem(key + "-first") || "-",
      localStorage.getItem(key + "-last") || "-",
      enrichedMsg,
      key === "rer",
      disruptions
    );
  } catch (err) {
    console.error(`Erreur sur ${key}`, err);
    document.getElementById(containerId).innerHTML = `<div class="title-line"><img src="${STOP_POINTS[key].icon}" class="icon-inline">${STOP_POINTS[key].name}</div><div class="error">Données indisponibles</div>`;
  }
}

async function fetchVelib(stationId, containerId) {
  try {
    const proxy = "https://corsproxy.io/?";
    const url = proxy + encodeURIComponent("https://velib-metropole-opendata.smovengo.cloud/opendata/Velib_Metropole/station_status.json");
    const data = await fetchJSON(url);
    const station = data.data.stations.find(s => String(s.station_id) === String(stationId));
    if (!station) throw new Error("Station non trouvée");
    if (!station.is_installed) throw new Error("Station en cours d'installation");
    if (!station.is_renting) throw new Error("Location indisponible");
    if (!station.is_returning) throw new Error("Retour indisponible");

    const types = station.num_bikes_available_types[0] || {};
    const mech = types.mechanical || 0;
    const elec = types.ebike || 0;
    const free = station.num_docks_available;

    document.getElementById(containerId).innerHTML = `
      <div class='title-line'><img src='img/picto-velib.svg' class='icon-inline'>Vélib'</div>
      <div class="velib-stats">
        <div class="velib-mechanical">🚲 Mécaniques : ${mech}</div>
        <div class="velib-electric">⚡ Électriques : ${elec}</div>
        <div class="velib-free">🅿️ Places libres : ${free}</div>
      </div>
      <div class="velib-last">Dernière MAJ : ${new Date(station.last_reported*1000).toLocaleTimeString("fr-FR")}</div>
    `;
  } catch (e) {
    console.error("Erreur Vélib", e);
    document.getElementById(containerId).innerHTML = `<div class='title-line'><img src='img/picto-velib.svg' class='icon-inline'>Vélib'</div><div class='error'>${e.message}</div>`;
  }
}

async function fetchScheduleOncePerDay() {
  const today = new Date().toISOString().split("T")[0];
  if (localStorage.getItem("schedule-day") === today) return;
  for (const key in STOP_POINTS) {
    try {
      const param = today.replace(/-/g, "") + "T000000";
      const data = await fetchJSON(STOP_POINTS[key].scheduleUrl + param);
      const times = (data.route_schedules?.[0]?.table?.rows || []).flatMap(r => r.date_times?.map(d => d.departure_date_time.slice(9, 13)) || []);
      if (times.length) {
        const sorted = times.sort();
        const fmt = function (t) {
  return t.slice(0, 2) + ":" + t.slice(2);
};
        localStorage.setItem(`${key}-first`, fmt(sorted[0]));
        localStorage.setItem(`${key}-last`, fmt(sorted[sorted.length - 1]));
      }
    } catch (e) {
      console.error(`Erreur schedule ${key}`, e);
    }
  }
  localStorage.setItem("schedule-day", today);
}

function refreshAll() {
  updateDateTime();
  fetchScheduleOncePerDay();
  Promise.all([
    fetchTransportBlock("rer", "rer-content"),
    fetchTransportBlock("bus77", "bus77-content"),
    fetchTransportBlock("bus201", "bus201-content"),
    fetchVelib(VELIB_IDS.vincennes, "velib-vincennes"),
    fetchVelib(VELIB_IDS.breuil, "velib-breuil")
  ]);
}

setInterval(refreshAll, 60000);
refreshAll();
 
