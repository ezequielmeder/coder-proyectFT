const forceFileInput = document.getElementById('forceFile');
const gpsFileInput = document.getElementById('gpsFile');
const otherFileInput = document.getElementById('otherFile');
const processBtn = document.getElementById('processBtn');
const playerFilter = document.getElementById('playerFilter');

const statusText = document.getElementById('status');
const kpiCards = document.getElementById('kpiCards');
const cmjIndicators = document.getElementById('cmjIndicators');
const gpsIndicators = document.getElementById('gpsIndicators');
const otherIndicators = document.getElementById('otherIndicators');

const tableHead = document.querySelector('#combinedTable thead');
const tableBody = document.querySelector('#combinedTable tbody');

const appState = {
  forceRows: [],
  gpsRows: [],
  otherRows: [],
  mergedRows: [],
};

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  if (!lines.length) return [];

  const headers = lines[0].split(',').map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(',').map((cell) => cell.trim());
    return headers.reduce((acc, header, index) => {
      acc[header] = cells[index] ?? '';
      return acc;
    }, {});
  });
}

async function fileToJson(fileInput) {
  const file = fileInput.files[0];
  if (!file) return [];
  const text = await file.text();
  return parseCsv(text);
}

function toNumber(value) {
  const n = Number(String(value).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function average(rows, field) {
  if (!rows.length) return 0;
  return rows.reduce((sum, row) => sum + toNumber(row[field]), 0) / rows.length;
}

function sum(rows, field) {
  return rows.reduce((acc, row) => acc + toNumber(row[field]), 0);
}

function calculateKpis(forceRows, gpsRows, otherRows) {
  const players = new Set(
    [...forceRows, ...gpsRows, ...otherRows].map((r) => r.player).filter(Boolean)
  );

  return [
    { label: 'Jugadores integrados', value: players.size },
    { label: 'Salto promedio (cm)', value: average(forceRows, 'jump_cm').toFixed(1) },
    {
      label: 'Pico de fuerza prom. (N)',
      value: average(forceRows, 'peak_force_n').toFixed(1),
    },
    { label: 'Distancia total GPS (km)', value: sum(gpsRows, 'distance_km').toFixed(2) },
    { label: 'High speed total (m)', value: sum(gpsRows, 'high_speed_m').toFixed(0) },
  ];
}

function mergeByPlayerDate(forceRows, gpsRows, otherRows) {
  const map = new Map();

  const insertRows = (rows, prefix) => {
    rows.forEach((row) => {
      const player = row.player || 'Sin jugador';
      const date = row.date || 'Sin fecha';
      const key = `${player}__${date}`;
      if (!map.has(key)) {
        map.set(key, { player, date });
      }
      const current = map.get(key);
      Object.entries(row).forEach(([k, v]) => {
        if (k === 'player' || k === 'date') return;
        current[`${prefix}_${k}`] = v;
      });
    });
  };

  insertRows(forceRows, 'force');
  insertRows(gpsRows, 'gps');
  insertRows(otherRows, 'other');

  return Array.from(map.values());
}

function renderKpis(kpis) {
  kpiCards.innerHTML = '';
  kpis.forEach((kpi) => {
    const card = document.createElement('article');
    card.className = 'kpi';
    card.innerHTML = `<h3>${kpi.label}</h3><p>${kpi.value}</p>`;
    kpiCards.appendChild(card);
  });
}

function renderMiniKpis(container, list) {
  container.innerHTML = '';
  list.forEach((item) => {
    const block = document.createElement('div');
    block.className = 'mini-kpi';
    block.innerHTML = `<strong>${item.label}</strong><span>${item.value}</span>`;
    container.appendChild(block);
  });
}

function renderTable(rows) {
  tableHead.innerHTML = '';
  tableBody.innerHTML = '';

  if (!rows.length) return;

  const columns = Array.from(
    rows.reduce((set, row) => {
      Object.keys(row).forEach((k) => set.add(k));
      return set;
    }, new Set())
  );

  const headerRow = document.createElement('tr');
  columns.forEach((column) => {
    const th = document.createElement('th');
    th.textContent = column;
    headerRow.appendChild(th);
  });
  tableHead.appendChild(headerRow);

  rows.forEach((row) => {
    const tr = document.createElement('tr');
    columns.forEach((column) => {
      const td = document.createElement('td');
      td.textContent = row[column] ?? '';
      tr.appendChild(td);
    });
    tableBody.appendChild(tr);
  });
}

function filterRowsByPlayer(rows, player) {
  if (player === 'all') return rows;
  return rows.filter((row) => row.player === player);
}

function populatePlayerFilter(mergedRows) {
  const players = Array.from(new Set(mergedRows.map((r) => r.player).filter(Boolean))).sort();

  playerFilter.innerHTML = '<option value="all">Todos</option>';
  players.forEach((player) => {
    const option = document.createElement('option');
    option.value = player;
    option.textContent = player;
    playerFilter.appendChild(option);
  });
}

function renderSourceDashboard(forceRows, gpsRows, otherRows) {
  renderMiniKpis(cmjIndicators, [
    { label: 'CMJ promedio (cm)', value: average(forceRows, 'jump_cm').toFixed(1) },
    { label: 'Pico fuerza prom. (N)', value: average(forceRows, 'peak_force_n').toFixed(1) },
    { label: 'Registros fuerza', value: forceRows.length },
  ]);

  renderMiniKpis(gpsIndicators, [
    { label: 'Distancia total (km)', value: sum(gpsRows, 'distance_km').toFixed(2) },
    { label: 'High speed total (m)', value: sum(gpsRows, 'high_speed_m').toFixed(0) },
    { label: 'Registros GPS', value: gpsRows.length },
  ]);

  renderMiniKpis(otherIndicators, [
    { label: 'RPE promedio', value: average(otherRows, 'rpe').toFixed(1) },
    {
      label: 'Wellness promedio',
      value: average(otherRows, 'wellness_score').toFixed(1),
    },
    { label: 'Registros otros', value: otherRows.length },
  ]);
}

function refreshDashboard() {
  const selectedPlayer = playerFilter.value;
  const forceRows = filterRowsByPlayer(appState.forceRows, selectedPlayer);
  const gpsRows = filterRowsByPlayer(appState.gpsRows, selectedPlayer);
  const otherRows = filterRowsByPlayer(appState.otherRows, selectedPlayer);
  const mergedRows = filterRowsByPlayer(appState.mergedRows, selectedPlayer);

  renderSourceDashboard(forceRows, gpsRows, otherRows);
  renderTable(mergedRows);
}

playerFilter.addEventListener('change', refreshDashboard);

processBtn.addEventListener('click', async () => {
  const forceRows = await fileToJson(forceFileInput);
  const gpsRows = await fileToJson(gpsFileInput);
  const otherRows = await fileToJson(otherFileInput);

  if (!forceRows.length && !gpsRows.length && !otherRows.length) {
    statusText.textContent = 'Debes cargar al menos un archivo CSV.';
    statusText.classList.remove('done');
    return;
  }

  const kpis = calculateKpis(forceRows, gpsRows, otherRows);
  const mergedRows = mergeByPlayerDate(forceRows, gpsRows, otherRows);

  appState.forceRows = forceRows;
  appState.gpsRows = gpsRows;
  appState.otherRows = otherRows;
  appState.mergedRows = mergedRows;

  renderKpis(kpis);
  populatePlayerFilter(mergedRows);
  refreshDashboard();

  statusText.textContent = `Procesamiento completado: ${mergedRows.length} registros integrados.`;
  statusText.classList.add('done');
});
