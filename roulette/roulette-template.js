// roulette-template.js
function initRoulette({ hasDoubleZero = true, title = "Roulette" } = {}) {
  /* ------------ Constants & State ------------ */
  const redNumbers = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
  const totalSlots = hasDoubleZero ? 38 : 37; // 0..36 plus 37=00 if American
  const STORAGE_KEY = hasDoubleZero ? "american_roulette_v1" : "european_roulette_v1";
const gridCellByNum = new Map(); // number -> cell div

  const history = [];
  let tableView = true;

  const combos = [
    "Low-Red-Even", "Low-Red-Odd", "Low-Black-Even", "Low-Black-Odd",
    "High-Red-Even", "High-Red-Odd", "High-Black-Even", "High-Black-Odd"
  ];
  const comboNumbersMap = {
    "Low-Red-Even": [12, 14, 16, 18],
    "Low-Red-Odd": [1, 3, 5, 7, 9],
    "Low-Black-Even": [2, 4, 6, 8, 10],
    "Low-Black-Odd": [11, 13, 15, 17],
    "High-Red-Even": [30, 32, 34, 36],
    "High-Red-Odd": [19, 21, 23, 25, 27],
    "High-Black-Even": [20, 22, 24, 26, 28],
    "High-Black-Odd": [29, 31, 33, 35]
  };

  // Voice
  let recognition, listening = false, chosenLang = null;

  // Test sim
  let testRunning = false, stopRequested = false;

  /* ------------ Elements ------------ */
  if (title && document.querySelector("h1")) {
    document.querySelector("h1").textContent = title;
  }
  const numpad = document.getElementById("numpad");
  const slider = document.getElementById("rangeSlider");
  const sliderValueSpan = document.getElementById("sliderValue");
  const historyLog = document.getElementById("historyLog");
  const colBar = document.getElementById("colBar");
  const dozenBar = document.getElementById("dozenBar");
  const halfBar = document.getElementById("halfBar");
  const colorBar = document.getElementById("colorBar");
  const parityBar = document.getElementById("parityBar");
  const comboBody = document.getElementById("comboBody");
  const plainGrid = document.getElementById("plainGrid");

  const halfCtx = document.getElementById("halfChart").getContext("2d");
  const colorCtx = document.getElementById("colorChart").getContext("2d");
  const parityCtx = document.getElementById("parityChart").getContext("2d");
  const freqCtx = document.getElementById("freqChart").getContext("2d");

  /* ------------ Helpers ------------ */
  function labelFor(n) {
    if (n === 37) return "00";
    return String(n);
  }

  function updateHistoryPlaceholder() {
    if (!historyLog) return;
    if (history.length === 0) historyLog.classList.add("empty");
    else historyLog.classList.remove("empty");
  }

  function getRedShade(count) {
    if (count === 0) return '#eee';
    if (count <= 5) return '#ffe6e6';
    if (count <= 10) return '#ffb3b3';
    if (count <= 15) return '#ff8080';
    if (count <= 20) return '#ff4d4d';
    if (count <= 25) return '#ff1a1a';
    return '#b30000';
  }

  function classify(n) {
    if (n === 0 || (hasDoubleZero && n === 37)) {
      return { display: labelFor(n), color: "Green", parity: "", half: "", column: "", isZero: true };
    }
    const half = n <= 18 ? "Low" : "High";
    const color = redNumbers.includes(n) ? "Red" : "Black";
    const parity = (n % 2 === 0) ? "Even" : "Odd";
    const column = (n % 3 === 1) ? "Col1" : (n % 3 === 2 ? "Col2" : "Col3");
    return { display: String(n), color, parity, half, column, isZero: false };
  }

  /* ------------ Persistence & CSV ------------ */
  function persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(history)); } catch (e) {}
  }
  function loadPersisted() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return;
      history.splice(0, history.length, ...arr);
      rebuildHistoryLog();
      afterHistoryMutated();
    } catch (e) {}
  }
  function exportCSV() {
    if (!history.length) { alert("No data to export."); return; }
    const header = ['Index', 'Value', 'Color', 'Parity', 'Half', 'Column', 'IsZero'];
    const rows = history.map((n, i) => {
      const c = classify(n);
      return [i + 1, c.display, c.color, c.parity, c.half, c.column, c.isZero ? 'Yes' : 'No'];
    });
    const csv = [header, ...rows]
      .map(r => r.map(x => `"${String(x).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const ts = new Date(); const pad = n => String(n).padStart(2, '0');
    const fname = `roulette_${hasDoubleZero ? 'american' : 'european'}_${ts.getFullYear()}${pad(ts.getMonth()+1)}${pad(ts.getDate())}_${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}.csv`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fname;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(a.href);
    a.remove();
  }
  window.exportCSV = exportCSV;

  /* ------------ Charts ------------ */
  const halfChart = new Chart(halfCtx, {
    type: 'line',
    data: { labels: [0], datasets: [{
      label: 'Low / High', data: [0], borderWidth: 2, pointRadius: 3,
      segment: {
        borderColor: ctx => {
          const i = ctx.p0DataIndex;
          const prev = ctx.chart.data.datasets[0].data[i];
          const next = ctx.chart.data.datasets[0].data[i+1];
          if (next > prev) return '#2980b9';
          if (next < prev) return 'orange';
          return 'green';
        }
      },
      pointBackgroundColor: ctx => {
        const i = ctx.dataIndex;
        if (i === 0) return 'gray';
        const prev = ctx.dataset.data[i-1], curr = ctx.dataset.data[i];
        if (curr > prev) return '#2980b9';
        if (curr < prev) return 'orange';
        return 'green';
      },
      pointBorderColor: ctx => {
        const i = ctx.dataIndex;
        if (i === 0) return 'gray';
        const prev = ctx.dataset.data[i-1], curr = ctx.dataset.data[i];
        if (curr > prev) return '#2980b9';
        if (curr < prev) return 'orange';
        return 'green';
      },
      pointBorderWidth: 2, pointStyle: 'circle'
    }]},
    options: { responsive: true, animation: true, plugins: { legend: { display: false }, title: { display: true, text: 'Low / High' } } }
  });

  const colorChart = new Chart(colorCtx, {
    type: 'line',
    data: { labels: [0], datasets: [{
      label: 'Red / Black', data: [0], borderWidth: 2, pointRadius: 3,
      segment: {
        borderColor: ctx => {
          const i = ctx.p0DataIndex;
          const prev = ctx.chart.data.datasets[0].data[i];
          const next = ctx.chart.data.datasets[0].data[i+1];
          if (next > prev) return 'red';
          if (next < prev) return 'black';
          return 'green';
        }
      },
      pointBackgroundColor: ctx => {
        const i = ctx.dataIndex;
        if (i === 0) return 'gray';
        const prev = ctx.dataset.data[i-1], curr = ctx.dataset.data[i];
        if (curr > prev) return 'red';
        if (curr < prev) return 'black';
        return 'green';
      },
      pointBorderColor: ctx => {
        const i = ctx.dataIndex;
        if (i === 0) return 'gray';
        const prev = ctx.dataset.data[i-1], curr = ctx.dataset.data[i];
        if (curr > prev) return 'red';
        if (curr < prev) return 'black';
        return 'green';
      },
      pointBorderWidth: 2, pointStyle: 'circle'
    }]},
    options: { responsive: true, animation: true, plugins: { legend: { display: false }, title: { display: true, text: 'Red / Black' } } }
  });

  const parityChart = new Chart(parityCtx, {
    type: 'line',
    data: { labels: [0], datasets: [{
      label: 'Even / Odd', data: [0], borderWidth: 2, pointRadius: 3,
      segment: {
        borderColor: ctx => {
          const i = ctx.p0DataIndex;
          const prev = ctx.chart.data.datasets[0].data[i];
          const next = ctx.chart.data.datasets[0].data[i+1];
          if (next > prev) return 'orange';
          if (next < prev) return 'purple';
          return 'green';
        }
      },
      pointBackgroundColor: ctx => {
        const i = ctx.dataIndex;
        if (i === 0) return 'gray';
        const prev = ctx.dataset.data[i-1], curr = ctx.dataset.data[i];
        if (curr > prev) return 'orange';
        if (curr < prev) return 'purple';
        return 'green';
      },
      pointBorderColor: ctx => {
        const i = ctx.dataIndex;
        if (i === 0) return 'gray';
        const prev = ctx.dataset.data[i-1], curr = ctx.dataset.data[i];
        if (curr > prev) return 'orange';
        if (curr < prev) return 'purple';
        return 'green';
      },
      pointBorderWidth: 2, pointStyle: 'circle'
    }]},
    options: { responsive: true, animation: true, plugins: { legend: { display: false }, title: { display: true, text: 'Even / Odd' } } }
  });

  const freqChart = new Chart(freqCtx, {
    type: 'bar',
    data: {
      labels: Array.from({ length: totalSlots }, (_, i) => labelFor(i)),
      datasets: [{
        data: Array(totalSlots).fill(0),
        backgroundColor: Array.from({ length: totalSlots }, (_, i) => {
          if (i === 0 || (hasDoubleZero && i === 37)) return "green";
          return redNumbers.includes(i) ? "red" : "black";
        }),
        borderColor: "#ccc",
        borderWidth: 1
      }]
    },
    options: {
      plugins: { legend: { display: false }, title: { display: false } },
      scales: {
        x: { ticks: { autoSkip: false, maxRotation: 90, minRotation: 90 } },
        y: { beginAtZero: true }
      }
    }
  });

  /* ------------ Bars ------------ */
  function fillBar(container, segments) {
    container.innerHTML = '';
    container.style.display = 'flex';
    container.style.width = '100%';

    const minFrac = 0.05; // minimum width for visibility
    const adjusted = segments.map(s => ({ ...s, adj: s.p === 0 ? minFrac : s.p }));
    const adjTotal = adjusted.reduce((sum, s) => sum + s.adj, 0);

    adjusted.forEach(s => {
      const seg = document.createElement('div');
      seg.className = 'bar-segment';
      seg.style.background = s.color;
      seg.style.border = 'none';
      const widthPct = (s.adj / adjTotal) * 100;
      seg.style.flex = `${s.adj} 1 ${widthPct}%`;
      seg.textContent = `${s.label} ${Math.round(s.p)}%`;
      container.appendChild(seg);
    });
  }

  function updateBars() {
    const k = +slider.value;
    const slice = k ? history.slice(-k) : [];
    const t = slice.length || 1;
    const counts = {
      col1: 0, col2: 0, col3: 0,
      doz1: 0, doz2: 0, doz3: 0,
      zero: 0,
      low: 0, high: 0,
      red: 0, black: 0,
      even: 0, odd: 0
    };

    slice.forEach(n => {
      if (n === 0 || (hasDoubleZero && n === 37)) { counts.zero++; return; }
      // columns
      if (n % 3 === 1) counts.col1++;
      else if (n % 3 === 2) counts.col2++;
      else counts.col3++;
      // dozens
      if (n <= 12) counts.doz1++;
      else if (n <= 24) counts.doz2++;
      else counts.doz3++;
      // low/high
      if (n <= 18) counts.low++; else counts.high++;
      // red/black
      if (redNumbers.includes(n)) counts.red++; else counts.black++;
      // parity
      if (n % 2 === 0) counts.even++; else counts.odd++;
    });

    fillBar(colBar, [
      { p: (counts.col1 / t) * 100, color: '#7CB342', label: 'Col1' },
      { p: (counts.col2 / t) * 100, color: 'purple', label: 'Col2' },
      { p: (counts.col3 / t) * 100, color: '#4A90E2', label: 'Col3' },
      { p: (counts.zero / t) * 100, color: 'green', label: '' }
    ]);
    fillBar(dozenBar, [
      { p: (counts.doz1 / t) * 100, color: '#999', label: '1st 12' },
      { p: (counts.doz2 / t) * 100, color: '#16a085', label: '2nd 12' },
      { p: (counts.doz3 / t) * 100, color: 'black', label: '3rd 12' },
      { p: (counts.zero / t) * 100, color: 'green', label: '' }
    ]);
    fillBar(halfBar, [
      { p: (counts.low / t) * 100, color: '#2980b9', label: 'Low' },
      { p: (counts.high / t) * 100, color: 'orange', label: 'High' },
      { p: (counts.zero / t) * 100, color: 'green', label: ' ' }
    ]);
    fillBar(colorBar, [
      { p: (counts.red / t) * 100, color: 'red', label: 'Red' },
      { p: (counts.black / t) * 100, color: 'black', label: 'Black' },
      { p: (counts.zero / t) * 100, color: 'green', label: '' }
    ]);
    fillBar(parityBar, [
      { p: (counts.even / t) * 100, color: 'orange', label: 'Even' },
      { p: (counts.odd / t) * 100, color: 'purple', label: 'Odd' },
      { p: (counts.zero / t) * 100, color: 'green', label: '' }
    ]);
  }

  /* ------------ Charts Update ------------ */
  function updateCharts() {
    const k = +slider.value;
    const slice = k ? history.slice(-k) : [];
    const halfData = [0], colorData = [0], parityData = [0];
    slice.forEach(n => {
      const prevH = halfData.at(-1);
      const prevC = colorData.at(-1);
      const prevP = parityData.at(-1);
      halfData.push(prevH + (n >= 1 && n <= 18 ? 1 : n >= 19 && n <= 36 ? -1 : 0));
      colorData.push(prevC + (n >= 1 && n <= 36 ? (redNumbers.includes(n) ? 1 : -1) : 0));
      parityData.push(prevP + (n >= 1 && n <= 36 ? (n % 2 === 0 ? 1 : -1) : 0));
    });
    const labels = Array.from({ length: halfData.length }, (_, i) => i);
    [halfChart, colorChart, parityChart].forEach((chart, i) => {
      chart.data.labels = labels;
      chart.data.datasets[0].data = [halfData, colorData, parityData][i];
      chart.update();
    });
  }

  function resetCharts() {
    [halfChart, colorChart, parityChart].forEach(chart => {
      chart.data.labels = [0];
      chart.data.datasets[0].data = [0];
      chart.update();
    });
  }

  /* ------------ Frequency & Heatmap & Combos ------------ */
  function updateFreqChart() {
    const k = +slider.value;
    const slice = k ? history.slice(-k) : [];
    const counts = Array(totalSlots).fill(0);
    slice.forEach(n => counts[n]++);
    freqChart.data.datasets[0].data = counts;
    freqChart.update();
  }

function updateGrid() {
  const k = +slider.value;
  const slice = k ? history.slice(-k) : [];
  const counts = {};
  for (let i = 0; i < totalSlots; i++) counts[i] = 0;
  slice.forEach(n => counts[n]++);

  const layout = hasDoubleZero ? [
    [0, 3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36],
    [37, 2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35],
    [null, 1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34]
  ] : [
    [0, 3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36],
    [null, 2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35],
    [null, 1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34]
  ];

  if (!plainGrid) return;
  plainGrid.innerHTML = "";
  gridCellByNum.clear();

  layout.flat().forEach(n => {
    const d = document.createElement("div");
    if (n === null) {
      d.className = "number-item empty";
      d.textContent = "";
    } else {
      d.className = "number-item";
      d.textContent = counts[n];
      d.style.background = getRedShade(counts[n]);
      d.dataset.num = n;
      gridCellByNum.set(n, d);
    }
    plainGrid.appendChild(d);
  });
}

function flashGridCell(num) {
  const cell = gridCellByNum.get(num);
  if (!cell) return;
  // restart animation if it was mid-flight
  cell.classList.remove("flash");
  // force reflow so the animation can re-trigger
  void cell.offsetWidth;
  cell.classList.add("flash");
  setTimeout(() => cell.classList.remove("flash"), 1000);
}

  function updateComboTable() {
    const k = +slider.value;
    const slice = k ? history.slice(-k) : [];
    if (!comboBody) return;
    comboBody.innerHTML = "";
    combos.forEach(c => {
      let lastIndex = null;
      slice.forEach((n, i) => {
        if (n >= 1 && n <= 36) {
          const size = n <= 18 ? "Low" : "High";
          const color = redNumbers.includes(n) ? "Red" : "Black";
          const parity = n % 2 === 0 ? "Even" : "Odd";
          const key = `${size}-${color}-${parity}`;
          if (key === c) lastIndex = i;
        }
      });
      const spinsAgo = lastIndex === null ? "-" : (slice.length - lastIndex);
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${c} (${comboNumbersMap[c].join(", ")})</td><td>${spinsAgo}</td>`;
      comboBody.appendChild(tr);
    });
  }

  /* ------------ Numpads ------------ */
  function createTableNumpad() {
    numpad.innerHTML = '';
    numpad.style.gridTemplateColumns = 'repeat(13, 1fr)';
    const layout = hasDoubleZero ? [
      [0, 3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36],
      [37, 2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35],
      [null, 1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34]
    ] : [
      [0, 3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36],
      [null, 2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35],
      [null, 1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34]
    ];
    layout.flat().forEach(n => {
      const btn = document.createElement('button');
      btn.style.fontSize = '11px';
      btn.style.padding = '4px';
      if (n === null) {
        btn.disabled = true;
        btn.style.background = 'transparent';
      } else if (n === 0) {
        btn.textContent = '0';
        btn.style.background = 'green';
      } else if (n === 37) {
        btn.textContent = '00';
        btn.style.background = 'green';
      } else {
        btn.textContent = n;
        btn.style.background = redNumbers.includes(n) ? 'red' : 'black';
      }
      if (n !== null) btn.addEventListener('pointerdown', () => enterNumber(n));
      numpad.appendChild(btn);
    });
  }

  function createDefaultNumpad() {
    numpad.innerHTML = '';
    numpad.style.gridTemplateColumns = 'repeat(6, 1fr)';
    for (let i = 1; i <= 36; i++) {
      const btn = document.createElement('button');
      btn.textContent = i;
      btn.style.background = 'yellow';
      btn.style.color = 'black';
      btn.addEventListener('pointerdown', () => enterNumber(i));
      numpad.appendChild(btn);
    }
    // add 0 and (if american) 00
    ['0', hasDoubleZero ? '00' : null].forEach(label => {
      if (!label) return;
      const btn = document.createElement('button');
      btn.textContent = label;
      btn.style.background = 'green';
      btn.addEventListener('pointerdown', () => enterNumber(label === '0' ? 0 : 37));
      numpad.appendChild(btn);
    });
  }

  function toggleView() {
    if (!numpad) return;
    tableView = !tableView;
    if (tableView) createTableNumpad(); else createDefaultNumpad();
  }
  window.toggleView = toggleView;

  /* ------------ Core Actions ------------ */
  function appendHistoryChip(num) {
    const div = document.createElement('div');
    div.textContent = labelFor(num);
    div.style.background = (num === 0 || (hasDoubleZero && num === 37)) ? 'green' :
                           redNumbers.includes(num) ? 'red' : 'black';
    // only last chip removable
    div.addEventListener("click", () => {
      if (history.length > 0 && div === historyLog.lastChild) {
        history.pop();
        historyLog.removeChild(div);
        document.querySelectorAll(".totalCount").forEach(el => el.textContent = history.length);
        slider.max = history.length || 1;
        slider.value = history.length || 1;
        sliderValueSpan.textContent = slider.value;
        afterHistoryMutated();
        persist();
        updateHistoryPlaceholder();
      }
    });
    historyLog.appendChild(div);
    historyLog.scrollLeft = historyLog.scrollWidth;
  }

  function enterNumber(num) {
    history.push(num);
    document.querySelectorAll(".totalCount")?.forEach(el => el.textContent = history.length);
    appendHistoryChip(num);
    updateHistoryPlaceholder();

    slider.max = history.length;
    slider.value = history.length;
    sliderValueSpan.textContent = slider.value;

    afterHistoryMutated();
      flashGridCell(num);         // <-- flash the just-entered number

    persist();
  }
  window.enterNumber = enterNumber;

  function rebuildHistoryLog() {
    historyLog.innerHTML = '';
    const frag = document.createDocumentFragment();
    history.forEach(n => {
      const d = document.createElement('div');
      d.textContent = labelFor(n);
      d.style.background = (n === 0 || (hasDoubleZero && n === 37)) ? 'green' :
                           redNumbers.includes(n) ? 'red' : 'black';
      frag.appendChild(d);
    });
    historyLog.appendChild(frag);
    historyLog.scrollLeft = historyLog.scrollWidth;
  }

  function afterHistoryMutated() {
    updateBars();
    updateCharts();
    updateGrid();
    updateComboTable();
    updateFreqChart();
    updateStreakTable(); 
  }

  function resetAll() {
    if (!history.length) { alert('Nothing to reset.'); return; }
    if (!confirm('Reset all history?')) return;
    history.length = 0;
    historyLog.innerHTML = '';
    document.querySelectorAll(".totalCount").forEach(el => el.textContent = history.length);
    slider.max = 0;
    slider.value = 0;
    sliderValueSpan.textContent = "0";
    resetCharts();
    updateBars();
    updateGrid();
    updateComboTable();
    updateFreqChart();
    persist();
    updateHistoryPlaceholder();
    updateStreakTable();
  }
  window.resetAll = resetAll;

  /* ------------ Dialog toggle for charts via bars ------------ */
  document.getElementById("halfBar")?.addEventListener("click", () => {
    const chart = document.getElementById("halfChart");
    chart.style.display = chart.style.display === "none" ? "block" : "none";
  });
  document.getElementById("colorBar")?.addEventListener("click", () => {
    const chart = document.getElementById("colorChart");
    chart.style.display = chart.style.display === "none" ? "block" : "none";
  });
  document.getElementById("parityBar")?.addEventListener("click", () => {
    const chart = document.getElementById("parityChart");
    chart.style.display = chart.style.display === "none" ? "block" : "none";
  });

  /* ------------ Slider ------------ */
  slider.addEventListener('input', () => {
    sliderValueSpan.textContent = slider.value;
    afterHistoryMutated();
  });

  /* ------------ Test Simulation ------------ */
  function openTestDialog() {
    document.getElementById("testDialog").style.display = "flex";
  }
  function closeTestDialog() {
    document.getElementById("testDialog").style.display = "none";
  }
  window.openTestDialog = openTestDialog;
  window.closeTestDialog = closeTestDialog;

  function toggleControls(running) {
    const runBtn = document.querySelector(".btn-test");
    const resetBtn = document.querySelector(".btn-reset");
    const voiceBtn = document.querySelector(".btn-voice");
    const viewBtn  = document.querySelector(".btn-view");

    if (running) {
      runBtn.textContent = "Stop Test";
      runBtn.classList.add("stop");
      runBtn.onclick = stopTest;

      [resetBtn, voiceBtn, viewBtn].forEach(b => { if (b) { b.disabled = true; b.style.opacity = "0.5"; } });
    } else {
      runBtn.textContent = "Run Test";
      runBtn.classList.remove("stop");
      runBtn.onclick = openTestDialog;

      [resetBtn, voiceBtn, viewBtn].forEach(b => { if (b) { b.disabled = false; b.style.opacity = "1"; } });
    }
  }

  function showResultPopup(count) {
    const overlay = document.createElement("div");
    overlay.className = "dialog-overlay";
    const content = document.createElement("div");
    content.className = "dialog-content";
    content.innerHTML = `
      <h3>Test Complete</h3>
      <p>Successfully simulated <strong>${count}</strong> spins.</p>
      <div style="margin-top:10px; text-align:right;">
        <button onclick="this.closest('.dialog-overlay').remove()">OK</button>
      </div>`;
    overlay.appendChild(content);
    document.body.appendChild(overlay);
  }

  async function startTest() {
    const input = document.getElementById("testCount").value.trim();
    const x = parseInt(input, 10);
    if (isNaN(x) || x <= 0) { alert("Please enter a valid positive number."); return; }

    const speed = document.getElementById("speedSelect").value;
    closeTestDialog();

    testRunning = true; stopRequested = false;
    toggleControls(true);

    let baseDelays = { fast: 50, regular: 150, slow: 600 };
    if (x > 500) {
      const factor = Math.min(1, 500 / x);
      baseDelays.fast = Math.max(5, baseDelays.fast * factor);
      baseDelays.regular = Math.max(20, baseDelays.regular * factor);
      baseDelays.slow = Math.max(80, baseDelays.slow * factor);
    }
    const delay = baseDelays[speed];

    const maxIndex = hasDoubleZero ? 37 : 36; // inclusive top for Math.random range
    for (let i = 0; i < x; i++) {
      if (stopRequested) break;
      const rand = Math.floor(Math.random() * (maxIndex + 1)); // includes 0 and maybe 37
      enterNumber(rand);
      // small await to visualize
      await new Promise(res => setTimeout(res, delay));
    }

    testRunning = false;
    toggleControls(false);
    if (!stopRequested) showResultPopup(x);
  }
  function stopTest() { if (testRunning) stopRequested = true; }

  window.startTest = startTest;

  /* ------------ Voice Recognition ------------ */
  if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onstart = () => {
      updateVoiceButton("Please wait...", "active");
    };
    recognition.onaudiostart = () => {
      updateVoiceButton("🟢 Listening...", "active");
    };
    recognition.onspeechstart = () => {
      updateVoiceButton("👄 Speech detected", "active");
    };
    recognition.onspeechend = () => {
      updateVoiceButton("🛑 Speech ended", "active");
    };
    recognition.onend = () => {
      listening = false;
      updateVoiceButton("🎤 Voice Input", "");
    };
    recognition.onerror = (e) => {
      console.log("Voice error:", e.error);
      stopListening();
    };
    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          const transcript = event.results[i][0].transcript.trim().toLowerCase();
          const tokens = transcript.split(/\s+/);
          for (let j = 0; j < tokens.length; j++) {
            const current = tokens[j];
            const num = parseSpokenNumber(current);
            if (num !== null) enterNumber(num);
          }
        }
      }
    };
  }

  function parseSpokenNumber(word) {
    word = word.trim().toLowerCase();
    if (word === "zero" || word === "0") return 0;
    if (hasDoubleZero && word.includes("double")) return 37;
    const smallNums = { one:1, two:2, three:3, four:4, for:4, five:5, six:6, seven:7, eight:8, ate:8, nine:9 };
    if (smallNums[word] !== undefined) return smallNums[word];
    const n = parseInt(word, 10);
    if (!isNaN(n) && n >= 1 && n <= 36) return n;
    return null;
  }

  function toggleListening() {
    if (!recognition) return;
    if (!listening) {
      if (!chosenLang) {
        document.getElementById("langDialog").style.display = "flex";
        return;
      }
      recognition.lang = chosenLang;
      recognition.start();
      listening = true;
    } else {
      stopListening();
    }
  }
  function stopListening() {
    if (recognition && listening) recognition.stop();
  }
  function updateVoiceButton(text, cssClass) {
    const btn = document.querySelector(".btn-voice");
    if (!btn) return;
    btn.textContent = text;
    if (cssClass) btn.classList.add(cssClass);
    else btn.classList.remove("active");
  }
  window.toggleListening = toggleListening;

  function confirmLanguage() {
    chosenLang = document.getElementById("langSelect").value;
    document.getElementById("langDialog").style.display = "none";
    recognition.lang = chosenLang;
    recognition.start();
    listening = true;
  }
  function closeLangDialog() {
    document.getElementById("langDialog").style.display = "none";
  }
  window.confirmLanguage = confirmLanguage;
  window.closeLangDialog = closeLangDialog;
/* ---------- Longest & Current Streaks ---------- */

// map number -> segment key for each bar group
function segColumn(n) {
  if (n === 0 || (hasDoubleZero && n === 37)) return "zero";
  return (n % 3 === 1) ? "col1" : (n % 3 === 2 ? "col2" : "col3");
}
function segDozen(n) {
  if (n === 0 || (hasDoubleZero && n === 37)) return "zero";
  if (n <= 12) return "d1";
  if (n <= 24) return "d2";
  return "d3";
}
function segHalf(n) {
  if (n === 0 || (hasDoubleZero && n === 37)) return "zero";
  return n <= 18 ? "low" : "high";
}
function segColor(n) {
  if (n === 0 || (hasDoubleZero && n === 37)) return "zero";
  return redNumbers.includes(n) ? "red" : "black";
}
function segParity(n) {
  if (n === 0 || (hasDoubleZero && n === 37)) return "zero";
  return (n % 2 === 0) ? "even" : "odd";
}

// longest streak per segment over the slice
function longestBySegment(slice, groupFn, allKeys) {
  const max = Object.fromEntries(allKeys.map(k => [k, 0]));
  let curKey = null, curLen = 0;

  for (const n of slice) {
    const key = groupFn(n);
    if (key == null) { curKey = null; curLen = 0; continue; }
    if (key === curKey) curLen += 1;
    else { curKey = key; curLen = 1; }
    if (max[key] < curLen) max[key] = curLen;
  }
  return max;
}

// current streak (ending at the last spin) for each segment
function currentBySegment(slice, groupFn, allKeys) {
  const out = Object.fromEntries(allKeys.map(k => [k, 0]));
  if (slice.length === 0) return out;

  const lastKey = groupFn(slice[slice.length - 1]);
  let len = 0;
  for (let i = slice.length - 1; i >= 0; i--) {
    if (groupFn(slice[i]) === lastKey) len++;
    else break;
  }
  if (lastKey != null) out[lastKey] = len;
  return out;
}

// display labels (renamed column header to "Group")
const LABELS = {
  columns: { col1: "Col1", col2: "Col2", col3: "Col3" },
  dozens:  { d1: "1st 12", d2: "2nd 12", d3: "3rd 12" },
  halves:  { low: "Low", high: "High" },
  colors:  { red: "Red", black: "Black" },
  parity:  { even: "Even", odd: "Odd" }
};

function updateStreakTable() {
  const k = +slider.value;
  const slice = k ? history.slice(-k) : [];
  const tbody = document.getElementById("streakBody");
  if (!tbody) return;

  // keys WITHOUT zero (we'll add a single Zero row at the end)
  const colKeys = ["col1","col2","col3"];
  const dozKeys = ["d1","d2","d3"];
  const halKeys = ["low","high"];
  const colrKeys = ["red","black"];
  const parKeys = ["even","odd"];

  const colMax = longestBySegment(slice, segColumn, colKeys);
  const dozMax = longestBySegment(slice, segDozen,  dozKeys);
  const halMax = longestBySegment(slice, segHalf,   halKeys);
  const clrMax = longestBySegment(slice, segColor,  colrKeys);
  const parMax = longestBySegment(slice, segParity, parKeys);

  const colCur = currentBySegment(slice, segColumn, colKeys);
  const dozCur = currentBySegment(slice, segDozen,  dozKeys);
  const halCur = currentBySegment(slice, segHalf,   halKeys);
  const clrCur = currentBySegment(slice, segColor,  colrKeys);
  const parCur = currentBySegment(slice, segParity, parKeys);

  // render (no left "group" column; first column is the segment label itself)
  tbody.innerHTML = "";

  const addRows = (keys, labelMap, maxMap, curMap) => {
    keys.forEach(key => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${labelMap[key]}</td>
        <td>${maxMap[key] || 0}</td>
        <td>${curMap[key] || 0}</td>
      `;
      tbody.appendChild(tr);
    });
  };

  addRows(colKeys, LABELS.columns, colMax, colCur);
  addRows(dozKeys, LABELS.dozens,  dozMax, dozCur);
  addRows(halKeys, LABELS.halves,  halMax, halCur);
  addRows(colrKeys, LABELS.colors, clrMax, clrCur);
  addRows(parKeys, LABELS.parity,  parMax, parCur);

  // Single ZERO row at the very end (cover 0 and 00 if present)
  const zeroFn = n => (n === 0 || (hasDoubleZero && n === 37)) ? "zero" : "x";
  const zeroMax = longestBySegment(slice, zeroFn, ["zero","x"])["zero"] || 0;
  const zeroCur = currentBySegment(slice, zeroFn, ["zero","x"])["zero"] || 0;

  const ztr = document.createElement("tr");
  ztr.innerHTML = `<td>Zero</td><td>${zeroMax}</td><td>${zeroCur}</td>`;
  tbody.appendChild(ztr);
}

  /* ------------ Init ------------ */
  function init() {
    createTableNumpad();
    loadPersisted();

    document.querySelectorAll(".totalCount").forEach(el => el.textContent = history.length);
    slider.max = history.length;
    slider.value = history.length;
    sliderValueSpan.textContent = slider.value;

    updateBars();
    updateCharts();
    updateComboTable();
    updateGrid();
    updateFreqChart();
    updateHistoryPlaceholder();
    updateStreakTable();

    // hide charts initially
    document.getElementById("halfChart").style.display = "none";
    document.getElementById("colorChart").style.display = "none";
    document.getElementById("parityChart").style.display = "none";
  }

  init();
}
