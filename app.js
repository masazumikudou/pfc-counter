// ==============================
// SECTION 4: JS - コア
// ==============================

  let menuDatabase = [];
  let recipeDatabase = [];
  let selectedBase = { cal: 0, fat: 0, protein: 0, carbs: 0 };
  let editSelectedBase = { cal: 0, fat: 0, protein: 0, carbs: 0 };
  let chartInstance = null;
  let allData = {};
  let weightLog = [];
  let profile = null;
  let weekOffset = 0;
  let weekSwipeStartX = 0;
  let viewDateOffset = 0;

  function today() {
    const d = new Date();
    return dateStrFromDate(d);
  }
  function dateStrFromDate(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  function getViewDate() {
    const d = new Date();
    d.setDate(d.getDate() + viewDateOffset);
    return dateStrFromDate(d);
  }
  function toHiragana(str) {
    return str.replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
  }
  function normalize(str) { return toHiragana(str.toLowerCase()); }

  function calcTargets(p) {
    let bmr;
    if (p.gender === 'male') {
      bmr = 88.362 + (13.397 * p.weight) + (4.799 * p.height) - (5.677 * p.age);
    } else {
      bmr = 447.593 + (9.247 * p.weight) + (3.098 * p.height) - (4.330 * p.age);
    }
    const tdee = Math.round(bmr * p.activity);
    const targetCal = Math.round(tdee * 0.85);
    const targetProtein = Math.round(p.weight * 2.0);
    const targetFat = Math.round(targetCal * 0.25 / 9);
    const targetCarbs = Math.round((targetCal - targetProtein * 4 - targetFat * 9) / 4);
    return { bmr: Math.round(bmr), tdee, targetCal, targetProtein, targetFat, targetCarbs };
  }

  const exerciseMets = {
    'サイクリング': 6.0, 'ダンス': 4.5, '筋トレ': 3.5, 'ウォーキング': 3.5,
    '水泳': 8.0, '家事': 2.5, 'ストレッチ・ヨガ': 2.5, 'ボウリング': 3.0
  };

  function calcExerciseBurn(type, hours, p) {
    if (!p || !exerciseMets[type]) return 0;
    return Math.round(exerciseMets[type] * p.weight * hours);
  }
  function calcExerciseTotalBurn(exercises, p) {
    if (!exercises || !exercises.length) return 0;
    return exercises.reduce((s, e) => s + e.cal, 0);
  }
  function calcWalkBurn(steps, p) {
    if (!p) return 0;
    return Math.round(steps * 0.04 * (p.weight / 68));
  }
  function calcTotalBurn(steps, p, exercises) {
    if (!p) return 2600;
    const t = calcTargets(p);
    return t.tdee + calcWalkBurn(steps, p) + calcExerciseTotalBurn(exercises, p);
  }

  function updateExercisePreview() {
    const type = document.getElementById('exercise-type').value;
    const hours = parseFloat(document.getElementById('exercise-time').value);
    const preview = document.getElementById('exercise-preview');
    if (type && hours && profile) {
      const cal = calcExerciseBurn(type, hours, profile);
      preview.textContent = `消費カロリー: 約${cal}kcal`;
      preview.style.display = 'block';
    } else {
      preview.style.display = 'none';
    }
  }

  async function loadCSV() {
    try {
      const res = await fetch('data.csv?v=' + Date.now());
      const text = await res.text();
      menuDatabase = [];
      text.trim().split('\n').forEach(line => {
        const parts = line.split(',');
        if (parts.length >= 5 && !line.startsWith('食品名')) {
          menuDatabase.push({
            name: parts[0].trim(),
            cal: parseInt(parts[1]) || 0,
            protein: parseFloat(parts[2]) || 0,
            fat: parseFloat(parts[3]) || 0,
            carbs: parseFloat(parts[4]) || 0,
            category: parts[5] ? parts[5].trim() : ''
          });
        }
      });
      document.getElementById('item-count').textContent = menuDatabase.length + ' ITEMS';
    } catch(e) {
      document.getElementById('item-count').textContent = 'データ読込エラー';
    }

    try {
      const res2 = await fetch('recipe.csv?v=' + Date.now());
      const text2 = await res2.text();
      recipeDatabase = [];
      text2.trim().split('\n').forEach(line => {
        if (!line.trim() || line.startsWith('レシピ名')) return;
        const parts = parseCSVLine(line);
        if (parts.length >= 4) {
          recipeDatabase.push({
            name: parts[0].trim(),
            category: parts[1].trim(),
            ingredients: parts[2].trim(),
            steps: parts[3].trim(),
            cal: parseInt(parts[4]) || 0,
            protein: parseFloat(parts[5]) || 0,
            fat: parseFloat(parts[6]) || 0,
            carbs: parseFloat(parts[7]) || 0
          });
        }
      });
      const sel = document.getElementById('recipe-select');
      recipeDatabase.forEach(r => {
        const opt = document.createElement('option');
        opt.value = r.name;
        opt.textContent = r.name;
        sel.appendChild(opt);
      });
    } catch(e) {}
  }

  function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuote = !inQuote; }
      else if (ch === ',' && !inQuote) { result.push(current); current = ''; }
      else { current += ch; }
    }
    result.push(current);
    return result;
  }

  function searchMenu(query) {
    const box = document.getElementById('suggest-list');
    if (!query) { box.style.display = 'none'; return; }
    const q = normalize(query);
    const filtered = menuDatabase.filter(i => normalize(i.name).includes(q)).slice(0, 12);
    if (!filtered.length) { box.style.display = 'none'; return; }
    box.innerHTML = '';
    filtered.forEach(item => {
      const div = document.createElement('div');
      div.className = 'suggest-item';
      div.innerHTML = `<div>${item.name}</div><div class="suggest-meta">${item.cal}kcal / F:${item.fat}g</div>`;
      div.onclick = () => {
        document.getElementById('food-name').value = item.name;
        selectedBase = { cal: item.cal, fat: item.fat, protein: item.protein, carbs: item.carbs };
        document.getElementById('food-qty').value = '1';
        updateQty();
        box.style.display = 'none';
        hideError('food-error');
      };
      box.appendChild(div);
    });
    box.style.display = 'block';
  }

  function searchMenuEdit(query) {
    const box = document.getElementById('edit-suggest-list');
    if (!query) { box.style.display = 'none'; return; }
    const q = normalize(query);
    const filtered = menuDatabase.filter(i => normalize(i.name).includes(q)).slice(0, 12);
    if (!filtered.length) { box.style.display = 'none'; return; }
    box.innerHTML = '';
    filtered.forEach(item => {
      const div = document.createElement('div');
      div.className = 'suggest-item';
      div.innerHTML = `<div>${item.name}</div><div class="suggest-meta">${item.cal}kcal / F:${item.fat}g</div>`;
      div.onclick = () => {
        document.getElementById('edit-food-name').value = item.name;
        editSelectedBase = { cal: item.cal, fat: item.fat, protein: item.protein, carbs: item.carbs };
        document.getElementById('edit-food-qty').value = '1';
        document.getElementById('edit-food-cal').value = item.cal;
        box.style.display = 'none';
        hideError('edit-food-error');
      };
      box.appendChild(div);
    });
    box.style.display = 'block';
  }

  document.getElementById('edit-food-qty').addEventListener('input', () => {
    const qty = parseFloat(document.getElementById('edit-food-qty').value) || 1;
    document.getElementById('edit-food-cal').value = Math.round(editSelectedBase.cal * qty);
  });
  function updateQty() {
    const qty = parseFloat(document.getElementById('food-qty').value) || 1;
    document.getElementById('food-cal').value = Math.round(selectedBase.cal * qty);
    document.getElementById('food-fat').value = (selectedBase.fat * qty).toFixed(1);
    document.getElementById('food-protein').value = (selectedBase.protein * qty).toFixed(1);
    document.getElementById('food-carbs').value = (selectedBase.carbs * qty).toFixed(1);
  }
  document.getElementById('food-qty').addEventListener('input', updateQty);

  function showError(id, msg) {
    const el = document.getElementById(id);
    if (msg) el.textContent = msg;
    el.classList.add('show');
  }
  function hideError(id) {
    document.getElementById(id).classList.remove('show');
  }

// ==============================
// SECTION 5: JS - プロフィール・体重・データ管理
// ==============================

  function openSettings() {
    if (profile) {
      document.getElementById('s-name').value = profile.name || '';
      document.getElementById('s-height').value = profile.height || '';
      document.getElementById('s-weight').value = profile.weight || '';
      document.getElementById('s-age').value = profile.age || '';
      document.getElementById('s-gender').value = profile.gender || 'male';
      document.getElementById('s-activity').value = profile.activity || '1.55';
      document.getElementById('s-target-weight').value = profile.targetWeight || '';
      document.getElementById('s-target-cal').value = profile.targetCalInput || '';
      document.getElementById('s-target-protein').value = profile.targetProteinInput || '';
      document.getElementById('s-target-fat').value = profile.targetFatInput || '';
      document.getElementById('s-target-carbs').value = profile.targetCarbsInput || '';
    }
    document.getElementById('settings-modal').style.display = 'flex';
    updateCalcPreview();
  }
  function updateCalcPreview() {
    const h = parseFloat(document.getElementById('s-height').value);
    const w = parseFloat(document.getElementById('s-weight').value);
    const a = parseInt(document.getElementById('s-age').value);
    const g = document.getElementById('s-gender').value;
    const act = parseFloat(document.getElementById('s-activity').value);
    const preview = document.getElementById('calc-preview');
    if (h && w && a) {
      const t = calcTargets({ height: h, weight: w, age: a, gender: g, activity: act });
      preview.style.display = 'block';
      preview.innerHTML = `基礎代謝: <b>${t.bmr}kcal</b> / 消費目安: <b>${t.tdee}kcal</b><br>自動計算: <b>${t.targetCal}kcal</b>（15%カット）<br>P: <b>${t.targetProtein}g</b> / F: <b>${t.targetFat}g</b> / C: <b>${t.targetCarbs}g</b>`;
    } else {
      preview.style.display = 'none';
    }
  }
  ['s-height','s-weight','s-age','s-gender','s-activity'].forEach(id => {
    document.getElementById(id).addEventListener('input', updateCalcPreview);
  });

  function saveSettings() {
    const name = document.getElementById('s-name').value.trim();
    const height = parseFloat(document.getElementById('s-height').value);
    const weight = parseFloat(document.getElementById('s-weight').value);
    const age = parseInt(document.getElementById('s-age').value);
    const gender = document.getElementById('s-gender').value;
    const activity = parseFloat(document.getElementById('s-activity').value);
    const targetWeight = parseFloat(document.getElementById('s-target-weight').value) || null;
    if (!height || !weight || !age) { alert('身長・体重・年齢を入力してください'); return; }
    const targetCalInput = parseInt(document.getElementById('s-target-cal').value) || null;
    const targetProteinInput = parseInt(document.getElementById('s-target-protein').value) || null;
    const targetFatInput = parseInt(document.getElementById('s-target-fat').value) || null;
    const targetCarbsInput = parseInt(document.getElementById('s-target-carbs').value) || null;
    profile = { name, height, weight, age, gender, activity, targetWeight, targetCalInput, targetProteinInput, targetFatInput, targetCarbsInput };
    localStorage.setItem('pfc_profile', JSON.stringify(profile));
    document.getElementById('settings-modal').style.display = 'none';
    renderProfile();
    render();
    renderWeek();
    renderGraph();
  }

  function renderProfile() {
    if (!profile) {
      document.getElementById('profile-card').style.display = 'none';
      document.getElementById('weight-card').style.display = 'none';
      return;
    }
    document.getElementById('profile-card').style.display = 'block';
    document.getElementById('weight-card').style.display = 'block';
    const t = getTargets();
    const actLabel = { '1.2': '低い', '1.55': '中程度', '1.725': '高い', '1.9': '非常に高い' };
    document.getElementById('profile-name').textContent = profile.name || 'プロフィール';
    document.getElementById('profile-summary').innerHTML =
      `${profile.height}cm / ${profile.weight}kg / ${profile.age}歳 / ${profile.gender === 'male' ? '男性' : '女性'} / 活動: ${actLabel[String(profile.activity)] || '中程度'}<br>` +
      `目標: ${t.targetCal}kcal / P:${t.targetProtein}g / F:${t.targetFat}g / C:${t.targetCarbs}g`;
    renderWeightCard();
  }

  function renderWeightCard() {
    if (!profile) return;
    const latest = weightLog.length ? weightLog[weightLog.length - 1].weight : null;
    const target = profile.targetWeight;
    document.getElementById('weight-current').innerHTML = latest ? `${latest}<span class="weight-box-unit">kg</span>` : `－<span class="weight-box-unit">kg</span>`;
    document.getElementById('weight-target').innerHTML = target ? `${target}<span class="weight-box-unit">kg</span>` : `－<span class="weight-box-unit">kg</span>`;
    if (latest && target) {
      const diff = (latest - target).toFixed(1);
      const diffBox = document.getElementById('weight-diff-box');
      const isOver = parseFloat(diff) > 0;
      diffBox.style.borderColor = isOver ? 'var(--red)' : 'var(--green)';
      document.getElementById('weight-diff').innerHTML = `${isOver ? '+' : ''}${diff}<span class="weight-box-unit">kg</span>`;
      document.getElementById('weight-diff').style.color = isOver ? 'var(--red)' : 'var(--green)';
    } else {
      document.getElementById('weight-diff').innerHTML = `－<span class="weight-box-unit">kg</span>`;
    }
    const bmiVal = document.getElementById('bmi-value');
    const bmiJudge = document.getElementById('bmi-judge');
    if (latest && profile.height) {
      const h = profile.height / 100;
      const bmi = latest / (h * h);
      bmiVal.textContent = bmi.toFixed(1);
      let judge, color;
      if (bmi < 18.5) { judge = '低体重'; color = 'var(--blue)'; }
      else if (bmi < 25) { judge = '普通体重'; color = 'var(--green)'; }
      else { judge = '肥満'; color = 'var(--red)'; }
      bmiJudge.textContent = judge;
      bmiJudge.style.color = color;
    } else {
      bmiVal.textContent = '－';
      bmiJudge.textContent = '－';
      bmiJudge.style.color = 'var(--muted)';
    }
  }

  function registerWeight() {
    const v = parseFloat(document.getElementById('weight-input').value);
    if (isNaN(v) || v < 20 || v > 300) { showError('weight-error', '正しい体重を入力してください'); return; }
    hideError('weight-error');
    const dateStr = today();
    const idx = weightLog.findIndex(w => w.date === dateStr);
    if (idx >= 0) weightLog[idx].weight = v;
    else weightLog.push({ date: dateStr, weight: v });
    weightLog.sort((a, b) => a.date.localeCompare(b.date));
    localStorage.setItem('pfc_weight', JSON.stringify(weightLog));
    document.getElementById('weight-input').value = '';
    renderWeightCard();
    renderGraph();
  }

  function loadData() {
    const savedProfile = localStorage.getItem('pfc_profile');
    if (savedProfile) { try { profile = JSON.parse(savedProfile); } catch(e) {} }
    const saved = localStorage.getItem('pfc_v9');
    if (saved) { try { allData = JSON.parse(saved); } catch(e) {} }
    const savedWeight = localStorage.getItem('pfc_weight');
    if (savedWeight) { try { weightLog = JSON.parse(savedWeight); } catch(e) {} }
    if (!profile) {
      document.getElementById('settings-modal').style.display = 'flex';
    } else {
      document.getElementById('settings-modal').style.display = 'none';
      renderProfile();
    }
    updateHeaderDate();
    render();
    renderWeek();
    renderGraph();
  }
  function saveData() { localStorage.setItem('pfc_v9', JSON.stringify(allData)); }

  function getDateData(dateStr) {
    if (!allData[dateStr]) allData[dateStr] = { logs: [], steps: 0, exercises: [] };
    if (!allData[dateStr].exercises) allData[dateStr].exercises = [];
    return allData[dateStr];
  }
  function getTodayData() { return getDateData(today()); }
  function getViewData() { return getDateData(getViewDate()); }

  function getTargets() {
    if (profile) {
      const auto = calcTargets(profile);
      return {
        bmr: auto.bmr,
        tdee: auto.tdee,
        targetCal: profile.targetCalInput || auto.targetCal,
        targetProtein: profile.targetProteinInput || auto.targetProtein,
        targetFat: profile.targetFatInput || auto.targetFat,
        targetCarbs: profile.targetCarbsInput || auto.targetCarbs,
      };
    }
    return { targetCal: 2000, targetFat: 55, targetProtein: 135, targetCarbs: 250, tdee: 2600 };
  }

// ==============================
// SECTION 6: JS - UI
// ==============================

  function updateHeaderDate() {
    const d = new Date();
    d.setDate(d.getDate() + viewDateOffset);
    const dayNames = ['日','月','火','水','木','金','土'];
    const label = viewDateOffset === 0
      ? `今日 ${d.getMonth()+1}/${d.getDate()}（${dayNames[d.getDay()]}）`
      : `${d.getMonth()+1}/${d.getDate()}（${dayNames[d.getDay()]}）`;
    document.getElementById('header-date-label').textContent = label;
    document.getElementById('date-next-btn').disabled = viewDateOffset >= 0;
    document.getElementById('date-prev-btn').disabled = viewDateOffset <= -30;
    document.getElementById('log-card-title').textContent =
      viewDateOffset === 0 ? '本日のミッション結果' : `${d.getMonth()+1}/${d.getDate()} の記録`;
  }
  function changeViewDate(dir) {
    const next = viewDateOffset + dir;
    if (next > 0 || next < -30) return;
    viewDateOffset = next;
    updateHeaderDate();
    syncWeekToViewDate();
    render();
  }
  function syncWeekToViewDate() {
    const vd = new Date();
    vd.setDate(vd.getDate() + viewDateOffset);
    const td = new Date();
    const diffDays = Math.floor((td - vd) / (1000*60*60*24));
    const targetWeekOffset = -Math.floor(diffDays / 7);
    if (targetWeekOffset !== weekOffset && targetWeekOffset >= -3 && targetWeekOffset <= 0) {
      weekOffset = targetWeekOffset;
    }
    renderWeek();
  }

  function render() {
    const d = getViewData();
    const targets = getTargets();
    let tCal = 0, tFat = 0, tProtein = 0, tCarbs = 0;
    d.logs.forEach(i => { tCal += i.cal; tFat += i.fat; tProtein += i.protein; tCarbs += i.carbs; });
    const walkBurn = calcWalkBurn(d.steps, profile);
    const exerciseBurn = calcExerciseTotalBurn(d.exercises, profile);
    const totalBurn = calcTotalBurn(d.steps, profile, d.exercises);

    document.getElementById('cal-eaten').innerHTML = `${tCal}<span class="status-unit">kcal</span>`;
    document.getElementById('cal-remaining').textContent = `残り ${targets.targetCal - tCal}kcal`;
    document.getElementById('fat-eaten').innerHTML = `${tFat.toFixed(1)}<span class="status-unit">g</span>`;
    document.getElementById('fat-remaining').textContent = `残り ${(targets.targetFat - tFat).toFixed(1)}g`;
    document.getElementById('protein-eaten').innerHTML = `${tProtein.toFixed(1)}<span class="status-unit">g</span>`;
    document.getElementById('protein-remaining').textContent = `残り ${(targets.targetProtein - tProtein).toFixed(1)}g`;
    document.getElementById('carbs-eaten').innerHTML = `${tCarbs.toFixed(1)}<span class="status-unit">g</span>`;
    document.getElementById('carbs-remaining').textContent = `残り ${(targets.targetCarbs - tCarbs).toFixed(1)}g`;
    document.getElementById('current-steps').innerText = d.steps.toLocaleString();
    document.getElementById('walk-burn-cal').innerText = walkBurn.toLocaleString();
    document.getElementById('burn-cal').innerText = totalBurn.toLocaleString();

    const balance = totalBurn - tCal;
    document.getElementById('bar-intake').textContent = tCal.toLocaleString() + 'kcal';
    document.getElementById('bar-burn').textContent = totalBurn.toLocaleString() + 'kcal';
    const resultEl = document.getElementById('bar-result');
    const labelEl = document.getElementById('bar-result-label');
    const barEl = document.getElementById('balance-bar');
    if (balance >= 0) {
      resultEl.textContent = 'アンダー ' + balance.toLocaleString() + 'kcal';
      resultEl.style.color = 'var(--green)';
      labelEl.textContent = '収支';
      labelEl.style.color = 'var(--green)';
      barEl.style.borderColor = 'var(--green)';
    } else {
      resultEl.textContent = 'オーバー ' + Math.abs(balance).toLocaleString() + 'kcal';
      resultEl.style.color = 'var(--red)';
      labelEl.textContent = '収支';
      labelEl.style.color = 'var(--red)';
      barEl.style.borderColor = 'var(--red)';
    }

    const exContainer = document.getElementById('exercise-log-container');
    exContainer.innerHTML = '';
    if (d.exercises && d.exercises.length) {
      d.exercises.forEach((ex, idx) => {
        const div = document.createElement('div');
        div.className = 'log-item';
        div.innerHTML = `
          <div style="flex:1;">
            <b>${ex.type}</b> <small>${ex.hours}時間</small>
            <br><small style="color:var(--muted);">${ex.time}</small>
          </div>
          <div class="log-values" style="color:var(--green);">-${ex.cal}kcal</div>
          <button class="log-del-btn" onclick="deleteExercise(${idx})">削除</button>
        `;
        exContainer.appendChild(div);
      });
    }

    const container = document.getElementById('log-container');
    container.innerHTML = '';
    if (!d.logs.length) {
      container.innerHTML = '<div style="text-align:center;color:var(--muted);font-size:12px;padding:15px 0;">ログがありません</div>';
    } else {
      for (let i = d.logs.length - 1; i >= 0; i--) {
        const item = d.logs[i];
        const div = document.createElement('div');
        div.className = 'log-item';
        const idx = i;
        div.innerHTML = `
          <div style="flex:1;">
            <b>${item.name}</b>${item.qty && item.qty !== 1 ? ` <small>×${item.qty}</small>` : ''}
            <br><small style="color:var(--muted);">${item.time}</small>
          </div>
          <div class="log-values">${item.cal}kcal/F:${item.fat}g<br><small style="color:var(--muted)">P:${item.protein}/C:${item.carbs}</small></div>
          <button class="log-del-btn" onclick="deleteLogItem(${idx})">削除</button>
        `;
        container.appendChild(div);
      }
    }
  }

  function deleteLogItem(idx) {
    const d = getViewData();
    d.logs.splice(idx, 1);
    saveData(); render(); renderWeek(); renderGraph();
  }

  function addLog() {
    const n = document.getElementById('food-name').value.trim();
    if (!n) { showError('food-error', '食べたものを入力してください'); return; }
    if (!selectedBase.cal) { showError('food-error', '食べたものを検索して選んでください'); return; }
    hideError('food-error');
    const qty = parseFloat(document.getElementById('food-qty').value) || 1;
    const c = parseInt(document.getElementById('food-cal').value) || 0;
    const f = parseFloat(document.getElementById('food-fat').value) || 0;
    const p = parseFloat(document.getElementById('food-protein').value) || 0;
    const cb = parseFloat(document.getElementById('food-carbs').value) || 0;
    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;
    getViewData().logs.push({ name: n, qty, cal: c, fat: f, protein: p, carbs: cb, time: timeStr });
    document.getElementById('food-name').value = '';
    document.getElementById('food-qty').value = '1';
    ['food-cal','food-fat','food-protein','food-carbs'].forEach(id => document.getElementById(id).value = '');
    selectedBase = { cal: 0, fat: 0, protein: 0, carbs: 0 };
    saveData(); render(); renderWeek(); renderGraph();
  }

  function updateSteps() {
    const v = parseInt(document.getElementById('steps-input').value);
    if (isNaN(v) || v < 0) { showError('steps-error'); return; }
    hideError('steps-error');
    getViewData().steps = v;
    document.getElementById('steps-input').value = '';
    saveData(); render(); renderWeek(); renderGraph();
  }
  function clearViewDay() {
    const vd = getViewDate();
    const label = viewDateOffset === 0 ? '今日' : vd;
    if (confirm(`${label}のログをリセットしますか？`)) {
      allData[vd] = { logs: [], steps: 0, exercises: [] };
      saveData(); render(); renderWeek(); renderGraph();
    }
  }
  function resetAll() {
    if (confirm('全データをリセットしますか？')) {
      allData = {}; saveData(); render(); renderWeek(); renderGraph();
    }
  }

  function getWeekDates(offset) {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const mondayOffset = (dayOfWeek === 0) ? -6 : 1 - dayOfWeek;
    const monday = new Date(now);
    monday.setDate(now.getDate() + mondayOffset + offset * 7);
    monday.setHours(0,0,0,0);
    const dates = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      dates.push(d);
    }
    return dates;
  }

  function renderWeek() {
    const dates = getWeekDates(weekOffset);
    const todayStr = today();
    const viewStr = getViewDate();
    const dayLabels = ['月','火','水','木','金','土','日'];
    let titleStr = weekOffset === 0 ? '今週' : weekOffset === -1 ? '先週' : `${Math.abs(weekOffset)}週前`;
    document.getElementById('week-title').textContent = titleStr;
    document.getElementById('week-prev-btn').disabled = weekOffset <= -3;
    document.getElementById('week-next-btn').disabled = weekOffset >= 0;

    const container = document.getElementById('week-days');
    container.innerHTML = '';
    dates.forEach((date, i) => {
      const dateStr = dateStrFromDate(date);
      const dayData = allData[dateStr];
      const totalCal = dayData ? dayData.logs.reduce((s, x) => s + x.cal, 0) : 0;
      const steps = dayData ? dayData.steps : 0;
      const isToday = (dateStr === todayStr);
      const isSelected = (dateStr === viewStr);
      const hasData = dayData && (dayData.logs.length > 0 || dayData.steps > 0);

      const div = document.createElement('div');
      div.className = 'week-day';
      div.onclick = () => {
        const now = new Date();
        const clicked = new Date(date);
        const diffMs = now - clicked;
        const diffDays = Math.floor(diffMs / (1000*60*60*24));
        viewDateOffset = -diffDays;
        updateHeaderDate();
        render();
        renderWeek();
      };

      const labelClass = i === 5 ? 'sat' : (i === 6 ? 'sun' : '');
      let circleClass = 'week-day-circle';
      if (isToday) circleClass += ' today';
      else if (hasData) circleClass += ' has-data';
      if (isSelected && !isToday) circleClass += ' selected';

      div.innerHTML = `
        <div class="week-day-label ${labelClass}">${dayLabels[i]}</div>
        <div class="${circleClass}">
          ${date.getDate()}
          ${hasData ? '<span class="week-day-dot"></span>' : ''}
        </div>
        <div class="week-day-kcal">${totalCal > 0 ? totalCal+'k' : ''}</div>
        <div class="week-day-steps">${steps > 0 ? Math.round(steps/1000*10)/10+'k' : ''}</div>
      `;
      container.appendChild(div);
    });
  }

  function changeWeek(dir) {
    const next = weekOffset + dir;
    if (next < -3 || next > 0) return;
    weekOffset = next;
    renderWeek();
  }
  function weekSwipeStart(e) { weekSwipeStartX = e.touches[0].clientX; }
  function weekSwipeEnd(e) {
    const dx = e.changedTouches[0].clientX - weekSwipeStartX;
    if (Math.abs(dx) < 40) return;
    if (dx < 0) changeWeek(-1);
    else changeWeek(1);
  }

  let editTargetDate = '';
  function openEditModal(dateStr) {
    editTargetDate = dateStr;
    const d = getDateData(dateStr);
    const [y, m, day] = dateStr.split('-');
    const dateObj = new Date(parseInt(y), parseInt(m)-1, parseInt(day));
    const dayNames = ['日','月','火','水','木','金','土'];
    document.getElementById('edit-modal-title').textContent = `${m}月${day}日（${dayNames[dateObj.getDay()]}）の訂正`;
    document.getElementById('edit-steps-input').value = d.steps || '';
    renderEditLogList(d);
    document.getElementById('edit-food-name').value = '';
    document.getElementById('edit-food-qty').value = '1';
    document.getElementById('edit-food-cal').value = '';
    editSelectedBase = { cal: 0, fat: 0, protein: 0, carbs: 0 };
    document.getElementById('edit-suggest-list').style.display = 'none';
    hideError('edit-steps-error');
    hideError('edit-food-error');
    document.getElementById('edit-modal-overlay').classList.add('open');
  }
  function renderEditLogList(d) {
    const container = document.getElementById('edit-log-list');
    container.innerHTML = '';
    if (!d.logs.length) {
      container.innerHTML = '<div style="font-size:12px;color:var(--muted);padding:8px 0;">ログなし</div>';
      return;
    }
    d.logs.forEach((item, idx) => {
      const div = document.createElement('div');
      div.className = 'edit-log-item';
      div.innerHTML = `
        <div>
          <b style="font-size:13px;">${item.name}</b>${item.qty && item.qty !== 1 ? ` <small>×${item.qty}</small>` : ''}
          <br><small style="color:var(--muted);">${item.cal}kcal / F:${item.fat}g / ${item.time}</small>
        </div>
        <button class="edit-log-del" onclick="deleteEditLog(${idx})">削除</button>
      `;
      container.appendChild(div);
    });
  }
  function deleteEditLog(idx) {
    const d = getDateData(editTargetDate);
    d.logs.splice(idx, 1);
    saveData();
    renderEditLogList(d);
    if (editTargetDate === getViewDate()) { render(); }
    renderWeek(); renderGraph();
  }
  function saveEditSteps() {
    const v = parseInt(document.getElementById('edit-steps-input').value);
    if (isNaN(v) || v < 0) { showError('edit-steps-error'); return; }
    hideError('edit-steps-error');
    getDateData(editTargetDate).steps = v;
    saveData();
    if (editTargetDate === getViewDate()) { render(); }
    renderWeek(); renderGraph();
  }
  function addEditLog() {
    const n = document.getElementById('edit-food-name').value.trim();
    const qty = parseFloat(document.getElementById('edit-food-qty').value) || 1;
    if (!n || !editSelectedBase.cal) { showError('edit-food-error'); return; }
    hideError('edit-food-error');
    const isToday = (editTargetDate === today());
    const now = new Date();
    const timeStr = isToday
      ? `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`
      : '手入力';
    const d = getDateData(editTargetDate);
    d.logs.push({
      name: n, qty,
      cal: Math.round(editSelectedBase.cal * qty),
      fat: parseFloat((editSelectedBase.fat * qty).toFixed(1)),
      protein: parseFloat((editSelectedBase.protein * qty).toFixed(1)),
      carbs: parseFloat((editSelectedBase.carbs * qty).toFixed(1)),
      time: timeStr
    });
    saveData();
    renderEditLogList(d);
    if (editTargetDate === getViewDate()) { render(); }
    renderWeek(); renderGraph();
    document.getElementById('edit-food-name').value = '';
    document.getElementById('edit-food-qty').value = '1';
    document.getElementById('edit-food-cal').value = '';
    editSelectedBase = { cal: 0, fat: 0, protein: 0, carbs: 0 };
  }
  function closeEditModal(e) {
    if (e.target === document.getElementById('edit-modal-overlay')) closeEditModalDirect();
  }
  function closeEditModalDirect() {
    document.getElementById('edit-modal-overlay').classList.remove('open');
  }

  // ===== クイック食事入力（フローティングボタン）=====
  let quickSelectedBase = { cal: 0, fat: 0, protein: 0, carbs: 0 };

  function openQuickModal() {
    const d = new Date();
    d.setDate(d.getDate() + viewDateOffset);
    const dayNames = ['日','月','火','水','木','金','土'];
    const label = viewDateOffset === 0
      ? `今日 ${d.getMonth()+1}/${d.getDate()}（${dayNames[d.getDay()]}）に追加`
      : `${d.getMonth()+1}/${d.getDate()}（${dayNames[d.getDay()]}）に追加`;
    document.getElementById('quick-modal-date').textContent = label;
    document.getElementById('quick-food-name').value = '';
    document.getElementById('quick-food-qty').value = '1';
    ['quick-food-cal','quick-food-fat','quick-food-protein','quick-food-carbs'].forEach(id => document.getElementById(id).value = '');
    quickSelectedBase = { cal: 0, fat: 0, protein: 0, carbs: 0 };
    document.getElementById('quick-suggest-list').style.display = 'none';
    hideError('quick-food-error');
    document.getElementById('quick-modal-overlay').classList.add('open');
  }
  function closeQuickModal(e) {
    if (e.target === document.getElementById('quick-modal-overlay')) closeQuickModalDirect();
  }
  function closeQuickModalDirect() {
    document.getElementById('quick-modal-overlay').classList.remove('open');
  }
  function searchMenuQuick(query) {
    const box = document.getElementById('quick-suggest-list');
    if (!query) { box.style.display = 'none'; return; }
    const q = normalize(query);
    const filtered = menuDatabase.filter(i => normalize(i.name).includes(q)).slice(0, 12);
    if (!filtered.length) { box.style.display = 'none'; return; }
    box.innerHTML = '';
    filtered.forEach(item => {
      const div = document.createElement('div');
      div.className = 'suggest-item';
      div.innerHTML = `<div>${item.name}</div><div class="suggest-meta">${item.cal}kcal / F:${item.fat}g</div>`;
      div.onclick = () => {
        document.getElementById('quick-food-name').value = item.name;
        quickSelectedBase = { cal: item.cal, fat: item.fat, protein: item.protein, carbs: item.carbs };
        document.getElementById('quick-food-qty').value = '1';
        updateQuickQty();
        box.style.display = 'none';
        hideError('quick-food-error');
      };
      box.appendChild(div);
    });
    box.style.display = 'block';
  }
  function updateQuickQty() {
    const qty = parseFloat(document.getElementById('quick-food-qty').value) || 1;
    document.getElementById('quick-food-cal').value = Math.round(quickSelectedBase.cal * qty);
    document.getElementById('quick-food-fat').value = (quickSelectedBase.fat * qty).toFixed(1);
    document.getElementById('quick-food-protein').value = (quickSelectedBase.protein * qty).toFixed(1);
    document.getElementById('quick-food-carbs').value = (quickSelectedBase.carbs * qty).toFixed(1);
  }
  document.getElementById('quick-food-qty').addEventListener('input', updateQuickQty);
  function addQuickLog() {
    const n = document.getElementById('quick-food-name').value.trim();
    if (!n || (!quickSelectedBase.cal && quickSelectedBase.cal !== 0)) { showError('quick-food-error', '食べたものを検索して選んでください'); return; }
    if (!quickSelectedBase.cal) { showError('quick-food-error', '食べたものを検索して選んでください'); return; }
    hideError('quick-food-error');
    const qty = parseFloat(document.getElementById('quick-food-qty').value) || 1;
    const isToday = (viewDateOffset === 0);
    const now = new Date();
    const timeStr = isToday
      ? `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`
      : '手入力';
    getViewData().logs.push({
      name: n, qty,
      cal: Math.round(quickSelectedBase.cal * qty),
      fat: parseFloat((quickSelectedBase.fat * qty).toFixed(1)),
      protein: parseFloat((quickSelectedBase.protein * qty).toFixed(1)),
      carbs: parseFloat((quickSelectedBase.carbs * qty).toFixed(1)),
      time: timeStr
    });
    saveData(); render(); renderWeek(); renderGraph();
    closeQuickModalDirect();
  }

  function addExercise() {
    const type = document.getElementById('exercise-type').value;
    const hours = parseFloat(document.getElementById('exercise-time').value);
    if (!type || !hours || hours <= 0) { showError('exercise-error', '種目と時間を入力してください'); return; }
    hideError('exercise-error');
    const cal = calcExerciseBurn(type, hours, profile);
    const now = new Date();
    const timeStr = now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0');
    getViewData().exercises.push({ type, hours, cal, time: timeStr });
    document.getElementById('exercise-type').value = '';
    document.getElementById('exercise-time').value = '';
    document.getElementById('exercise-preview').style.display = 'none';
    saveData(); render(); renderWeek(); renderGraph();
  }
  function deleteExercise(idx) {
    const d = getViewData();
    d.exercises.splice(idx, 1);
    saveData(); render(); renderWeek(); renderGraph();
  }

  function filterRecipeByCategory(category) {
    const sel = document.getElementById('recipe-select');
    sel.innerHTML = '<option value="">レシピを選んでください</option>';
    const filtered = category ? recipeDatabase.filter(r => r.category === category) : recipeDatabase;
    filtered.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r.name;
      opt.textContent = r.name;
      sel.appendChild(opt);
    });
    closeRecipeDetail();
  }

  function closeRecipeDetail() {
    document.getElementById('recipe-detail').style.display = 'none';
    document.getElementById('recipe-select').value = '';
    hideError('recipe-error');
  }

  function showRecipe(name) {
    const detail = document.getElementById('recipe-detail');
    hideError('recipe-error');
    if (!name) { detail.style.display = 'none'; return; }
    const recipe = recipeDatabase.find(r => r.name === name);
    if (!recipe) { detail.style.display = 'none'; return; }
    document.getElementById('recipe-title').textContent = recipe.name;
    document.getElementById('recipe-ingredients').innerHTML =
      recipe.ingredients.split('/').map(s => '・' + s.trim()).join('<br>');
    document.getElementById('recipe-steps').innerHTML =
      recipe.steps.split('/').map(s => s.trim()).join('<br>');
    detail.style.display = 'block';
  }

  function registerRecipeLog() {
    const name = document.getElementById('recipe-select').value;
    if (!name) return;
    const recipe = recipeDatabase.find(r => r.name === name);
    if (!recipe) { showError('recipe-error', 'レシピが見つかりません'); return; }
    hideError('recipe-error');
    const now = new Date();
    const timeStr = now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0');
    getViewData().logs.push({
      name: recipe.name, qty: 1,
      cal: recipe.cal, fat: recipe.fat, protein: recipe.protein, carbs: recipe.carbs,
      time: timeStr
    });
    saveData(); render(); renderWeek(); renderGraph();
    closeRecipeDetail();
  }

// ==============================
// SECTION 7: JS - グラフ
// ==============================

  let graphTab = 'intake';
  let graphPeriod = 'day';
  let graphOffset = 0;
  const GRAPH_NAV_LIMIT = 11;

  function selectGraphTab(tab) {
    graphTab = tab;
    graphOffset = 0;
    ['weight','intake','burn','balance','steps'].forEach(t => {
      document.getElementById('tab-' + t).classList.toggle('active', t === tab);
    });
    const periodBar = document.getElementById('graph-period-bar');
    if (tab === 'weight') {
      periodBar.classList.add('hidden');
    } else {
      periodBar.classList.remove('hidden');
    }
    renderGraph();
  }

  function selectGraphPeriod(period) {
    graphPeriod = period;
    graphOffset = 0;
    ['day','week','month'].forEach(p => {
      document.getElementById('period-' + p).classList.toggle('active', p === period);
    });
    renderGraph();
  }

  function changeGraphOffset(dir) {
    const next = graphOffset + dir;
    if (next > 0 || next < -GRAPH_NAV_LIMIT) return;
    graphOffset = next;
    renderGraph();
  }

  // ★ 修正ポイント：未来日は0を返す
  function getDayValue(dateStr, metric) {
    if (dateStr > today()) return 0;
    const day = allData[dateStr];
    const intake = day ? day.logs.reduce((s, i) => s + i.cal, 0) : 0;
    if (metric === 'intake') return intake;
    const burn = day ? calcTotalBurn(day.steps, profile, day.exercises) : 0;
    if (metric === 'burn') return burn;
    if (metric === 'steps') return day ? (day.steps || 0) : 0;
    return burn - intake;
  }

  function getWeekDateStrs(offset) {
    const now = new Date();
    const dow = now.getDay();
    const mondayOffset = (dow === 0) ? -6 : 1 - dow;
    const monday = new Date(now);
    monday.setDate(now.getDate() + mondayOffset + offset * 7);
    monday.setHours(0,0,0,0);
    const arr = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      arr.push(dateStrFromDate(d));
    }
    return arr;
  }

  function getLast30Days() {
    const days = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      days.push(dateStrFromDate(d));
    }
    return days;
  }

  function metricColor(metric) {
    if (metric === 'intake') return '#E60012';
    if (metric === 'burn') return '#43B047';
    if (metric === 'steps') return '#FF9F00';
    return '#2A6FD6';
  }

  function renderGraph() {
    const ctx = document.getElementById('mainChart').getContext('2d');
    if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
    const nav = document.getElementById('graph-nav');
    if (graphTab === 'weight') {
      nav.classList.add('hidden');
      renderWeightChart(ctx);
      return;
    }
    const metric = graphTab;
    if (graphPeriod === 'day') {
      nav.classList.add('hidden');
      renderDayChart(ctx, metric);
      return;
    }
    if (graphPeriod === 'week') {
      nav.classList.remove('hidden');
      renderWeekChart(ctx, metric);
      return;
    }
    if (graphPeriod === 'month') {
      nav.classList.remove('hidden');
      renderMonthChart(ctx, metric);
      return;
    }
  }

  function renderWeightChart(ctx) {
    const days = getLast30Days();
    const labels = days.map(d => d.slice(5));
    const data = days.map(d => {
      const w = weightLog.find(x => x.date === d);
      return w ? w.weight : null;
    });
    const datasets = [{
      label: '体重(kg)', data,
      borderColor: '#2A6FD6', backgroundColor: '#2A6FD633',
      borderWidth: 2, pointRadius: 4, tension: 0.3, spanGaps: true
    }];
    if (profile && profile.targetWeight) {
      datasets.push({
        label: '目標体重', data: days.map(() => profile.targetWeight),
        borderColor: '#43B047', borderWidth: 2, borderDash: [6,3],
        pointRadius: 0, tension: 0
      });
    }
    chartInstance = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        plugins: { legend: { display: true, labels: { font: { size: 10 } } } },
        scales: {
          x: { ticks: { font: { size: 9 }, maxRotation: 45 } },
          y: { ticks: { font: { size: 10 }, callback: v => v + 'kg' } }
        }
      }
    });
  }

  function renderDayChart(ctx, metric) {
    const days = getLast30Days();
    const labels = days.map(d => d.slice(5));
    const data = days.map(d => getDayValue(d, metric));
    buildBarChart(ctx, labels, data, metric, true);
  }

  function renderWeekChart(ctx, metric) {
    const todayStr = today();
    const dateStrs = getWeekDateStrs(graphOffset);
    const dayLabels = ['月','火','水','木','金','土','日'];
    const data = dateStrs.map(ds => ds > todayStr ? null : getDayValue(ds, metric));
    const total = data.reduce((s, v) => s + (v || 0), 0);
    const [sy, sm, sd] = dateStrs[0].split('-');
    const [ey, em, ed] = dateStrs[6].split('-');
    document.getElementById('graph-nav-range').textContent =
      `${parseInt(sm)}/${parseInt(sd)} 〜 ${parseInt(em)}/${parseInt(ed)}`;
    if (metric === 'steps') {
      const daysWithSteps = dateStrs.filter(ds => ds <= todayStr && allData[ds] && allData[ds].steps > 0).length;
      const avg = daysWithSteps > 0 ? Math.round(total / daysWithSteps) : 0;
      updateNavTotal(metric, total, '週合計', avg);
    } else {
      updateNavTotal(metric, total, '週合計');
    }
    document.getElementById('graph-prev-btn').disabled = graphOffset <= -GRAPH_NAV_LIMIT;
    document.getElementById('graph-next-btn').disabled = graphOffset >= 0;
    buildBarChart(ctx, dayLabels, data, metric, false);
  }

  function renderMonthChart(ctx, metric) {
    const todayStr = today();
    const base = new Date();
    base.setMonth(base.getMonth() + graphOffset, 1);
    const year = base.getFullYear();
    const month = base.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const weekMap = new Map();
    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(year, month, day);
      const ds = dateStrFromDate(d);
      if (ds > todayStr) break;
      const dow = d.getDay();
      const mondayOffset = (dow === 0) ? -6 : 1 - dow;
      const monday = new Date(d);
      monday.setDate(d.getDate() + mondayOffset);
      monday.setHours(0,0,0,0);
      const mKey = dateStrFromDate(monday);
      if (!weekMap.has(mKey)) {
        const days7 = [];
        for (let i = 0; i < 7; i++) {
          const wd = new Date(monday);
          wd.setDate(monday.getDate() + i);
          days7.push(dateStrFromDate(wd));
        }
        weekMap.set(mKey, { label: `${monday.getMonth() + 1}/${monday.getDate()}週`, days: days7 });
      }
    }
    const weeks = Array.from(weekMap.values());
    const labels = weeks.map(w => w.label);
    const data = weeks.map(w => w.days.reduce((s, ds) => s + getDayValue(ds, metric), 0));
    let monthTotal = data.reduce((s, v) => s + v, 0);
    document.getElementById('graph-nav-range').textContent = `${year}年 ${month + 1}月`;
    if (metric === 'steps') {
      let daysWithSteps = 0;
      for (let d = 1; d <= daysInMonth; d++) {
        const ds = dateStrFromDate(new Date(year, month, d));
        if (ds > todayStr) break;
        if (allData[ds] && allData[ds].steps > 0) daysWithSteps++;
      }
      const avg = daysWithSteps > 0 ? Math.round(monthTotal / daysWithSteps) : 0;
      updateNavTotal(metric, monthTotal, '月合計', avg);
    } else {
      updateNavTotal(metric, monthTotal, '月合計');
    }
    document.getElementById('graph-prev-btn').disabled = graphOffset <= -GRAPH_NAV_LIMIT;
    document.getElementById('graph-next-btn').disabled = graphOffset >= 0;
    buildBarChart(ctx, labels, data, metric, false);
  }

  function updateNavTotal(metric, total, prefix, avg) {
    const el = document.getElementById('graph-nav-total');
    if (metric === 'steps') {
      let text = `${prefix} ${total.toLocaleString()}歩`;
      if (avg !== undefined) text += `  平均 ${avg.toLocaleString()}歩/日`;
      el.textContent = text;
      el.style.color = metricColor('steps');
    } else if (metric === 'balance') {
      if (total >= 0) {
        el.textContent = `${prefix} アンダー +${total.toLocaleString()}kcal`;
        el.style.color = 'var(--green)';
      } else {
        el.textContent = `${prefix} オーバー ${Math.abs(total).toLocaleString()}kcal`;
        el.style.color = 'var(--red)';
      }
    } else {
      el.textContent = `${prefix} ${total.toLocaleString()}kcal`;
      el.style.color = metricColor(metric);
    }
  }

  function buildBarChart(ctx, labels, data, metric, rotate) {
    let bg, border;
    if (metric === 'balance') {
      bg = data.map(v => v >= 0 ? '#43B04799' : '#E6001299');
      border = data.map(v => v >= 0 ? '#43B047' : '#E60012');
    } else {
      const c = metricColor(metric);
      bg = c + '99';
      border = c;
    }
    chartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{ data, backgroundColor: bg, borderColor: border, borderWidth: 2, borderRadius: 4, maxBarThickness: 48 }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => {
                const v = ctx.parsed.y;
                if (metric === 'steps') return v.toLocaleString() + '歩';
                if (metric === 'balance') {
                  return (v >= 0 ? 'アンダー +' : 'オーバー ') + Math.abs(v).toLocaleString() + 'kcal';
                }
                return v.toLocaleString() + 'kcal';
              }
            }
          }
        },
        scales: {
          x: { ticks: { font: { size: 9 }, maxRotation: rotate ? 45 : 0 } },
          y: { ticks: { font: { size: 10 }, callback: v => v + (metric === 'steps' ? '歩' : 'kcal') } }
        }
      }
    });
  }

  document.addEventListener('click', e => {
    if (e.target.id !== 'food-name') document.getElementById('suggest-list').style.display = 'none';
    if (e.target.id !== 'edit-food-name') document.getElementById('edit-suggest-list').style.display = 'none';
    if (e.target.id !== 'quick-food-name') document.getElementById('quick-suggest-list').style.display = 'none';
  });

// ==============================
// SECTION 8: JS - バックアップ・リストア
// ==============================

  function exportData() {
    const backup = {
      version: 'pfc_v9',
      exportedAt: new Date().toISOString(),
      profile: profile,
      logs: allData,
      weightLog: weightLog
    };
    const json = JSON.stringify(backup, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const date = dateStrFromDate(new Date());
    a.href = url;
    a.download = `pfc-backup-${date}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importData(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const backup = JSON.parse(e.target.result);
        if (!backup.version || !backup.logs) {
          showError('import-error', '読み込みエラー: ファイルが正しくありません');
          return;
        }
        if (backup.profile) {
          profile = backup.profile;
          localStorage.setItem('pfc_profile', JSON.stringify(profile));
        }
        if (backup.logs) {
          allData = backup.logs;
          saveData();
        }
        if (backup.weightLog) {
          weightLog = backup.weightLog;
          localStorage.setItem('pfc_weight', JSON.stringify(weightLog));
        }
        hideError('import-error');
        const success = document.getElementById('import-success');
        success.style.display = 'block';
        setTimeout(() => { success.style.display = 'none'; }, 3000);
        renderProfile();
        render();
        renderWeek();
        renderGraph();
      } catch(err) {
        showError('import-error', '読み込みに失敗しました');
      }
      event.target.value = '';
    };
    reader.readAsText(file);
  }

// ===== 今食べられるもの =====
function openCanEatModal() {
  const targets = getTargets();
  const d = getViewData();
  let tCal = 0, tFat = 0;
  d.logs.forEach(i => { tCal += i.cal; tFat += i.fat; });
  const remCal = targets.targetCal - tCal;
  const remFat = targets.targetFat - tFat;

  document.getElementById('can-eat-remaining').textContent =
    `残りカロリー: ${remCal}kcal / 残りF: ${remFat.toFixed(1)}g`;

  const sel = document.getElementById('can-eat-category');
  if (sel.options.length === 1) {
    const cats = [...new Set(menuDatabase.map(i => i.category).filter(Boolean))];
    cats.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c; opt.textContent = c;
      sel.appendChild(opt);
    });
  }

  document.getElementById('can-eat-overlay').classList.add('open');
  renderCanEatList();
}

function renderCanEatList() {
  const targets = getTargets();
  const d = getViewData();
  let tCal = 0, tFat = 0;
  d.logs.forEach(i => { tCal += i.cal; tFat += i.fat; });
  const remCal = targets.targetCal - tCal;
  const remFat = targets.targetFat - tFat;
  const category = document.getElementById('can-eat-category').value;

  const filtered = menuDatabase.filter(i =>
    i.cal <= remCal &&
    i.fat <= remFat &&
    (!category || i.category === category)
  ).sort((a, b) => b.cal - a.cal).slice(0, 50);

  const container = document.getElementById('can-eat-list');
  if (!filtered.length) {
    container.innerHTML = '<div style="text-align:center;color:var(--muted);font-size:12px;padding:20px 0;">該当なし</div>';
    return;
  }
  container.innerHTML = filtered.map(i =>
    `<div class="log-item">
      <div style="flex:1;"><b>${i.name}</b>${i.category ? `<br><small style="color:var(--muted);">${i.category}</small>` : ''}</div>
      <div class="log-values">${i.cal}kcal / F:${i.fat}g</div>
    </div>`
  ).join('');
}

function closeCanEatModal(e) {
  if (e.target === document.getElementById('can-eat-overlay')) closeCanEatModalDirect();
}
function closeCanEatModalDirect() {
  document.getElementById('can-eat-overlay').classList.remove('open');
}

  // 初期化
  loadCSV();
  loadData();
  document.getElementById('exercise-type').addEventListener('change', updateExercisePreview);
  document.getElementById('exercise-time').addEventListener('input', updateExercisePreview);
  // 既存のService Workerを解除し、古いキャッシュを削除（キャッシュ問題の根本対処）
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(regs => {
      regs.forEach(reg => reg.unregister());
    });
    if (window.caches) {
      caches.keys().then(keys => keys.forEach(k => caches.delete(k)));
    }
  }
