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
      { p: (counts.col1 / t) * 100, color: '#16a085', label: 'Col1' },
      { p: (counts.col2 / t) * 100, color: 'purple', label: 'Col2' },
      { p: (counts.col3 / t) * 100, color: '#4A90E2', label: 'Col3' },
      { p: (counts.zero / t) * 100, color: 'green', label: '' }
    ]);
    fillBar(dozenBar, [
      { p: (counts.doz1 / t) * 100, color: 'black', label: '1st 12' },
      { p: (counts.doz2 / t) * 100, color: '#16a085', label: '2nd 12' },
      { p: (counts.doz3 / t) * 100, color: 'red', label: '3rd 12' },
      { p: (counts.zero / t) * 100, color: 'green', label: '' }
    ]);
    fillBar(halfBar, [
      { p: (counts.low / t) * 100, color: '#2980b9', label: 'Low' },
      { p: (counts.high / t) * 100, color: 'orange', label: 'High' },
      { p: (counts.zero / t) * 100, color: 'green', label: ' ' }
    ]);

// Sync CSS variable --low-color to header/footer based on Low segment color
try {
  const lowSeg = halfBar && halfBar.querySelector('.bar-segment');
  if (lowSeg) {
    const lowCol = lowSeg.style.background || getComputedStyle(lowSeg).backgroundColor;
    document.documentElement.style.setProperty('--low-color', lowCol);
  }
} catch(e) { /* no-op */ }

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

  /* ------------ Highlighting Functions ------------ */
  function getBarHighlightEnabled() {
    try {
      return JSON.parse(localStorage.getItem('roulette_bar_highlight') || 'true');
    } catch (e) {
      return true;
    }
  }

  function getHeatmapHighlightEnabled() {
    try {
      return JSON.parse(localStorage.getItem('roulette_heatmap_highlight') || 'true');
    } catch (e) {
      return true;
    }
  }

  function highlightBarSegments(num) {
    if (num === 0 || (hasDoubleZero && num === 37)) {
      // Highlight green segments for zeros
      document.querySelectorAll('.bar-segment').forEach(segment => {
        if (segment.style.background === 'green' || segment.style.backgroundColor === 'green') {
          segment.classList.add('highlight');
          setTimeout(() => segment.classList.remove('highlight'), 1500);
        }
      });
      return;
    }

    // Regular numbers 1-36
    const isRed = redNumbers.includes(num);
    const isLow = num <= 18;
    const isEven = num % 2 === 0;
    const column = (num % 3 === 1) ? 1 : (num % 3 === 2 ? 2 : 3);
    const dozen = num <= 12 ? 1 : (num <= 24 ? 2 : 3);

    // Highlight relevant segments
    document.querySelectorAll('.bar-segment').forEach(segment => {
      const text = segment.textContent.toLowerCase();
      let shouldHighlight = false;

      // Column highlighting
      if (text.includes(`col${column}`) || text === `col${column}`) shouldHighlight = true;
      
      // Dozen highlighting
      if (text.includes(`${dozen}st 12`) || text.includes(`${dozen}nd 12`) || text.includes(`${dozen}rd 12`)) shouldHighlight = true;
      
      // Color highlighting
      if ((isRed && (text === 'red' || text.includes('red'))) ||
          (!isRed && (text === 'black' || text.includes('black')))) shouldHighlight = true;
      
      // High/Low highlighting
      if ((isLow && (text === 'low' || text.includes('low'))) ||
          (!isLow && (text === 'high' || text.includes('high')))) shouldHighlight = true;
      
      // Even/Odd highlighting
      if ((isEven && (text === 'even' || text.includes('even'))) ||
          (!isEven && (text === 'odd' || text.includes('odd')))) shouldHighlight = true;

      if (shouldHighlight) {
        segment.classList.add('highlight');
        setTimeout(() => segment.classList.remove('highlight'), 1500);
      }
    });
  }

  function wireHighlightSettings() {
    const barToggle = document.getElementById('toggleBarHighlight');
    const heatmapToggle = document.getElementById('toggleHeatmapHighlight');
    
    if (barToggle) {
      barToggle.checked = getBarHighlightEnabled();
      barToggle.addEventListener('change', () => {
        localStorage.setItem('roulette_bar_highlight', barToggle.checked);
      });
    }
    
    if (heatmapToggle) {
      heatmapToggle.checked = getHeatmapHighlightEnabled();
      heatmapToggle.addEventListener('change', () => {
        localStorage.setItem('roulette_heatmap_highlight', heatmapToggle.checked);
      });
    }
  }

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
    
    // Highlight heatmap if enabled
    const heatmapEnabled = getHeatmapHighlightEnabled();
    if (heatmapEnabled) {
      flashGridCell(num);
    }
    
    // Highlight bar segments if enabled
    const barEnabled = getBarHighlightEnabled();
    if (barEnabled) {
      highlightBarSegments(num);
    }

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

  // Custom confirmation dialog
  function showConfirm(title, message) {
    return new Promise((resolve) => {
      const dialog = document.getElementById('confirmDialog');
      const titleEl = document.getElementById('confirmTitle');
      const messageEl = document.getElementById('confirmMessage');
      const okBtn = document.getElementById('confirmOk');
      const cancelBtn = document.getElementById('confirmCancel');
      
      titleEl.textContent = title;
      messageEl.textContent = message;
      
      function cleanup() {
        okBtn.removeEventListener('click', handleOk);
        cancelBtn.removeEventListener('click', handleCancel);
        dialog.removeEventListener('close', handleCancel);
      }
      
      function handleOk() {
        cleanup();
        dialog.close();
        resolve(true);
      }
      
      function handleCancel() {
        cleanup();
        dialog.close();
        resolve(false);
      }
      
      okBtn.addEventListener('click', handleOk);
      cancelBtn.addEventListener('click', handleCancel);
      dialog.addEventListener('close', handleCancel);
      
      dialog.showModal();
    });
  }

  async function resetAll() {
    if (!history.length) { 
      await showConfirm('Nothing to Reset', 'No history data to clear.');
      return; 
    }
    
    const confirmed = await showConfirm('Reset Confirmation', 'Are you sure you want to reset all history data? This action cannot be undone.');
    if (!confirmed) return;
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
    if (x > 5000) { alert("Maximum limit is 5000 spins. Please enter a smaller number."); return; }

    const speed = document.getElementById("speedSelect").value;
    
    // Check history action option
    const historyActionEl = document.querySelector('input[name="historyAction"]:checked');
    const historyAction = historyActionEl ? historyActionEl.value : 'reset';
    if (historyAction === 'reset') {
      // Reset history without confirmation dialog for test simulation
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
    
    closeTestDialog();

    testRunning = true; stopRequested = false;
    toggleControls(true);

    let baseDelays = { fast: 50, regular: 150, slow: 600 };
    
    // More aggressive speed scaling - reduce delays significantly for large numbers
    if (x >= 100) {
      // Calculate speed factor based on spin count
      let speedFactor = 1;
      
      if (x >= 500) {
        speedFactor = Math.floor(x / 500) * 3; // 3x faster for every 500 spins
      } else if (x >= 100) {
        speedFactor = 1 + Math.floor((x - 100) / 100) * 0.5; // 0.5x faster for every 100 spins under 500
      }
      
      baseDelays.fast = Math.max(1, Math.round(baseDelays.fast / speedFactor));
      baseDelays.regular = Math.max(2, Math.round(baseDelays.regular / speedFactor));
      baseDelays.slow = Math.max(5, Math.round(baseDelays.slow / speedFactor));
      
      console.log(`Speed calculation for ${x} spins:`, {
        speedFactor,
        delays: baseDelays,
        selectedSpeed: speed,
        finalDelay: baseDelays[speed]
      });
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
    
    // Initialize highlight settings
    wireHighlightSettings();
  }

  init();
}


/* ===== RouMate Auth, Settings, Help, Board Popup (base) ===== */
(function(){
  // Supabase init (replace with your values)
  let supabaseClient = null;
  try {
    if (window.supabase && window.supabase.createClient) {
      const SUPABASE_URL = "https://YOUR_SUPABASE_URL";
      const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";
      supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      window.__supabase = supabaseClient;
    }
  } catch (e) {}

  const HELP_PREF_KEY = "roumate_hide_help";

  function getHideHelp() { try { return localStorage.getItem(HELP_PREF_KEY) === "1"; } catch { return false; } }
  function setHideHelp(v) { try { localStorage.setItem(HELP_PREF_KEY, v ? "1" : "0"); } catch {} }

  // Theme functions
  function applyTheme(theme) {
    const body = document.body;
    // Remove existing theme classes
    body.classList.remove("theme-light", "theme-dark");
    
    // Apply new theme class
    if (theme === "light") {
      body.classList.add("theme-light");
    } else if (theme === "dark") {
      body.classList.add("theme-dark");
    }
    // Default theme doesn't need a class - uses original background
  }

  function initTheme() {
    const savedTheme = localStorage.getItem("roulette-theme") || "default";
    applyTheme(savedTheme);
  }

  function renderHelpMarks() {
    const hide = getHideHelp();
    document.querySelectorAll(".help-qs").forEach(el => el.classList.toggle("hidden", hide));
  }

  function wireHeader() {
    document.querySelectorAll("[data-close-dialog]").forEach(b => {
      b.addEventListener("click", e => {
        const dlg = e.target.closest("dialog"); if (dlg && dlg.open) dlg.close();
      });
    });
    const btnAccount = document.getElementById("btnAccount");
    const btnSettings = document.getElementById("btnSettings");
    const accountDialog = document.getElementById("accountDialog");
    const settingsDialog = document.getElementById("settingsDialog");
    btnAccount && btnAccount.addEventListener("click", ()=> accountDialog && accountDialog.showModal());
    btnSettings && btnSettings.addEventListener("click", ()=> {
      const chk = document.getElementById("toggleHideHelp");
      if (chk) chk.checked = getHideHelp();
      
      // Load current theme
      const themeSelector = document.getElementById("themeSelector");
      if (themeSelector) {
        const currentTheme = localStorage.getItem("roulette-theme") || "default";
        themeSelector.value = currentTheme;
      }
      
      settingsDialog && settingsDialog.showModal();
    });

    // Theme selector handler
    document.getElementById("themeSelector")?.addEventListener("change", (e) => {
      const theme = e.target.value;
      applyTheme(theme);
      localStorage.setItem("roulette-theme", theme);
    });

    document.getElementById("btnSupportSettings")?.addEventListener("click", ()=> alert("Support: email support@yourdomain.com"));
  }

  function wireHelpDialog() {
    const helpDialog = document.getElementById("helpDialog");
    const helpTitle = document.getElementById("helpTitle");
    const helpBody = document.getElementById("helpBody");
    const copy = {
      statistics: "<p><strong>Statistics Overview:</strong> This section displays a comprehensive analysis of your roulette spins including win/loss patterns for basic bets (red/black, even/odd, low/high numbers 1-18/19-36), performance across dozens (1-12, 13-24, 25-36) and columns, current winning/losing streaks, and a visual heatmap showing which numbers have appeared most frequently.</p><p><strong>Statistical Bars & Percentages:</strong> The colored bars show the distribution of your spins across different categories. Each bar displays percentages indicating how often each outcome occurred (Columns 1-3, Dozens 1st-3rd, Low/High, Red/Black, Even/Odd). The percentages help you see if results are close to expected probabilities or show significant deviations.</p><p><strong>Data Range Control:</strong> The slider at the top allows you to focus your analysis on recent spins vs. your entire session. The display shows 'last X out of Y total' where X is the number of recent spins being analyzed (controlled by the slider) and Y is your total session spins. Move the slider left to analyze fewer recent spins (good for spotting current trends), or right to include more of your session history (better for overall patterns).</p>", slider: "<p><strong>Data Range Slider:</strong> Use this slider to focus your statistical analysis on a specific range of recent spins. Move the slider left to analyze only your most recent spins (useful for spotting recent trends), or move it right to include your entire session history. The number shows how many of your total spins are being analyzed.</p>",
      heatmap: "<p><strong>Number Heatmap:</strong> This color-coded grid shows the frequency of each number in your selected spin range. It’s Darker/warmer colors indicate numbers that have appeared more often ('hot' numbers), while lighter/cooler colors show numbers that have appeared less frequently ('cold' numbers). Remember: past results don't predict future outcomes in roulette.</p><p><strong>Frequency Chart:</strong> The bar chart below the heatmap provides an alternative visualization of the same data, showing each number's frequency as vertical bars. Higher bars indicate numbers that have appeared more often.</p><p><strong>Combination Analysis:</strong> This table tracks complex number patterns by showing when specific three-way combinations last occurred. Each combination represents numbers that are simultaneously Low/High, Red/Black, AND Even/Odd (e.g., 'Low-Red-Even' for numbers like 2, 12, 18). The 'Spins Ago' column shows how many spins have passed since each combination last appeared, helping you spot patterns in recent number characteristics.</p>",
      combos: "<p><strong>Combination Analysis:</strong> This table shows how often different bet combinations have won together in your spins. For example, it tracks when a number was both Red AND Even, or Low AND Odd, etc. This helps you see patterns across multiple bet types and understand how different betting strategies would have performed with your actual spin results.</p>",
      streaks:"<p><strong>Streak Tracking:</strong> This section monitors consecutive wins for different bet types. It shows your current active streaks (how many times in a row red, even, low, etc. have won) as well as your longest streaks achieved during this session. Useful for understanding recent momentum and historical patterns in your game.</p>"
    };
    document.addEventListener("click", (e) => {
      const qs = e.target.closest(".help-qs");
      if (!qs) return;
      const key = qs.dataset.help || "help";
      const titles = {
        statistics: "Statistics Overview",
        slider: "Data Range Slider",
        heatmap: "Number Heatmap",
        combos: "Combination Analysis",
        streaks: "Streak Tracking"
      };
      helpTitle.textContent = titles[key] || "Help";
      helpBody.innerHTML = copy[key] || "<p>No help available.</p>";
      if (helpDialog && !helpDialog.open) helpDialog.showModal();
    });
  }

  function wireBoardPopup() {
    const boardDialog = document.getElementById("boardDialog");
    const boardImg = document.getElementById("boardImg");
    function openBoard() {
      if (boardImg) boardImg.src = "roulette_board.jpg";
      if (boardDialog && !boardDialog.open) boardDialog.showModal();
    }
    // Updated to use the correct IDs from HTML
    const containers = ["#colBar", "#dozenBar", "[data-board-popup]"];
    containers.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => { el.addEventListener("click", openBoard); });
    });
    document.addEventListener("click", (e)=>{
      const t = e.target;
      if (!t) return;
      const hit = t.closest("#colBar, #dozenBar, [data-board-popup]");
      if (hit) openBoard();
    }, true);
  }

  // Basic auth UI (optional): refresh panels
  async function refreshAuthUI() {
    const supabase = window.__supabase;
    const authPanel = document.getElementById("authPanel");
    const profilePanel = document.getElementById("profilePanel");
    if (!supabase || !authPanel || !profilePanel) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      authPanel.hidden = true; profilePanel.hidden = false;
      document.getElementById("pfEmail").value = session.user.email || "";
      try {
        const { data: prof } = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
        if (prof) {
          document.getElementById("pfFirstName").value = prof.first_name || "";
          document.getElementById("pfLastName").value = prof.last_name || "";
        }
      } catch {}
    } else {
      authPanel.hidden = false; profilePanel.hidden = true;
    }
  }

  function wireAuth() {
    const supabase = window.__supabase;
    if (!supabase) return;
    supabase.auth.onAuthStateChange(() => refreshAuthUI());
    document.getElementById("btnGoogle")?.addEventListener("click", ()=> supabase.auth.signInWithOAuth({ provider:"google" }));
    document.getElementById("btnApple")?.addEventListener("click", ()=> supabase.auth.signInWithOAuth({ provider:"apple" }));
    // Handle sign out buttons (there might be multiple with same ID)
    const signOutButtons = document.querySelectorAll("#btnSignOut");
    signOutButtons.forEach(button => {
      button?.addEventListener("click", (e) => { 
        e.preventDefault();
        console.log('Sign out clicked'); // Debug log
        // For now, simply redirect to signin page (works for both Supabase and simulated auth)
        window.location.href = 'signin.html';
      });
    });
    document.getElementById("emailSignupForm")?.addEventListener("submit", async (e)=>{
      e.preventDefault();
      const first_name = (document.getElementById("firstName").value||"").trim();
      const last_name = (document.getElementById("lastName").value||"").trim();
      const email = (document.getElementById("email").value||"").trim();
      const password = document.getElementById("password").value;
      const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { first_name, last_name } } });
      if (error) return alert(error.message);
      if (data.user) { try { await supabase.from("profiles").upsert({ id: data.user.id, first_name, last_name, email }); } catch {} }
      alert("Check your email to confirm your account."); await refreshAuthUI();
    });
    document.getElementById("emailSigninForm")?.addEventListener("submit", async (e)=>{
      e.preventDefault();
      const email = (document.getElementById("signinEmail").value||"").trim();
      const password = document.getElementById("signinPassword").value;
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return alert(error.message);
      await refreshAuthUI();
    });
    document.getElementById("btnChangePassword")?.addEventListener("click", async ()=>{
      alert("Password reset link will be sent to your email.");
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.email) await supabase.auth.resetPasswordForEmail(session.user.email, { redirectTo: location.href });
    });
    document.getElementById("btnSupport")?.addEventListener("click", ()=> alert("Support: email support@yourdomain.com"));
    refreshAuthUI();
  }

  // Boot
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ()=> {
      wireHeader(); wireHelpDialog(); wireBoardPopup();
      renderHelpMarks();
      initTheme();
    });
  } else {
    wireHeader(); wireHelpDialog(); wireBoardPopup();
    renderHelpMarks();
    initTheme();
  }
})();


/* ===== RouMate Enhancements v2 ===== */
(function(){
  const HELP_PREF_KEY = "roumate_hide_help";
  const SCALE_KEY = "roumate_text_scale";

  function getHideHelp() {
    try { return localStorage.getItem(HELP_PREF_KEY) === "1"; } catch { return false; }
  }
  function setHideHelp(v) {
    try { localStorage.setItem(HELP_PREF_KEY, v ? "1" : "0"); } catch {}
  }
  function applyTextScale(valPct) {
    const v = Math.max(85, Math.min(130, parseInt(valPct || 100, 10)));
    document.documentElement.style.setProperty("--app-text-scale", (v/100).toString());
    try { localStorage.setItem(SCALE_KEY, String(v)); } catch {}
    const out = document.getElementById("textScaleVal");
    if (out) out.textContent = v + "%";
  }
  function loadTextScale() {
    let v = 100;
    try { v = parseInt(localStorage.getItem(SCALE_KEY) || "100", 10); } catch {}
    applyTextScale(v);
    const slider = document.getElementById("textScale");
    if (slider) slider.value = v;
  }

  function insertHelpMark(el, key) {
    if (!el || el.querySelector(".help-qs[data-help='"+key+"']")) return;
    const span = document.createElement("span");
    span.className = "help-qs";
    span.dataset.help = key;
    span.textContent = "?";
    el.appendChild(span);
  }

  function addDynamicHelp() {
    // Headers appearing after app renders
    document.querySelectorAll("h2, h3").forEach(h => {
      const txt = (h.textContent||"").toLowerCase();
      if (txt.includes("number frequency heatmap")) insertHelpMark(h, "heatmap");
      if (txt.includes("combination")) insertHelpMark(h, "combos");
      if (txt.includes("longest") && txt.includes("streak")) insertHelpMark(h, "streaks");
    });
    // Slider help
    const slider = document.getElementById("slider") || document.querySelector("input[type='range']");
    if (slider) {
      const label = document.querySelector("label[for='slider'], #sliderLabel, .slider-label") || slider.parentElement;
      if (label) insertHelpMark(label, "slider");
    }
    renderHelpMarks();
  }

  function renderHelpMarks() {
    const hide = getHideHelp();
    document.querySelectorAll(".help-qs").forEach(el => el.classList.toggle("hidden", hide));
  }

  // Variant switch: checked = American, unchecked = European
  function setVariantSwitchFromLocation() {
    const chk = document.getElementById("toggleVariant");
    if (!chk) return;
    const isAmerican = /american\.html$/i.test(location.pathname);
    chk.checked = isAmerican;
  }
  function wireVariantSwitch() {
    const chk = document.getElementById("toggleVariant");
    if (!chk) return;
    chk.addEventListener("change", ()=> {
      const target = chk.checked ? "american.html" : "european.html";
      if (!location.pathname.endsWith(target)) location.href = target;
    });
    setVariantSwitchFromLocation();
  }

  // Robust board popup
  function wireBoardPopupRobust() {
    const boardDialog = document.getElementById("boardDialog");
    const boardImg = document.getElementById("boardImg");
    function openBoard() {
      if (boardImg) boardImg.src = "roulette_board.jpg";
      if (boardDialog && !boardDialog.open) boardDialog.showModal();
    }
    // Updated to use the correct IDs from HTML
    const containers = ["#colBar", "#dozenBar", "[data-board-popup]"];
    containers.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => { el.addEventListener("click", openBoard); });
    });
    document.addEventListener("click", (e)=>{
      const t = e.target;
      if (!t) return;
      const hit = t.closest("#colBar, #dozenBar, [data-board-popup]");
      if (hit) openBoard();
    }, true);
  }

  function classifyStreaksTable() {
    const heads = Array.from(document.querySelectorAll("h2, h3"));
    heads.forEach(h => {
      const txt = (h.textContent||"").toLowerCase();
      if (txt.includes("longest") && txt.includes("streak")) {
        let el = h.nextElementSibling;
        while (el && el.tagName !== "TABLE") el = el.nextElementSibling;
        if (el) el.classList.add("streaks-table");
      }
    });
  }

  function observeMutations() {
    const mo = new MutationObserver(()=> {
      addDynamicHelp();
      classifyStreaksTable();
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  function initSettingsUI() {
    // Hide-help switch
    const hideChk = document.getElementById("toggleHideHelp");
    if (hideChk) {
      hideChk.checked = getHideHelp();
      hideChk.addEventListener("change", e => { setHideHelp(e.target.checked); renderHelpMarks(); });
    }
    // Text scale slider
    const scale = document.getElementById("textScale");
    if (scale) {
      loadTextScale();
      const update = ()=> applyTextScale(scale.value);
      scale.addEventListener("input", update);
      scale.addEventListener("change", update);
    } else {
      loadTextScale();
    }
  }

  // Boot
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ()=>{
      wireVariantSwitch();
      initSettingsUI();
      wireBoardPopupRobust();
      addDynamicHelp();
      classifyStreaksTable();
      observeMutations();
    });
  } else {
    wireVariantSwitch();
    initSettingsUI();
    wireBoardPopupRobust();
    addDynamicHelp();
    classifyStreaksTable();
    observeMutations();
  }
})();


/* ===== RouMate v4 tweaks ===== */
(function(){
  // Keep Settings open across variant switch
  function setReopenSettingsFlag() {
    try { localStorage.setItem("__roumate_reopen_settings", "1"); } catch {}
  }
  function maybeReopenSettings() {
    try {
      const f = localStorage.getItem("__roumate_reopen_settings");
      if (f === "1") {
        localStorage.removeItem("__roumate_reopen_settings");
        const dlg = document.getElementById("settingsDialog");
        if (dlg && !dlg.open) dlg.showModal();
      }
    } catch {}
  }

  // Strengthen variant switch handler to persist reopen flag
  function reinforceVariantSwitch() {
    const chk = document.getElementById("toggleVariant");
    if (!chk) return;
    // set initial
    const isAmerican = /american\.html$/i.test(location.pathname);
    chk.checked = isAmerican;
    // on change -> set flag then navigate
    chk.addEventListener("change", ()=>{
      setReopenSettingsFlag();
      const target = chk.checked ? "american.html" : "european.html";
      if (!location.pathname.endsWith(target)) location.href = target;
    });
  }

  // Remove in-page roulette labels (not the header)
  function hideBodyRouletteTitles() {
    const header = document.querySelector(".app-header");
    document.querySelectorAll("h1, h2, h3").forEach(h => {
      const txt = (h.textContent||"").toLowerCase();
      const insideHeader = header && header.contains(h);
      if (!insideHeader && (txt.includes("american roulette") || txt.includes("european roulette"))) {
        h.style.display = "none";
      }
    });
  }

  // Ensure help mark next to statistics slider (explicit injection)
  function ensureSliderHelp() {
    const slider = document.getElementById("slider") || document.querySelector("input[type='range']");
    if (!slider) return;
    // avoid adding in settings dialog
    if (slider.closest("#settingsDialog")) return;
    // find a sibling label/container
    let host = document.querySelector("label[for='slider'], #sliderLabel, .slider-label");
    if (!host) host = slider.parentElement;
    if (!host) return;
    if (!host.querySelector(".help-qs[data-help='slider']")) {
      const span = document.createElement("span");
      span.className = "help-qs";
      span.dataset.help = "slider";
      span.textContent = "?";
      host.appendChild(span);
    }
    // Do not show help inside settings dialog
    document.querySelectorAll("#settingsDialog .help-qs").forEach(el=> el.remove());
  }

  // Export all charts to Excel (embeds images; not natively editable). Also adds a Data sheet.
  async function exportChartsToExcel(){
    const canvases = Array.from(document.querySelectorAll("canvas"));
    if (!canvases.length) { alert("No charts found."); return; }

    // Dynamically load ExcelJS from CDN if not present
    async function loadScript(src){
      return new Promise((res, rej)=>{
        if (document.querySelector(`script[src="${src}"]`)) return res();
        const s = document.createElement("script");
        s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s);
      });
    }
    await loadScript("https://cdn.jsdelivr.net/npm/exceljs/dist/exceljs.min.js");

    const wb = new ExcelJS.Workbook();
  function uniqueSheetName(wb, base) {
    let name = base, i = 1;
    while (wb.getWorksheet(name)) { name = base.slice(0, 28) + "-" + (++i); }
    return name;
  }

    const ts = new Date().toISOString().slice(0,19).replace(/[:T]/g,"-");

    // Add images and data
    canvases.forEach((c, i) => {
      const ws = wb.addWorksheet(`Chart ${i+1}`);
      const dataURL = c.toDataURL("image/png");
      const imgId = wb.addImage({ base64: dataURL.split(',')[1], extension: 'png' });
      // Place image starting at A1, size approximate to canvas
      ws.addImage(imgId, { tl: { col: 0, row: 0 }, ext: { width: c.width, height: c.height } });
    });

    // Optional: add a Data sheet (placeholder; you can wire actual datasets later)
    const ds = wb.addWorksheet("Data");
    ds.getCell("A1").value = "Note";
    ds.getCell("B1").value = "These charts are embedded images. They are not editable as native Excel charts. Export raw data to build Excel-native charts.";

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `RouMate-Charts-${ts}.xlsx`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=> URL.revokeObjectURL(a.href), 2000);
  }

  function wireExportToExcel(){
    const b = document.getElementById("btnExportCharts");
    if (b) b.addEventListener("click", exportChartsToExcel);
  }

  function boot(){
    maybeReopenSettings();
    reinforceVariantSwitch();
    hideBodyRouletteTitles();
    ensureSliderHelp();
    wireExportToExcel();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();


/* ===== RouMate v5 tweaks ===== */
(function(){
  // Strengthen board popup for first bars by listening in capture phase
  function wireBoardPopupExtraRobust(){
    const boardDialog = document.getElementById("boardDialog");
    const boardImg = document.getElementById("boardImg");
    function openBoard() {
      if (boardImg) boardImg.src = "roulette_board.jpg";
      if (boardDialog && !boardDialog.open) boardDialog.showModal();
    }
    const handler = (e)=>{
      const t = e.target;
      if (!t) return;
      if (t.closest("#colBar, #dozenBar, [data-board-popup]")) openBoard();
    };
    document.addEventListener("pointerdown", handler, true);
    document.addEventListener("click", handler, true);
  }

  async function exportDataTablesToExcel(){
    async function loadScript(src){
      return new Promise((res, rej)=>{
        if (document.querySelector(`script[src="${src}"]`)) return res();
        const s = document.createElement("script");
        s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s);
      });
    }
    await loadScript("https://cdn.jsdelivr.net/npm/exceljs/dist/exceljs.min.js");

    const wb = new ExcelJS.Workbook();
  function uniqueSheetName(wb, base) {
    let name = base, i = 1;
    while (wb.getWorksheet(name)) { name = base.slice(0, 28) + "-" + (++i); }
    return name;
  }

    const ts = new Date().toISOString().slice(0,19).replace(/[:T]/g,"-");

    // History sheet
    (function addHistory(){
      const ws = wb.addWorksheet(uniqueSheetName(wb, "Spins"));
      try {
        const isAmerican = /american\.html$/i.test(location.pathname);
        const key = isAmerican ? "american_roulette_v1" : "european_roulette_v1";
        const raw = localStorage.getItem(key);
        if (raw) {
          const obj = JSON.parse(raw);
          const hist = (obj && obj.history) ? obj.history : (Array.isArray(obj)? obj : []);
          ws.getCell(1,1).value = "Index";
          ws.getCell(1,2).value = "Number";
          hist.forEach((val, i)=>{
            ws.getCell(i+2,1).value = i+1;
            ws.getCell(i+2,2).value = (val && typeof val==="object" && val.n!=null) ? val.n : val;
          });
        } else {
          ws.getCell(1,1).value = "No saved history found for this variant.";
        }
      } catch(e){
        ws.getCell(1,1).value = "Error reading history: " + (e && e.message ? e.message : String(e));
      }
    })();

    // Tables sheet(s)
    const tables = Array.from(document.querySelectorAll("table"));
    tables.forEach((table, idx)=>{
      const titleCand = (table.getAttribute("data-title") || (table.previousElementSibling && table.previousElementSibling.textContent) || ("Table " + (idx+1)));
      const name = String(titleCand).trim().slice(0, 28) || ("Table " + (idx+1));
      const ws = wb.addWorksheet(uniqueSheetName(wb, name));
      let r = 1;
      // header
      const headRow = table.tHead ? table.tHead.rows[0] : table.rows[0];
      if (headRow) {
        Array.from(headRow.cells).forEach((th, c)=> ws.getCell(r, c+1).value = th.textContent.trim());
        r++;
      }
      // body rows
      const bodyRows = table.tBodies && table.tBodies.length ? table.tBodies[0].rows : Array.from(table.rows).slice(1);
      Array.from(bodyRows).forEach(tr=>{
        Array.from(tr.cells).forEach((td, c)=> ws.getCell(r, c+1).value = td.textContent.trim());
        r++;
      });
    });

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `RouMate-Data-${ts}.xlsx`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=> URL.revokeObjectURL(a.href), 2000);
  }

  function wireExportButtons(){
    const bData = document.getElementById("btnExportData");
    if (bData) bData.addEventListener("click", exportDataTablesToExcel);
  }

  function bootV5(){
    wireBoardPopupExtraRobust();
    wireExportButtons();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootV5);
  } else {
    bootV5();
  }
})();


// --- Non-destructive overrides (requested) ---
try {
  window.exportCSV = () => alert("Export disabled.");
} catch(e) {}
try {
  window.exportDataTablesToExcel = async () => alert("Export disabled.");
} catch(e) {}


// Set a default low color on load (will be updated after bars render)
try { document.documentElement.style.setProperty('--low-color', '#2980b9'); } catch(e) {}


// Augment text scaling to affect canvases (Chart.js) too
(function(){
  const docEl = document.documentElement;
  const origApply = (typeof applyTextScale === 'function') ? applyTextScale : function(v){
    docEl.style.setProperty('--app-text-scale', String((v/100)));
  };
  window.applyTextScale = function(v){
    try {
      origApply(v);
    } catch(e) {
      docEl.style.setProperty('--app-text-scale', String((v/100)));
    }
    try {
      const s = (v/100);
      if (window.Chart && Chart.defaults && Chart.defaults.font) {
        Chart.defaults.font.size = Math.round(12 * s);
        // Refresh charts if possible
        const insts = Chart.instances || Chart.registry?.instances;
        if (insts) {
          const arr = Array.isArray(insts) ? insts : Object.values(insts);
          arr.forEach(ch => { try { ch.update(); } catch(_e){} });
        }
      }
    } catch(_e) {}
    try {
      const out = document.getElementById('textScaleVal');
      if (out) out.textContent = v + '%';
    } catch(_e){}
  };

  document.addEventListener('DOMContentLoaded', function(){
    const slider = document.getElementById('textScale');
    if (slider) {
      slider.addEventListener('input', function(e){
        const v = parseInt(e.target.value, 10);
        if (!isNaN(v)) window.applyTextScale(v);
      });
    }
  });
})();


// ===== Global Text Scaling wiring =====
(function(){
  const docEl = document.documentElement;
  // Respect an existing applyTextScale if present; otherwise set CSS var directly
  const _apply = (typeof window.applyTextScale === 'function')
    ? window.applyTextScale
    : function(v){ docEl.style.setProperty('--app-text-scale', String(v/100)); };

  window.applyTextScale = function(v){
    try { _apply(v); } catch(e) { docEl.style.setProperty('--app-text-scale', String(v/100)); }
    // Chart.js canvas text scaling
    try {
      const s = v/100;
      if (window.Chart && Chart.defaults && Chart.defaults.font) {
        Chart.defaults.font.size = Math.round(12 * s);
        const insts = Chart.instances || Chart.registry?.instances;
        const arr = Array.isArray(insts) ? insts : Object.values(insts || {});
        arr.forEach(ch => { try { ch.update(); } catch(_e){} });
      }
    } catch(_e){}
    try { localStorage.setItem('TEXT_SCALE', String(v)); } catch(_e){}
    try { const out = document.getElementById('textScaleVal'); if (out) out.textContent = v + '%'; } catch(_e){}
  };

  document.addEventListener('DOMContentLoaded', function(){
    const slider = document.getElementById('textScale');
    let v = 100;
    try { v = parseInt(localStorage.getItem('TEXT_SCALE') || '100', 10); } catch(_e){}
    if (slider) {
      slider.value = String(v);
      slider.addEventListener('input', e => {
        const val = parseInt(e.target.value, 10);
        if (!isNaN(val)) window.applyTextScale(val);
      });
    }
    window.applyTextScale(v);
  });
})();
