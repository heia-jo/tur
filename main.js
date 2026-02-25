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

const distanceValue = document.querySelector('#distanceValue');
const bearingValue = document.querySelector('#bearingValue');
const gpsStatus = document.querySelector('#gpsStatus');
const activeStopTitle = document.querySelector('#activeStopTitle');
const stopCards = document.querySelector('#stopCards');
const ringValue = document.querySelector('#ringValue');
const locateBtn = document.querySelector('#locateBtn');
const nextStopBtn = document.querySelector('#nextStopBtn');
const youMarker = document.querySelector('#youMarker');
const stopMarker = document.querySelector('#stopMarker');

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

function updateMapDots() {
  if (!userPos) return;
  const minLat = Math.min(...stops.map((s) => s.lat), userPos.lat);
  const maxLat = Math.max(...stops.map((s) => s.lat), userPos.lat);
  const minLng = Math.min(...stops.map((s) => s.lng), userPos.lng);
  const maxLng = Math.max(...stops.map((s) => s.lng), userPos.lng);

  const mapXY = ({ lat, lng }) => ({
    x: ((lng - minLng) / (maxLng - minLng || 1)) * 80 + 10,
    y: 90 - ((lat - minLat) / (maxLat - minLat || 1)) * 80,
  });

  const you = mapXY(userPos);
  const stop = mapXY(stops[activeIndex]);
  youMarker.style.left = `${you.x}%`;
  youMarker.style.top = `${you.y}%`;
  stopMarker.style.left = `${stop.x}%`;
  stopMarker.style.top = `${stop.y}%`;
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

  gpsStatus.textContent = dist < 20 ? 'You are at this stop. Tap next for the following story.' : 'Turn your phone and follow the heading.';

  updateMapDots();
}

function nextStop() {
  activeIndex = (activeIndex + 1) % stops.length;
  refreshNav();
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
    },
    () => {
      gpsStatus.textContent = 'Location permission denied. Using preview mode near downtown.';
      userPos = { lat: 58.7208, lng: 9.2355 };
      refreshNav();
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
    speak(`Now guiding to ${stops[index].name}.`);
  }
});

locateBtn.addEventListener('click', beginTracking);
nextStopBtn.addEventListener('click', nextStop);

renderCards();
beginTracking();
refreshNav();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
