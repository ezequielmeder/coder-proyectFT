const forceFileInput = document.getElementById('forceFile');
const gpsFileInput = document.getElementById('gpsFile');
const otherFileInput = document.getElementById('otherFile');
const processBtn = document.getElementById('processBtn');
const statusText = document.getElementById('status');
const kpiCards = document.getElementById('kpiCards');
const tableHead = document.querySelector('#combinedTable thead');
const tableBody = document.querySelector('#combinedTable tbody');

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

function calculateKpis(forceRows, gpsRows, otherRows) {
  const players = new Set([
    ...forceRows.map((r) => r.player),
    ...gpsRows.map((r) => r.player),
    ...otherRows.map((r) => r.player),
  ].filter(Boolean));

  const avgJump =
    forceRows.reduce((sum, r) => sum + toNumber(r.jump_cm), 0) /
    (forceRows.length || 1);

  const avgPeakForce =
    forceRows.reduce((sum, r) => sum + toNumber(r.peak_force_n), 0) /
    (forceRows.length || 1);

  const totalDistanceKm =
    gpsRows.reduce((sum, r) => sum + toNumber(r.distance_km), 0);

  const totalHighSpeedM =
    gpsRows.reduce((sum, r) => sum + toNumber(r.high_speed_m), 0);

  return [
    { label: 'Jugadores integrados', value: players.size },
    { label: 'Salto promedio (cm)', value: avgJump.toFixed(1) },
    { label: 'Pico de fuerza prom. (N)', value: avgPeakForce.toFixed(1) },
    { label: 'Distancia total GPS (km)', value: totalDistanceKm.toFixed(2) },
    { label: 'High speed total (m)', value: totalHighSpeedM.toFixed(0) },
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

  renderKpis(kpis);
  renderTable(mergedRows);

  statusText.textContent = `Procesamiento completado: ${mergedRows.length} registros integrados.`;
  statusText.classList.add('done');
});
