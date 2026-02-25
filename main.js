import { mapboxAccessToken } from './config.js';

const stops = [
  {
    name: 'Harbor Gateway',
    lat: 58.7203,
    lng: 9.2338,
    blurb: 'Begin by the old harbor where shipwright stories still echo between painted facades.',
  },
  {
    name: 'Clock Tower Lane',
    lat: 58.7211,
    lng: 9.238,
    blurb: 'Look up at the town clock and discover how market life shaped this crossroads.',
  },
  {
    name: 'Artist Quarter',
    lat: 58.723,
    lng: 9.235,
    blurb: 'Hidden ateliers and mural walls reveal the creative pulse of the town.',
  },
];

let activeIndex = 0;
let userPos = null;
let map;
let userMarker;
let stopMarker;
let routeSteps = [];

const distanceValue = document.querySelector('#distanceValue');
const bearingValue = document.querySelector('#bearingValue');
const gpsStatus = document.querySelector('#gpsStatus');
const activeStopTitle = document.querySelector('#activeStopTitle');
const stopCards = document.querySelector('#stopCards');
const ringValue = document.querySelector('#ringValue');
const locateBtn = document.querySelector('#locateBtn');
const nextStopBtn = document.querySelector('#nextStopBtn');
const refreshRouteBtn = document.querySelector('#refreshRouteBtn');
const nextInstruction = document.querySelector('#nextInstruction');
const maneuverList = document.querySelector('#maneuverList');

function haversineMeters(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function bearingDegrees(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const toDeg = (r) => (r * 180) / Math.PI;
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function speak(text) {
  if (!('speechSynthesis' in window)) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

function renderCards() {
  stopCards.innerHTML = '';
  stops.forEach((stop, i) => {
    const card = document.createElement('article');
    card.className = 'stop-card';
    card.setAttribute('role', 'listitem');
    card.innerHTML = `
      <h4>${stop.name}</h4>
      <p>${stop.blurb}</p>
      <button class="glass-button" data-act="play" data-index="${i}">Play narration</button>
      <button class="glass-button" data-act="activate" data-index="${i}">Navigate here</button>
    `;
    stopCards.append(card);
  });
}

function initMap() {
  mapboxgl.accessToken = mapboxAccessToken;
  map = new mapboxgl.Map({
    container: 'mapboxMap',
    style: 'mapbox://styles/mapbox/standard',
    center: [stops[0].lng, stops[0].lat],
    zoom: 14,
    pitch: 45,
    bearing: 10,
  });

  map.addControl(new mapboxgl.NavigationControl({ showCompass: true }), 'top-right');

  map.on('load', () => {
    map.addSource('route', {
      type: 'geojson',
      data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } },
    });

    map.addLayer({
      id: 'route-line',
      type: 'line',
      source: 'route',
      paint: {
        'line-color': '#57ffa4',
        'line-width': 7,
        'line-opacity': 0.9,
      },
    });

    stopMarker = new mapboxgl.Marker({ color: '#57ffa4' })
      .setLngLat([stops[activeIndex].lng, stops[activeIndex].lat])
      .addTo(map);
  });
}

function setUserMarker() {
  if (!map || !userPos) return;
  if (!userMarker) {
    userMarker = new mapboxgl.Marker({ color: '#7bb8ff' })
      .setLngLat([userPos.lng, userPos.lat])
      .addTo(map);
  } else {
    userMarker.setLngLat([userPos.lng, userPos.lat]);
  }
}

function renderManeuvers(steps) {
  maneuverList.innerHTML = '';
  steps.forEach((step, i) => {
    const li = document.createElement('li');
    li.className = 'maneuver-item';
    li.dataset.index = String(i);
    li.innerHTML = `<strong>${step.maneuver.instruction}</strong><span>${Math.round(step.distance)} m</span>`;
    maneuverList.append(li);
  });
}

function highlightNearestStep() {
  if (!userPos || !routeSteps.length) return;

  let nearestIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;

  routeSteps.forEach((step, index) => {
    const [lng, lat] = step.maneuver.location;
    const distance = haversineMeters(userPos, { lat, lng });
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  });

  nextInstruction.textContent = routeSteps[nearestIndex]?.maneuver?.instruction || 'Continue to destination.';

  maneuverList.querySelectorAll('.maneuver-item').forEach((item, idx) => {
    item.classList.toggle('active', idx === nearestIndex);
  });
}

async function buildRoute() {
  if (!userPos || !map?.isStyleLoaded()) return;

  const destination = stops[activeIndex];
  const url = `https://api.mapbox.com/directions/v5/mapbox/walking/${userPos.lng},${userPos.lat};${destination.lng},${destination.lat}?steps=true&geometries=geojson&voice_instructions=true&banner_instructions=true&access_token=${mapboxAccessToken}`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    const route = data?.routes?.[0];
    if (!route) {
      nextInstruction.textContent = 'Unable to generate walking route.';
      return;
    }
    routeSteps = route.legs?.[0]?.steps || [];

    const source = map.getSource('route');
    if (source) {
      source.setData({
        type: 'Feature',
        properties: {},
        geometry: route.geometry,
      });
    }

    if (stopMarker) {
      stopMarker.setLngLat([destination.lng, destination.lat]);
    }

    map.fitBounds(
      [
        [userPos.lng, userPos.lat],
        [destination.lng, destination.lat],
      ],
      { padding: 60, duration: 1200 },
    );

    renderManeuvers(routeSteps);
    highlightNearestStep();
  } catch {
    nextInstruction.textContent = 'Route lookup failed. Check connection and retry.';
  }
}

function refreshNav() {
  const stop = stops[activeIndex];
  activeStopTitle.textContent = stop.name;
  if (!userPos) return;

  const dist = haversineMeters(userPos, stop);
  const bearing = bearingDegrees(userPos, stop);
  distanceValue.textContent = `${Math.round(dist)} m`;
  bearingValue.textContent = `Bearing: ${Math.round(bearing)}°`;

  const pct = Math.max(0, Math.min(1, 1 - dist / 800));
  ringValue.style.strokeDashoffset = String(314 - pct * 314);

  gpsStatus.textContent = dist < 20 ? 'You are at this stop. Tap next for the following story.' : 'Follow live route guidance below.';

  setUserMarker();
  highlightNearestStep();
}

function nextStop() {
  activeIndex = (activeIndex + 1) % stops.length;
  refreshNav();
  buildRoute();
}

function beginTracking() {
  if (!('geolocation' in navigator)) {
    gpsStatus.textContent = 'Geolocation is unavailable on this device.';
    return;
  }

  navigator.geolocation.watchPosition(
    (pos) => {
      userPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      gpsStatus.textContent = 'Live GPS connected.';
      refreshNav();
      buildRoute();
    },
    () => {
      gpsStatus.textContent = 'Location permission denied. Using preview mode near downtown.';
      userPos = { lat: 58.7208, lng: 9.2355 };
      refreshNav();
      buildRoute();
    },
    { enableHighAccuracy: true, maximumAge: 4000, timeout: 10000 },
  );
}

stopCards.addEventListener('click', (event) => {
  const btn = event.target.closest('button');
  if (!btn) return;
  const index = Number(btn.dataset.index);
  if (btn.dataset.act === 'play') {
    speak(`${stops[index].name}. ${stops[index].blurb}`);
  }
  if (btn.dataset.act === 'activate') {
    activeIndex = index;
    refreshNav();
    buildRoute();
    speak(`Now guiding to ${stops[index].name}.`);
  }
});

locateBtn.addEventListener('click', beginTracking);
nextStopBtn.addEventListener('click', nextStop);
refreshRouteBtn.addEventListener('click', buildRoute);

renderCards();
initMap();
beginTracking();
refreshNav();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
