/**
 * 풍속 모니터링 시스템 (Wind Monitoring System)
 * - 3개 페이지 제어 (현황판 / 데이터 추출 / 호출 시간 변경)
 * - 실시간 풍속 데이터 갱신 및 시뮬레이션
 * - 모니터 해상도 자동 피팅 (100vh / 100vw)
 * - 컬러 칩 데이터 테이블 & CSV 내보내기
 */

(function () {
  'use strict';

  // State Management
  const state = {
    activePage: 'dashboard', // 'dashboard', 'data', 'settings'
    
    // Wind Speed Values
    currentWind: 8.4,
    hourlyMaxWind: 18.9,
    dailyMaxWind: 13.0,
    
    // Polling / Call Settings
    pollingIntervalSec: parseInt(localStorage.getItem('sejong_poll_sec'), 10) || 5,
    lastFetchTime: new Date(),
    nextFetchCountdown: 5,
    timerId: null,
    clockTimerId: null,
    
    // Page 2 Data Table
    selectedDate: '2026-10-21',
    dataRows: []
  };

  // DOM Elements
  const elements = {
    dockBtns: document.querySelectorAll('.dock-btn'),
    btnFullscreen: document.getElementById('btnFullscreen'),
    
    // Views
    viewDashboard: document.getElementById('view-dashboard'),
    viewData: document.getElementById('view-data'),
    viewSettings: document.getElementById('view-settings'),
    
    // Page 1 Elements
    dashTimestamp: document.getElementById('dashTimestamp'),
    valCurrent: document.getElementById('valCurrent'),
    valHourlyMax: document.getElementById('valHourlyMax'),
    valDailyMax: document.getElementById('valDailyMax'),
    txtWindStatus: document.getElementById('txtWindStatus'),
    
    // Page 2 Elements
    datePicker: document.getElementById('datePicker'),
    btnQuery: document.getElementById('btnQuery'),
    btnDownload: document.getElementById('btnDownload'),
    dataTableBody: document.getElementById('dataTableBody'),
    statCount: document.getElementById('statCount'),
    statMax: document.getElementById('statMax'),
    statAvg: document.getElementById('statAvg'),
    
    // Page 3 Elements
    settingDatePicker: document.getElementById('settingDatePicker'),
    btnApplySettingTop: document.getElementById('btnApplySettingTop'),
    btnApplySettingCard: document.getElementById('btnApplySettingCard'),
    presetBtns: document.querySelectorAll('.preset-btn'),
    customSecInput: document.getElementById('customSecInput'),
    currIntervalDisplay: document.getElementById('currIntervalDisplay'),
    nextCallCountdownDisplay: document.getElementById('nextCallCountdownDisplay'),
    lastCallTimeDisplay: document.getElementById('lastCallTimeDisplay'),
    btnTestConn: document.getElementById('btnTestConn'),
    testConnBadge: document.getElementById('testConnBadge'),
    
    // Toast
    toast: document.getElementById('toastMsg'),
    toastText: document.getElementById('toastText')
  };

  // =========================================================================
  // Initialization
  // =========================================================================
  function init() {
    setupClock();
    setupNavigation();
    setupPage1();
    setupPage2();
    setupPage3();
    setupKeyboardShortcuts();
    startPollingTimer();

    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
  }

  // =========================================================================
  // Navigation & Page Switching
  // =========================================================================
  function switchPage(pageId) {
    state.activePage = pageId;

    elements.dockBtns.forEach(btn => {
      if (btn.dataset.page === pageId) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    if (elements.viewDashboard) elements.viewDashboard.classList.remove('active');
    if (elements.viewData) elements.viewData.classList.remove('active');
    if (elements.viewSettings) elements.viewSettings.classList.remove('active');

    if (pageId === 'dashboard' && elements.viewDashboard) {
      elements.viewDashboard.classList.add('active');
      location.hash = '#dashboard';
    } else if (pageId === 'data' && elements.viewData) {
      elements.viewData.classList.add('active');
      location.hash = '#data';
      if (state.dataRows.length === 0) {
        generateDataForDate(state.selectedDate);
      }
    } else if (pageId === 'settings' && elements.viewSettings) {
      elements.viewSettings.classList.add('active');
      location.hash = '#settings';
      updateSettingsUI();
    }
  }

  function handleHashChange() {
    const hash = location.hash.replace('#', '');
    if (hash === 'data') {
      switchPage('data');
    } else if (hash === 'settings') {
      switchPage('settings');
    } else {
      switchPage('dashboard');
    }
  }

  function setupNavigation() {
    elements.dockBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.page) {
          switchPage(btn.dataset.page);
        }
      });
    });

    if (elements.btnFullscreen) {
      elements.btnFullscreen.addEventListener('click', toggleFullscreen);
    }
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    }
  }

  function setupKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      if (e.key === '1') switchPage('dashboard');
      if (e.key === '2') switchPage('data');
      if (e.key === '3') switchPage('settings');
    });
  }

  // =========================================================================
  // Live Clock & Time Formatter
  // =========================================================================
  function formatKoreanDate(d) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${year}년 ${month}월 ${day}일 ${hours}시 ${minutes}분`;
  }

  function formatTimeHMS(d) {
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  }

  function setupClock() {
    function tick() {
      const now = new Date();
      if (elements.dashTimestamp) {
        elements.dashTimestamp.textContent = formatKoreanDate(now);
      }
    }
    tick();
    state.clockTimerId = setInterval(tick, 1000);
  }

  // =========================================================================
  // Page 1: Dashboard Logic & Wind Simulation
  // =========================================================================
  function setupPage1() {
    updateDashboardUI();
  }

  function getWindStatusText(speed) {
    if (speed < 5.4) return '남실바람 (매우 약함)';
    if (speed < 10.8) return '정상 관측중 (보통 바람)';
    if (speed < 17.2) return '된바람 (강한 바람 주의)';
    return '돌풍경보 (매우 강한 바람)';
  }

  function updateDashboardUI() {
    if (elements.valCurrent) {
      elements.valCurrent.textContent = state.currentWind.toFixed(1);
    }
    if (elements.valHourlyMax) {
      elements.valHourlyMax.textContent = state.hourlyMaxWind.toFixed(1);
    }
    if (elements.valDailyMax) {
      elements.valDailyMax.textContent = state.dailyMaxWind.toFixed(1);
    }
    if (elements.txtWindStatus) {
      elements.txtWindStatus.textContent = getWindStatusText(state.currentWind);
    }
  }

  function simulateNewWindData() {
    const delta = (Math.random() - 0.49) * 0.6;
    let newSpeed = state.currentWind + delta;
    if (newSpeed < 1.0) newSpeed = 1.0;
    if (newSpeed > 28.0) newSpeed = 28.0;

    state.currentWind = parseFloat(newSpeed.toFixed(1));

    if (state.currentWind > state.hourlyMaxWind) {
      state.hourlyMaxWind = state.currentWind;
    }
    if (state.currentWind > state.dailyMaxWind) {
      state.dailyMaxWind = state.currentWind;
    }

    state.lastFetchTime = new Date();
    updateDashboardUI();
    updateSettingsUI();
  }

  function startPollingTimer() {
    if (state.timerId) clearInterval(state.timerId);

    state.nextFetchCountdown = state.pollingIntervalSec;

    state.timerId = setInterval(() => {
      state.nextFetchCountdown--;
      if (state.nextFetchCountdown <= 0) {
        simulateNewWindData();
        state.nextFetchCountdown = state.pollingIntervalSec;
      }
      if (elements.nextCallCountdownDisplay) {
        elements.nextCallCountdownDisplay.textContent = `${state.nextFetchCountdown}초 후`;
      }
    }, 1000);
  }

  // =========================================================================
  // Page 2: Data Extraction Logic & Table with Color Pills
  // =========================================================================
  function setupPage2() {
    if (elements.datePicker) {
      elements.datePicker.value = state.selectedDate;
      elements.datePicker.addEventListener('change', (e) => {
        state.selectedDate = e.target.value;
      });
    }

    if (elements.btnQuery) {
      elements.btnQuery.addEventListener('click', () => {
        state.selectedDate = elements.datePicker.value || '2026-10-21';
        generateDataForDate(state.selectedDate);
        showToast(`${state.selectedDate} 풍속 데이터를 조회했습니다.`);
      });
    }

    if (elements.btnDownload) {
      elements.btnDownload.addEventListener('click', downloadCSV);
    }
  }

  function generateDataForDate(dateStr) {
    const rows = [];
    const baseSpeed = 12.6;
    let maxSpeed = 0;
    let sumSpeed = 0;

    const startHour = 9;
    const startMin = 1;
    const totalMinutes = 80;

    for (let i = 0; i < totalMinutes; i++) {
      const totalM = startHour * 60 + startMin + i;
      const h = String(Math.floor(totalM / 60)).padStart(2, '0');
      const m = String(totalM % 60).padStart(2, '0');
      const s = '00';
      const timeStr = `${dateStr} ${h}:${m}:${s}`;

      let speed = baseSpeed + (Math.sin(i / 6) * 0.3) + ((Math.random() - 0.5) * 0.15);
      speed = parseFloat(speed.toFixed(1));
      let gust = speed + (Math.random() * 0.6);
      gust = parseFloat(gust.toFixed(1));

      if (speed > maxSpeed) maxSpeed = speed;
      sumSpeed += speed;

      rows.push({
        time: timeStr,
        speed: speed.toFixed(1) + ' m/s',
        gust: gust.toFixed(1) + ' m/s',
        rawSpeed: speed
      });
    }

    state.dataRows = rows;
    renderDataTable(rows, maxSpeed, (sumSpeed / rows.length).toFixed(1));
  }

  function renderDataTable(rows, maxVal, avgVal) {
    if (!elements.dataTableBody) return;

    elements.dataTableBody.innerHTML = '';
    const fragment = document.createDocumentFragment();

    rows.forEach(row => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-weight: 600;">${row.time}</td>
        <td><span class="val-pill-blue">${row.speed}</span></td>
        <td><span class="val-pill-amber">${row.gust}</span></td>
      `;
      fragment.appendChild(tr);
    });

    elements.dataTableBody.appendChild(fragment);

    if (elements.statCount) elements.statCount.textContent = rows.length;
    if (elements.statMax) elements.statMax.textContent = maxVal + ' m/s';
    if (elements.statAvg) elements.statAvg.textContent = avgVal + ' m/s';
  }

  function downloadCSV() {
    if (state.dataRows.length === 0) {
      generateDataForDate(state.selectedDate);
    }

    let csvContent = '\uFEFF'; // UTF-8 BOM
    csvContent += '시간,풍속,돌풍풍속\r\n';

    state.dataRows.forEach(row => {
      csvContent += `"${row.time}","${row.speed}","${row.gust}"\r\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `풍속_데이터_${state.selectedDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast(`풍속_데이터_${state.selectedDate}.csv 다운로드가 시작되었습니다.`);
  }

  // =========================================================================
  // Page 3: Call Time Change Logic
  // =========================================================================
  function setupPage3() {
    if (elements.settingDatePicker) {
      elements.settingDatePicker.value = state.selectedDate;
    }

    elements.presetBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        elements.presetBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const sec = parseInt(btn.dataset.sec, 10);
        if (elements.customSecInput) {
          elements.customSecInput.value = sec;
        }
      });
    });

    if (elements.btnApplySettingTop) {
      elements.btnApplySettingTop.addEventListener('click', applyPollingSetting);
    }

    if (elements.btnApplySettingCard) {
      elements.btnApplySettingCard.addEventListener('click', applyPollingSetting);
    }

    if (elements.btnTestConn) {
      elements.btnTestConn.addEventListener('click', () => {
        elements.testConnBadge.textContent = '통신 확인중...';
        elements.testConnBadge.style.color = '#38bdf8';

        setTimeout(() => {
          elements.testConnBadge.textContent = '정상 (응답속도: 14ms)';
          elements.testConnBadge.style.color = '#02a499';
          showToast('풍속계 센서 통신 테스트 성공 (정상 수신)');
        }, 400);
      });
    }

    updateSettingsUI();
  }

  function applyPollingSetting() {
    let sec = parseInt(elements.customSecInput.value, 10);
    if (isNaN(sec) || sec < 1) {
      sec = 5;
      elements.customSecInput.value = 5;
    }

    state.pollingIntervalSec = sec;
    localStorage.setItem('sejong_poll_sec', sec);

    elements.presetBtns.forEach(b => {
      if (parseInt(b.dataset.sec, 10) === sec) {
        b.classList.add('active');
      } else {
        b.classList.remove('active');
      }
    });

    startPollingTimer();
    updateSettingsUI();

    const unitStr = sec >= 60 && sec % 60 === 0 ? `${sec / 60}분` : `${sec}초`;
    showToast(`호출 주기가 [${unitStr}]로 성공적으로 변경되었습니다.`);
  }

  function updateSettingsUI() {
    const sec = state.pollingIntervalSec;
    const unitStr = sec >= 60 && sec % 60 === 0 ? `${sec / 60}분 (${sec}초)` : `${sec}초`;

    if (elements.currIntervalDisplay) {
      elements.currIntervalDisplay.textContent = unitStr;
    }
    if (elements.customSecInput) {
      elements.customSecInput.value = sec;
    }
    if (elements.lastCallTimeDisplay) {
      elements.lastCallTimeDisplay.textContent = formatTimeHMS(state.lastFetchTime);
    }
  }

  // =========================================================================
  // Toast Message
  // =========================================================================
  let toastTimer = null;
  function showToast(msg) {
    if (!elements.toast || !elements.toastText) return;
    elements.toastText.textContent = msg;
    elements.toast.classList.add('show');

    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      elements.toast.classList.remove('show');
    }, 2500);
  }

  // Run on DOM Ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
