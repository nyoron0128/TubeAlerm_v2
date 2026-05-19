(() => {
  "use strict";

  const els = {
    dateText: document.getElementById("dateText"),
    timeText: document.getElementById("timeText"),
    alarmForm: document.getElementById("alarmForm"),
    videoInput: document.getElementById("videoInput"),
    timeInput: document.getElementById("timeInput"),
    volumeIncreaseInput: document.getElementById("volumeIncreaseInput"),
    resetButton: document.getElementById("resetButton"),
    armButton: document.getElementById("armButton"),
    testButton: document.getElementById("testButton"),
    stopButton: document.getElementById("stopButton"),
    status: document.getElementById("status"),
    permissionStatus: document.getElementById("permissionStatus"),
  };

  const state = {
    player: null,
    videoId: "",
    alarmHHMM: "",
    firedForMinute: "",
    userArmed: false,
    wakeLock: null,
  };

  window.onYouTubeIframeAPIReady = () => {
    const params = readParams();
    state.videoId = params.videoId;
    state.alarmHHMM = params.time;

    if (state.videoId) {
      els.videoInput.value = `https://www.youtube.com/watch?v=${state.videoId}`;
    }
    if (state.alarmHHMM) {
      els.timeInput.value = `${state.alarmHHMM.slice(0, 2)}:${state.alarmHHMM.slice(2, 4)}`;
    }

    createOrLoadPlayer(state.videoId || "dQw4w9WgXcQ");
    renderStatus();
  };

  function readParams() {
    const params = new URLSearchParams(location.search);
    const rawVid = params.get("vid") || "";
    const rawTime = params.get("time") || "";

    return {
      videoId: extractYouTubeId(rawVid),
      time: normalizeTime(rawTime),
    };
  }

  function extractYouTubeId(value) {
    const text = String(value || "").trim();

    const patterns = [
      /youtu\.be\/([A-Za-z0-9_-]{11})/,
      /youtube\.com\/watch\?[^#]*v=([A-Za-z0-9_-]{11})/,
      /youtube\.com\/embed\/([A-Za-z0-9_-]{11})/,
      /youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/,
      /^([A-Za-z0-9_-]{11})$/,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) return match[1];
    }
    return "";
  }

  function normalizeTime(value) {
    const text = String(value || "").replace(/\D/g, "");
    if (!/^\d{4}$/.test(text)) return "";

    const hh = Number(text.slice(0, 2));
    const mm = Number(text.slice(2, 4));
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return "";

    return `${pad2(hh)}${pad2(mm)}`;
  }

  function createOrLoadPlayer(videoId) {
    if (!window.YT || !window.YT.Player) return;

    if (state.player) {
      state.player.loadVideoById(videoId);
      state.player.pauseVideo();
      return;
    }

    state.player = new YT.Player("player", {
      videoId,
      playerVars: {
        rel: 0,
        loop: 1,
        playlist: videoId,
        playsinline: 1,
        origin: location.origin,
      },
      events: {
        onReady: () => {
          state.player.setVolume(50);
          state.player.pauseVideo();
        },
        onStateChange: onPlayerStateChange,
      },
    });
  }

  function onPlayerStateChange(event) {
    if (!window.YT || event.data !== YT.PlayerState.ENDED) return;
    if (els.volumeIncreaseInput.checked) {
      const nextVolume = Math.min(100, state.player.getVolume() + 10);
      state.player.setVolume(nextVolume);
    }
  }

  async function armPlayback() {
    if (!state.player) return;

    state.userArmed = true;
    try {
      state.player.unMute();
      state.player.setVolume(50);

      // ユーザー操作の直後に短く再生して、以後の再生許可を取りにいく。
      state.player.playVideo();
      setTimeout(() => {
        if (state.player && currentHHMM() !== state.alarmHHMM) {
          state.player.pauseVideo();
        }
      }, 600);

      await requestWakeLock();
      els.permissionStatus.textContent = "再生許可を有効化済み。タブを開いたまま、PCをスリープさせずに使う。";
    } catch (error) {
      els.permissionStatus.textContent = "ブラウザにより自動再生が制限された。テスト再生ボタンで再生できるか確認する。";
    }
  }

  async function requestWakeLock() {
    if (!("wakeLock" in navigator)) return;
    try {
      state.wakeLock = await navigator.wakeLock.request("screen");
    } catch {
      state.wakeLock = null;
    }
  }

  function setAlarm(videoId, hhmm) {
    state.videoId = videoId;
    state.alarmHHMM = hhmm;
    state.firedForMinute = "";

    createOrLoadPlayer(videoId);

    const url = new URL(location.href);
    url.searchParams.set("vid", videoId);
    url.searchParams.set("time", hhmm);
    history.replaceState(null, "", url);

    renderStatus();
  }

  function resetAlarm() {
    state.alarmHHMM = "";
    state.firedForMinute = "";
    els.timeInput.value = "";

    const url = new URL(location.href);
    url.searchParams.delete("time");
    history.replaceState(null, "", url);

    if (state.player) state.player.stopVideo();
    renderStatus();
  }

  function renderClock() {
    const now = new Date();
    els.dateText.textContent = `${now.getFullYear()}/${pad2(now.getMonth() + 1)}/${pad2(now.getDate())}`;
    els.timeText.textContent = `${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;
  }

  function renderStatus() {
    if (!state.alarmHHMM) {
      els.status.className = "status off";
      els.status.textContent = "アラームなし";
      document.title = "TubeAlerm";
      return;
    }

    const displayTime = `${state.alarmHHMM.slice(0, 2)}:${state.alarmHHMM.slice(2, 4)}`;
    els.status.className = "status on";
    els.status.textContent = `アラームセット中：${displayTime}`;
    document.title = `TubeAlerm - ${displayTime}`;
  }

  function tick() {
    renderClock();

    if (!state.player || !state.videoId || !state.alarmHHMM) return;

    const hhmm = currentHHMM();
    const minuteKey = `${new Date().toDateString()}-${hhmm}`;

    if (hhmm === state.alarmHHMM && state.firedForMinute !== minuteKey) {
      state.firedForMinute = minuteKey;
      state.player.unMute();
      state.player.setVolume(50);

      try {
        state.player.playVideo();
        els.permissionStatus.textContent = state.userArmed
          ? "指定時刻になったため再生を開始した。"
          : "指定時刻になった。再生されない場合は、事前に再生許可を有効化する必要がある。";
      } catch {
        els.permissionStatus.textContent = "ブラウザにより再生がブロックされた。";
      }
    }
  }

  function currentHHMM() {
    const now = new Date();
    return `${pad2(now.getHours())}${pad2(now.getMinutes())}`;
  }

  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  els.alarmForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const videoId = extractYouTubeId(els.videoInput.value);
    if (!videoId) {
      els.permissionStatus.textContent = "YouTube URL または 11文字のVideo IDを入力する。";
      return;
    }

    const time = normalizeTime(els.timeInput.value);
    if (!time) {
      els.permissionStatus.textContent = "再生時刻を正しく入力する。";
      return;
    }

    setAlarm(videoId, time);
    await armPlayback();
  });

  els.resetButton.addEventListener("click", resetAlarm);
  els.armButton.addEventListener("click", armPlayback);
  els.testButton.addEventListener("click", () => {
    if (!state.player) return;
    state.player.unMute();
    state.player.setVolume(50);
    state.player.playVideo();
  });
  els.stopButton.addEventListener("click", () => {
    if (state.player) state.player.stopVideo();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      requestWakeLock();
    }
  });

  renderClock();
  setInterval(tick, 1000);
})();
