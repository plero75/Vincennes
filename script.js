// CONFIGURATION
const API_KEY = "pKjUX6JVy3uLQJXsT0cfkFbsPJZUsKob";
const PROXY = "https://ratp-proxy.hippodrome-proxy42.workers.dev/?url=";
const VELIB_URL = "https://prim.iledefrance-mobilites.fr/marketplace/velib/station_status.json";

const STOP_POINTS ={
  rer:{
    name: "RER A Joinville-le-Pont",
    realtimeUrl: ${PROXY}https://prim.iledefrance-mobilites.fr/marketplace/stop-monitoring?MonitoringRef=STIF:StopPoint:Q:43135:,
    scheduleUrl: ${PROXY}https://prim.iledefrance-mobilites.fr/marketplace/v2/navitia/stop_points/stop_point:IDFM:monomodalStopPlace:43135/route_schedules?line=line:IDFM:C01742&from_datetime=,
    icon: "img/picto-rer-a.svg"
  },
  bus77:{
    name: "BUS 77 Hippodrome de Vincennes",
    realtimeUrl: ${PROXY}https://prim.iledefrance-mobilites.fr/marketplace/stop-monitoring?MonitoringRef=STIF:StopPoint:Q:463641:,
    scheduleUrl: ${PROXY}https://prim.iledefrance-mobilites.fr/marketplace/v2/navitia/stop_points/stop_point:IDFM:463640/route_schedules?line=line:IDFM:C02251&from_datetime=,
    icon: "img/picto-bus.svg"
  },
  bus201:{
    name: "BUS 201 Ecole du Breuil",
    realtimeUrl: ${PROXY}https://prim.iledefrance-mobilites.fr/marketplace/stop-monitoring?MonitoringRef=STIF:StopPoint:Q:463644:,
    scheduleUrl: ${PROXY}https://prim.iledefrance-mobilites.fr/marketplace/v2/navitia/stop_points/stop_point:IDFM:463646/route_schedules?line=line:IDFM:C01219&from_datetime=,
    icon: "img/picto-bus.svg"
  }
};

const VELIB_IDS ={
  vincennes: "1074333296",
  breuil: "508042092"
};

// Cache des arrêts de parcours
const VEHICLE_JOURNEY_CACHE ={};

// Fetch générique JSON
async function fetchJSON(url, headers ={}){
  const res = await fetch(url,{ headers });
  if (!res.ok) throw new Error(Erreur HTTP ${res.status});
  return await res.json();
}

// Formatage date/heure
function updateDateTime(){
  const now = new Date();
  document.getElementById("current-date").textContent =
    now.toLocaleDateString("fr-FR",{ weekday: "long", year: "numeric", month: "long", day: "2-digit" });
  document.getElementById("current-time").textContent =
    now.toLocaleTimeString("fr-FR",{ hour: "2-digit", minute: "2-digit" });
}

function formatTime(iso){
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d)) return "-";
  return d.toLocaleTimeString("fr-FR",{ hour: "2-digit", minute: "2-digit" });
}

function minutesUntil(dt){
  const now = new Date();
  const t = new Date(dt);
  if (isNaN(t)) return "";
  const diff = (t - now) / 60000;
  if (diff < 1.5) return <span class="imminent">(passage imminent)</span>;
  return <span class="temps">(${Math.round(diff)} min)</span>;
}

function getDestinationName(d){
  if (!d) return "Destination inconnue";
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d[0]?.value || "Destination inconnue";
  if (typeof d === "object") return d.value || "Destination inconnue";
  return "Destination inconnue";
}

function getVehicleJourneyRef(mvj){
  return mvj.FramedVehicleJourneyRef?.DatedVehicleJourneyRef || null;
}

// Appel Navitia (proxy + apikey)
async function fetchStopsForJourney(vehicleJourneyRef){
  if (!vehicleJourneyRef) return [];
  if (VEHICLE_JOURNEY_CACHE[vehicleJourneyRef]) return VEHICLE_JOURNEY_CACHE[vehicleJourneyRef];
  const url = ${PROXY}https://prim.iledefrance-mobilites.fr/marketplace/v2/navitia/vehicle_journeys/${encodeURIComponent(vehicleJourneyRef)}/stop_points;
  const data = await fetchJSON(url,{ apikey: API_KEY });
  const stops = (data.stop_points || []).map(sp => sp.name);
  VEHICLE_JOURNEY_CACHE[vehicleJourneyRef] = stops;
  return stops;
}

// Affichage par direction
async function renderDepartures(id, title, data, icon, first, last){
  const el = document.getElementById(id);
  let html = <div class="title-line"><img src="${icon}" class="icon-inline">${title}</div>;
  if (!data || data.length === 0){
    html += <ul><li>Aucun passage à venir</li></ul>;
  } else{
    const grouped ={};
    data.forEach(d =>{
      const dir = getDestinationName(d.MonitoredVehicleJourney.DirectionName);
      if (!grouped[dir]) grouped[dir] = [];
      grouped[dir].push(d);
    });
    for (const dir in grouped){
      html += <h4 class="direction-title">Direction ${dir}</h4><ul>;
      // Afficher les 4 prochains passages de cette direction
      await Promise.all(grouped[dir].slice(0, 4).map(async d =>{
        const mvj = d.MonitoredVehicleJourney;
        const call = mvj.MonitoredCall;
        const expected = call.ExpectedDepartureTime || call.AimedDepartureTime;
        const delay = (call.ExpectedDepartureTime && call.AimedDepartureTime && call.ExpectedDepartureTime !== call.AimedDepartureTime)
          ? <span class='delay'>(+${Math.round((new Date(call.ExpectedDepartureTime) - new Date(call.AimedDepartureTime)) / 60000)} min)</span> : "";
        const isLast = mvj.FirstOrLastJourney?.value === "LAST_SERVICE_OF_DAY";
        const ref = getVehicleJourneyRef(mvj);
        let stopsHtml = "";
        try{
          const stops = await fetchStopsForJourney(ref);
          if (stops.length) stopsHtml = <div class="defile-arrets">${stops.join(" – ")}</div>;
        } catch{}
        html += `<li>▶ ${formatTime(expected)} ${minutesUntil(expected)} ${delay} ${isLast ? "<span class='last-train'>(dernier train)</span>" : ""}
          ${stopsHtml}
        </li>`;
      }));
      html += </ul>;
    }
  }
  html += <div class="schedule-extremes">Premier départ : ${first || "-"}<br>Dernier départ : ${last || "-"}</div>;
  el.innerHTML = html;
}

// Chargement données transports
async function fetchTransport(stopKey, elementId){
  try{
    const data = await fetchJSON(STOP_POINTS[stopKey].realtimeUrl,{ apikey: API_KEY });
    const visits = data?.Siri?.ServiceDelivery?.StopMonitoringDelivery?.[0]?.MonitoredStopVisit || [];
    await renderDepartures(
      elementId,
      STOP_POINTS[stopKey].name,
      visits,
      STOP_POINTS[stopKey].icon,
      localStorage.getItem(${stopKey}-first),
      localStorage.getItem(${stopKey}-last)
    );
  } catch (e){
    console.error(Erreur fetchTransport ${stopKey}:, e);
    document.getElementById(elementId).innerHTML =
      <div class="title-line"><img src="${STOP_POINTS[stopKey].icon}" class="icon-inline">${STOP_POINTS[stopKey].name}</div><div class="error">Données indisponibles</div>;
  }
}

// Horaires premiers/derniers départs (1x/jour)
async function fetchSchedulesOncePerDay(){
  const today = new Date().toISOString().slice(0, 10);
  if (localStorage.getItem("schedule-day") === today) return;
  for (let key in STOP_POINTS){
    try{
      const url = STOP_POINTS[key].scheduleUrl + today.replace(/-/g, "") + "T000000";
      const data = await fetchJSON(url,{ apikey: API_KEY });
      const rows = data.route_schedules?.[0]?.table?.rows || [];
      const times = [];
      rows.forEach(row =>{
        row.stop_date_times?.forEach(sdt =>{
          if (sdt.departure_time) times.push(sdt.departure_time);
        });
      });
      times.sort();
      if (times.length){
        const fmt = t => ${t.slice(0, 2)}:${t.slice(2, 4)};
        localStorage.setItem(${key}-first, fmt(times[0]));
        localStorage.setItem(${key}-last, fmt(times[times.length - 1]));
      }
    } catch (e){
      console.error(Erreur fetchSchedulesOncePerDay ${key}:, e);
    }
  }
  localStorage.setItem("schedule-day", today);
}

// Vélib (via proxy)
async function fetchVelib(stationId, elementId){
  try{
    const url = ${PROXY}${VELIB_URL};
    const data = await fetchJSON(url,{ apikey: API_KEY });
    const station = data.data.stations.find(s => s.station_id == stationId);
    if (!station) throw new Error("Station Vélib non trouvée");
    const mechanical = station.num_bikes_available_types.find(b => b.mechanical !== undefined)?.mechanical || 0;
    const ebike = station.num_bikes_available_types.find(b => b.ebike !== undefined)?.ebike || 0;
    const free = station.num_docks_available || 0;
    document.getElementById(elementId).innerHTML = `
      <div class='title-line'><img src='img/picto-velib.svg' class='icon-inline'>Vélib'</div>
      🚲 Mécaniques : ${mechanical}<br>
      ⚡ Électriques : ${ebike}<br>
      🅿 Places libres : ${free}
    `;
  } catch (e){
    console.error("Erreur Vélib:", e);
    document.getElementById(elementId).innerHTML = `
      <div class='title-line'><img src='img/picto-velib.svg' class='icon-inline'>Vélib'</div>
      <div class='error'>Erreur chargement</div>
    `;
  }
}

// METEO (exemple OpenWeatherMap, tu dois brancher ta vraie source)
async function fetchMeteo(){
  // à adapter selon ton API préférée
  document.getElementById("meteo").innerHTML = `
    <b>Météo</b><br>
    Température : 34°C<br>
    ☀ Soleil
  `;
}

// INFOS TRAFIC (exemple mock)
async function fetchInfoTrafic(){
  document.getElementById("infotrafic").innerHTML = `
    <b>Info trafic</b><br>
    Travaux d'été RER A<br>
    Bus 77 : arrêt Hippodrome en service<br>
    Bus 201 : trafic normal
  `;
}

function refreshAll(){
  updateDateTime();
  fetchMeteo();
  fetchInfoTrafic();
  fetchSchedulesOncePerDay();
  fetchTransport("rer", "rer-content");
  fetchTransport("bus77", "bus77-content");
  fetchTransport("bus201", "bus201-content");
  fetchVelib(VELIB_IDS.vincennes, "velib-vincennes");
  fetchVelib(VELIB_IDS.breuil, "velib-breuil");
}

setInterval(refreshAll, 60000);
refreshAll();
