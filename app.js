// ==========================================
// 每日打卡应用 - 核心逻辑 v2.1
// ==========================================
// 关键特性：只有手动点击"签退"才能结束当日打卡

// 关闭网页再打开，签到状态依然保持

const DEFAULT_PROJECTS = [
    { id: 'work', name: '上班', mode: 'range' },
    { id: 'fitness', name: '健身', mode: 'single' }
];

const DEFAULT_PROJECT_GOALS = {
    weeklyDays: 0,
    monthlyDays: 0,
    dailyMinutes: 0
};

const DEFAULT_PROJECT_REST_DAYS = {
    weekly: [],
    dates: []
};

const HOLIDAYS = {
    '2026-01-01': '\u5143\u65e6',
    '2026-05-01': '\u52b3\u52a8\u8282'
};

const STORAGE_KEYS = {
    records: 'checkin_records',
    settings: 'checkin_settings',
    lastDate: 'checkin_last_date'
};

function safeStorageGet(key) {
    try {
        return localStorage.getItem(key);
    } catch (error) {
        console.warn('localStorage read failed:', key, error);
        return null;
    }
}

function safeStorageSet(key, value) {
    try {
        localStorage.setItem(key, value);
        return true;
    } catch (error) {
        console.warn('localStorage write failed:', key, error);
        showToast('\u672c\u5730\u5b58\u50a8\u5199\u5165\u5931\u8d25', '\u26a0\ufe0f');
        return false;
    }
}

function safeStorageRemove(key) {
    try {
        localStorage.removeItem(key);
        return true;
    } catch (error) {
        console.warn('localStorage remove failed:', key, error);
        showToast('\u672c\u5730\u5b58\u50a8\u5220\u9664\u5931\u8d25', '\u26a0\ufe0f');
        return false;
    }
}

function parseJSONValue(value, fallback) {
    if (!value) return fallback;
    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' ? parsed : fallback;
    } catch (error) {
        console.warn('Invalid JSON in localStorage:', error);
        showToast('\u672c\u5730\u6570\u636e\u635f\u574f\uff0c\u5df2\u4f7f\u7528\u7a7a\u6570\u636e\u542f\u52a8', '\u26a0\ufe0f');
        return fallback;
    }
}

// ===== 数据管理 - 使用 localStorage 持久化存储 =====
function clampInteger(value, min, max) {
    const number = Number.parseInt(value, 10);
    if (!Number.isFinite(number)) return min;
    return Math.min(max, Math.max(min, number));
}

function normalizeProjectGoals(goals) {
    const source = goals && typeof goals === 'object' ? goals : {};
    return {
        weeklyDays: clampInteger(source.weeklyDays, 0, 7),
        monthlyDays: clampInteger(source.monthlyDays, 0, 31),
        dailyMinutes: clampInteger(source.dailyMinutes, 0, 1440)
    };
}

function isValidDateString(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00`);
    return !Number.isNaN(date.getTime()) && formatDate(date) === value;
}

function normalizeProjectRestDays(restDays) {
    const source = restDays && typeof restDays === 'object' ? restDays : {};
    const weekly = Array.isArray(source.weekly)
        ? [...new Set(source.weekly.map(day => Number.parseInt(day, 10)).filter(day => Number.isInteger(day) && day >= 0 && day <= 6))].sort((a, b) => a - b)
        : [];
    const dates = Array.isArray(source.dates)
        ? [...new Set(source.dates.filter(isValidDateString))].sort()
        : [];
    return { weekly, dates };
}

const DB = {
    getRecords(projectId = this.getActiveProjectId()) {
        const allRecords = this.getAllRecords();
        return allRecords[projectId] || {};
    },

    saveRecords(records, projectId = this.getActiveProjectId()) {
        const allRecords = this.getAllRecords();
        allRecords[projectId] = records;
        safeStorageSet(STORAGE_KEYS.records, JSON.stringify(allRecords));
    },

    getAllRecords() {
        const records = parseJSONValue(safeStorageGet(STORAGE_KEYS.records), {});
        const values = Object.values(records);
        const isLegacyRecords = values.some(record => record && (record.signIn || record.signOut || record.completedAt || record.date));
        return isLegacyRecords ? { work: records } : records;
    },

    saveAllRecords(records) {
        safeStorageSet(STORAGE_KEYS.records, JSON.stringify(records && typeof records === 'object' ? records : {}));
    },

    getSettings() {
        const settings = parseJSONValue(safeStorageGet(STORAGE_KEYS.settings), {
            name: '',
            remindEnabled: false,
            remindTime: '08:00'
        });
        settings.projects = this.normalizeProjects(settings.projects);
        if (!settings.activeProjectId || !settings.projects.some(p => p.id === settings.activeProjectId)) {
            settings.activeProjectId = settings.projects[0].id;
        }
        return settings;
    },

    saveSettings(settings) {
        settings.projects = this.normalizeProjects(settings.projects);
        if (!settings.activeProjectId || !settings.projects.some(p => p.id === settings.activeProjectId)) {
            settings.activeProjectId = settings.projects[0].id;
        }
        safeStorageSet(STORAGE_KEYS.settings, JSON.stringify(settings));
    },

    normalizeProjects(projects) {
        if (!Array.isArray(projects) || projects.length === 0) {
            return DEFAULT_PROJECTS.map(project => ({
                ...project,
                goals: normalizeProjectGoals(project.goals),
                restDays: normalizeProjectRestDays(project.restDays)
            }));
        }
        const normalized = projects
            .filter(project => project && project.id && project.name)
            .map(project => ({
                id: project.id,
                name: project.name,
                mode: project.mode === 'single' ? 'single' : 'range',
                goals: normalizeProjectGoals(project.goals),
                restDays: normalizeProjectRestDays(project.restDays)
            }));
        return normalized.length > 0 ? normalized : DEFAULT_PROJECTS.map(project => ({
            ...project,
            goals: normalizeProjectGoals(project.goals),
            restDays: normalizeProjectRestDays(project.restDays)
        }));
    },

    getProjects() {
        return this.getSettings().projects;
    },

    getActiveProjectId() {
        return this.getSettings().activeProjectId;
    },

    getActiveProject() {
        const settings = this.getSettings();
        return settings.projects.find(p => p.id === settings.activeProjectId) || settings.projects[0];
    },

    setActiveProject(projectId) {
        const settings = this.getSettings();
        if (settings.projects.some(p => p.id === projectId)) {
            settings.activeProjectId = projectId;
            this.saveSettings(settings);
        }
    },

    getDayRecord(dateStr, projectId = this.getActiveProjectId()) {
        const records = this.getRecords(projectId);
        return records[dateStr] || null;
    },

    setDayRecord(dateStr, record, projectId = this.getActiveProjectId()) {
        const records = this.getRecords(projectId);
        records[dateStr] = record;
        this.saveRecords(records, projectId);
    }
};

// ===== 当前活跃的标签页 =====
let currentTab = 'main';

// ===== 标记页面是否已初始化 =====
let historyInitialized = false;

// ===== 工具函数 =====
function formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function formatTime(date) {
    const h = String(date.getHours()).padStart(2, '0');
    const m = String(date.getMinutes()).padStart(2, '0');
    const s = String(date.getSeconds()).padStart(2, '0');
    return `${h}:${m}:${s}`;
}

function getWeekday(date) {
    const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    return weekdays[date.getDay()];
}

function getToday() {
    return formatDate(new Date());
}

function getModeLabel(mode) {
    return mode === 'single' ? '单次打卡' : '签到/签退';
}

function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[char]));
}

function createProjectId() {
    return `project_${Date.now()}`;
}

function getSignOutDate(record) {
    return record.signOutDate || record.date;
}

function getWorkDurationMinutes(record) {
    if (!record || !record.signIn || !record.signOut) return 0;
    const signInDateTime = new Date(`${record.date}T${record.signIn}`);
    const signOutDateTime = new Date(`${getSignOutDate(record)}T${record.signOut}`);

    if (Number.isNaN(signInDateTime.getTime()) || Number.isNaN(signOutDateTime.getTime())) {
        return 0;
    }

    if (signOutDateTime < signInDateTime && !record.signOutDate) {
        signOutDateTime.setDate(signOutDateTime.getDate() + 1);
    }

    return Math.max(0, Math.round((signOutDateTime - signInDateTime) / (1000 * 60)));
}

function isRecordStarted(record) {
    return !!(record && (record.signIn || record.completedAt));
}

function isRecordCompleted(record) {
    return !!(record && (record.signOut || record.completedAt));
}

function findLatestOpenRecordDate(upToDateStr = getToday()) {
    const records = DB.getRecords();
    return Object.keys(records)
        .filter(date => date <= upToDateStr && records[date].signIn && !records[date].signOut)
        .sort()
        .reverse()[0] || null;
}

// ===== Toast 提示 =====
function showToast(message, icon = '✅') {
    let toast = document.querySelector('.toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.className = 'toast';
        document.body.appendChild(toast);
    }
    toast.textContent = '';

    const iconEl = document.createElement('div');
    iconEl.className = 'toast-icon';
    iconEl.textContent = icon;

    const messageEl = document.createElement('div');
    messageEl.textContent = message;

    toast.appendChild(iconEl);
    toast.appendChild(messageEl);
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 1500);
}

function refreshAllViews() {
    loadUserInfo();
    renderProjectSelector();
    loadTodayInfo();
    updateStats();
    loadRecords();
    updateCalendar();
    if (currentTab === 'history') renderHistoryPage();
}

function getExportData() {
    return {
        version: 1,
        exportedAt: new Date().toISOString(),
        settings: DB.getSettings(),
        records: DB.getAllRecords()
    };
}

function downloadTextFile(filename, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

function exportJSON() {
    downloadTextFile(`checkin-backup-${getToday()}.json`, JSON.stringify(getExportData(), null, 2), 'application/json;charset=utf-8');
    showToast('\u5df2\u5bfc\u51fa JSON', '\u2705');
}

function csvCell(value) {
    const text = value === undefined || value === null ? '' : String(value);
    return `"${text.replace(/"/g, '""')}"`;
}

function exportCSV() {
    const records = DB.getAllRecords();
    const projects = DB.getProjects();
    const projectMap = Object.fromEntries(projects.map(project => [project.id, project]));
    const rows = [[
        'projectId',
        'projectName',
        'projectMode',
        'date',
        'signIn',
        'signOut',
        'signOutDate',
        'completedAt',
        'durationMinutes',
        'status'
    ]];

    Object.keys(records).forEach(projectId => {
        const projectRecords = records[projectId] || {};
        const project = projectMap[projectId] || { id: projectId, name: projectId, mode: '' };
        Object.keys(projectRecords).sort().forEach(date => {
            const record = projectRecords[date];
            if (!isRecordStarted(record)) return;
            rows.push([
                projectId,
                project.name,
                project.mode,
                date,
                record.signIn || '',
                record.signOut || '',
                record.signOutDate || '',
                record.completedAt || '',
                project.mode === 'range' ? getWorkDurationMinutes(record) : '',
                isRecordCompleted(record) ? 'completed' : 'partial'
            ]);
        });
    });

    const csv = rows.map(row => row.map(csvCell).join(',')).join('\r\n');
    downloadTextFile(`checkin-records-${getToday()}.csv`, `\ufeff${csv}`, 'text/csv;charset=utf-8');
    showToast('\u5df2\u5bfc\u51fa CSV', '\u2705');
}

function importJSON() {
    const input = document.getElementById('jsonImportInput');
    if (input) input.click();
}

function readImportPayload(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw new Error('Invalid payload');
    }
    const records = payload.records || payload.checkin_records || payload;
    const settings = payload.settings || payload.checkin_settings || DB.getSettings();
    if (!records || typeof records !== 'object' || Array.isArray(records)) {
        throw new Error('Invalid records');
    }
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
        throw new Error('Invalid settings');
    }
    settings.projects = DB.normalizeProjects(settings.projects);
    if (!settings.activeProjectId || !settings.projects.some(project => project.id === settings.activeProjectId)) {
        settings.activeProjectId = settings.projects[0].id;
    }
    return { records, settings };
}

function handleJSONImportFile(input) {
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function() {
        try {
            const payload = JSON.parse(reader.result);
            const data = readImportPayload(payload);
            if (!confirm('\u5bfc\u5165 JSON \u4f1a\u8986\u76d6\u5f53\u524d\u672c\u5730\u8bb0\u5f55\uff0c\u786e\u5b9a\u7ee7\u7eed\u5417\uff1f')) return;
            DB.saveSettings(data.settings);
            DB.saveAllRecords(data.records);
            refreshAllViews();
            showToast('\u5df2\u5bfc\u5165 JSON', '\u2705');
        } catch (error) {
            console.warn('JSON import failed:', error);
            showToast('\u5bfc\u5165\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5 JSON \u6587\u4ef6', '\u26a0\ufe0f');
        }
    };
    reader.readAsText(file, 'utf-8');
}

// ===== 初始化应用 =====
function initApp() {
    const settings = DB.getSettings();
    if (settings.name) {
        // 用户已设置姓名，进入主界面
        document.getElementById('setupPage').style.display = 'none';
        document.getElementById('mainPage').classList.add('active');
        loadUserInfo();
        renderProjectSelector();
        loadTodayInfo();  // 从 localStorage 读取今日打卡状态
        updateStats();
        loadRecords();
        updateCalendar();
        startClock();
    } else {
        // 首次使用，显示欢迎页
        document.getElementById('setupPage').style.display = 'block';
        document.getElementById('mainPage').classList.remove('active');
    }
    updateHeaderDate();
}

// ===== 用户管理 =====
function saveUserName() {
    const name = document.getElementById('userNameInput').value.trim();
    if (!name) {
        showToast('请输入您的姓名', '⚠️');
        return;
    }
    const settings = DB.getSettings();
    settings.name = name;
    DB.saveSettings(settings);
    showToast(`欢迎您，${name}！`, '🎉');
    initApp();
}

function loadUserInfo() {
    const settings = DB.getSettings();
    const name = settings.name;
    document.getElementById('displayName').textContent = name;
    
    const avatarEmojis = ['👤', '😊', '🌟', '💪', '🎯', '🚀', '🌈', '⭐'];
    const avatarIndex = name.length % avatarEmojis.length;
    document.getElementById('userAvatar').textContent = avatarEmojis[avatarIndex];
}

function formatProjectGoalSummary(project) {
    const goals = normalizeProjectGoals(project.goals);
    const parts = [];
    if (goals.weeklyDays > 0) {
        parts.push(`\u5468${goals.weeklyDays}\u5929`);
    }
    if (goals.monthlyDays > 0) {
        parts.push(`\u6708${goals.monthlyDays}\u5929`);
    }
    if (project.mode === 'range' && goals.dailyMinutes > 0) {
        parts.push(`\u65e5${minutesToHM(goals.dailyMinutes)}`);
    }
    return parts.length > 0 ? parts.join(' · ') : '\u672a\u8bbe\u76ee\u6807';
}

function renderProjectSelector() {
    const selector = document.getElementById('projectSelector');
    if (!selector) return;

    const settings = DB.getSettings();
    selector.innerHTML = settings.projects.map(project => {
        const goalSummary = formatProjectGoalSummary(project);
        return `
        <button class="project-tab ${project.id === settings.activeProjectId ? 'active' : ''}" onclick="switchProject('${project.id}')">
            <span class="project-tab-name">${escapeHTML(project.name)}</span>
            <small class="project-tab-mode">${getModeLabel(project.mode)}</small>
            <small class="project-tab-goal">${escapeHTML(goalSummary)}</small>
        </button>
    `;
    }).join('');
}

function switchProject(projectId) {
    DB.setActiveProject(projectId);
    renderProjectSelector();
    loadTodayInfo();
    updateStats();
    loadRecords();
    updateCalendar();
    if (currentTab === 'history') renderHistoryPage();
}

function updateHeaderDate() {
    const now = new Date();
    document.getElementById('currentDate').textContent = 
        `${formatDate(now)} ${getWeekday(now)}`;
}

// ===== 实时时钟 =====
function startClock() {
    function tick() {
        const now = new Date();
        document.getElementById('currentTime').textContent = formatTime(now);
    }
    tick();
    setInterval(tick, 1000);
}

// ===== 今日打卡信息 - 从 localStorage 读取 =====
function loadTodayInfo() {
    const now = new Date();
    const today = getToday();
    const project = DB.getActiveProject();
    
    document.getElementById('todayDate').textContent = today;
    document.getElementById('todayWeekday').textContent = getWeekday(now);

    // 从 localStorage 读取当前项目的今日记录；签到/签退项目优先展示跨天未签退记录
    let record = DB.getDayRecord(today);
    if (project.mode === 'range' && (!record || !record.signIn)) {
        const openRecordDate = findLatestOpenRecordDate(today);
        if (openRecordDate) {
            record = DB.getDayRecord(openRecordDate);
        }
    }
    updateTodayUI(record);
}

// ===== 更新今日打卡界面 =====
function updateTodayUI(record) {
    const signInBtn = document.getElementById('signInBtn');
    const signOutBtn = document.getElementById('signOutBtn');
    const todayRecord = document.getElementById('todayRecord');
    const statusEl = document.getElementById('userStatus');
    const project = DB.getActiveProject();
    const projectName = escapeHTML(project.name);
    const signInText = signInBtn.querySelector('span:last-child');
    const signOutText = signOutBtn.querySelector('span:last-child');
    signOutBtn.style.display = project.mode === 'single' ? 'none' : '';
    signInText.textContent = project.mode === 'single' ? '完成打卡' : '签到开始';
    signOutText.textContent = '签退结束';

    if (!record) {
        signInBtn.disabled = false;
        signOutBtn.disabled = true;
        statusEl.textContent = `${project.name} 今日未打卡`;
        statusEl.style.color = 'var(--warning)';
        todayRecord.innerHTML = `<div class="record-item"><span class="record-label">📌 ${projectName} 今日尚未打卡</span></div>`;
        return;
    }

    if (project.mode === 'single') {
        signInBtn.disabled = !!record.completedAt;
        signOutBtn.disabled = true;
        statusEl.textContent = record.completedAt ? `✅ ${project.name} 今日已完成` : `${project.name} 今日未打卡`;
        statusEl.style.color = record.completedAt ? 'var(--success)' : 'var(--warning)';
        todayRecord.innerHTML = record.completedAt
            ? `<div class="record-item"><span class="record-label">✅ 完成打卡</span><span class="record-time record-type-signin">${record.completedAt}</span></div>`
            : `<div class="record-item"><span class="record-label">📌 ${projectName} 今日尚未打卡</span></div>`;
        return;
    }

    // 检查是否有签到记录
    if (record.signIn) {
        signInBtn.disabled = true;  // 签到按钮禁用（已签到）
    }

    // 检查是否有签退记录
    if (record.signOut) {
        signOutBtn.disabled = true;  // 签退按钮禁用（已签退）
        statusEl.textContent = `✅ ${project.name} 今日已完成`;
        statusEl.style.color = 'var(--success)';
    } else if (record.signIn) {
        signOutBtn.disabled = false; // 已签到未签退 - 签退按钮可用
        statusEl.textContent = `✅ ${project.name} 已开始（未结束）`;
        statusEl.style.color = 'var(--success)';
    }

    // 显示今日的签到/签退时间
    let html = '';
    if (record.signIn) {
        const signInLabel = record.date !== getToday() ? `✅ 签到上班（${record.date}）` : '✅ 签到上班';
        html += `<div class="record-item">
            <span class="record-label">${signInLabel}</span>
            <span class="record-time record-type-signin">${record.signIn}</span>
        </div>`;
    }
    if (record.signOut) {
        const signOutDate = getSignOutDate(record);
        const signOutLabel = signOutDate !== record.date ? `🏁 签退下班（${signOutDate}）` : '🏁 签退下班';
        html += `<div class="record-item">
            <span class="record-label">${signOutLabel}</span>
            <span class="record-time record-type-signout">${record.signOut}</span>
        </div>`;
    }
    if (!html) {
        html = '<div class="record-item"><span class="record-label">📌 今日尚未打卡</span></div>';
    }
    todayRecord.innerHTML = html;
}

// ===== 签到操作（保存到 localStorage） =====
function signIn() {
    const today = getToday();
    const now = new Date();
    const time = formatTime(now);
    const project = DB.getActiveProject();

    if (project.mode === 'single') {
        let record = DB.getDayRecord(today);
        if (record && record.completedAt) {
            showToast(`${project.name} 今天已经打卡过了！`, '⚠️');
            return;
        }
        record = { date: today, completedAt: time };
        DB.setDayRecord(today, record);

        showToast(`${project.name} 打卡成功！${time}`, '✅');
        updateTodayUI(record);
        updateStats();
        loadRecords();
        updateCalendar();
        if (currentTab === 'history') renderHistoryPage();
        return;
    }

    const openRecordDate = findLatestOpenRecordDate(today);
    if (openRecordDate && openRecordDate !== today) {
        showToast(`请先签退 ${openRecordDate} 的记录！`, '⚠️');
        return;
    }

    let record = DB.getDayRecord(today);
    if (!record) {
        record = { date: today };
    }

    if (record.signIn) {
        showToast('今天已经签到过了！', '⚠️');
        return;
    }

    // 保存签到时间到 localStorage
    record.signIn = time;
    DB.setDayRecord(today, record);
    
    showToast(`${project.name} 开始成功！${time}`, '✅');
    updateTodayUI(record);
    updateStats();
    loadRecords();
    updateCalendar();
    if (currentTab === 'history') renderHistoryPage();
}

// ===== 签退操作（只有手动点击才能签退） =====
function signOut() {
    const today = getToday();
    const now = new Date();
    const time = formatTime(now);
    const project = DB.getActiveProject();

    if (project.mode === 'single') {
        showToast(`${project.name} 不需要签退`, '⚠️');
        return;
    }

    const recordDate = findLatestOpenRecordDate(today);
    let record = recordDate ? DB.getDayRecord(recordDate) : null;
    if (!record || !record.signIn) {
        showToast('请先签到！', '⚠️');
        return;
    }

    if (record.signOut) {
        showToast('今天已经签退过了！', '⚠️');
        return;
    }

    // 保存签退时间到 localStorage
    record.signOut = time;
    record.signOutDate = today;
    DB.setDayRecord(recordDate, record);
    
    showToast(`${project.name} 结束成功！${time}`, '🏁');
    loadTodayInfo();
    updateStats();
    loadRecords();
    updateCalendar();
    if (currentTab === 'history') renderHistoryPage();
}

// ===== 统计功能 =====
function updateStats() {
    const records = DB.getRecords();
    const project = DB.getActiveProject();
    const today = getToday();
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    
    const days = Object.keys(records).filter(date => isRecordStarted(records[date]));
    const totalDays = days.length;
    document.getElementById('totalDays').textContent = totalDays;

    const monthPrefix = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
    const monthDays = days.filter(d => d.startsWith(monthPrefix)).length;
    document.getElementById('monthDays').textContent = monthDays;

    const dayOfWeek = now.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() + mondayOffset);
    const weekStartStr = formatDate(weekStart);
    const weekDays = days.filter(d => d >= weekStartStr && d <= today).length;
    document.getElementById('thisWeek').textContent = weekDays;

    // 连续打卡（只统计有签到的天数）
    let consecutive = 0;
    const checkDate = new Date(now);
    while (true) {
        const dateStr = formatDate(checkDate);
        const record = records[dateStr];
        if (isRecordStarted(record)) {
            consecutive++;
            checkDate.setDate(checkDate.getDate() - 1);
        } else {
            break;
        }
    }
    document.getElementById('consecutiveDays').textContent = consecutive;
    document.querySelectorAll('#mainPage .stat-label')[0].textContent = `${project.name}总天数`;
    document.querySelectorAll('#mainPage .stat-label')[1].textContent = `${project.name}连续`;
    document.querySelectorAll('#mainPage .stat-label')[2].textContent = `${project.name}本月`;
    document.querySelectorAll('#mainPage .stat-label')[3].textContent = `${project.name}本周`;
}

// ===== 打卡记录列表 =====
function loadRecords() {
    const records = DB.getRecords();
    const project = DB.getActiveProject();
    const listEl = document.getElementById('recordsList');
    
    const sortedDays = Object.keys(records).filter(day => isRecordStarted(records[day])).sort().reverse();
    
    if (sortedDays.length === 0) {
        listEl.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📝</div>
                <div>暂无打卡记录</div>
                <div style="font-size:13px;margin-top:8px;">点击上方按钮开始${escapeHTML(project.name)}打卡吧！</div>
            </div>
        `;
        return;
    }

    const recentDays = sortedDays.slice(0, 20);
    let html = '';
    
    recentDays.forEach(day => {
        const record = records[day];
        if (!isRecordStarted(record)) return;

        const dateObj = new Date(day + 'T00:00:00');
        const weekday = getWeekday(dateObj);
        const displayDate = day + ' ' + weekday;
        
        let badge, badgeClass;
        if (project.mode === 'single') {
            badge = '已完成 ✓';
            badgeClass = 'badge-full';
        } else if (record.signIn && record.signOut) {
            badge = '已完成 ✓';
            badgeClass = 'badge-full';
        } else {
            badge = '未签退';
            badgeClass = 'badge-partial';
        }

        let workDuration = '';
        if (project.mode === 'range' && record.signIn && record.signOut) {
            const diffMinutes = getWorkDurationMinutes(record);
            if (diffMinutes > 0) {
                const hours = Math.floor(diffMinutes / 60);
                const mins = diffMinutes % 60;
                workDuration = ` ⏱ ${hours}小时${mins}分钟`;
            }
        }

        html += `
            <div class="record-card">
                <div>
                    <div class="record-date">${displayDate}</div>
                    <div class="record-times">
                        ${project.mode === 'single'
                            ? `<span class="in-time">完成 ${record.completedAt}</span>`
                            : `<span class="in-time">${record.signIn}</span>
                        ${record.signOut ? ` → <span class="out-time">${getSignOutDate(record) !== day ? `${getSignOutDate(record)} ` : ''}${record.signOut}</span>` : ''}`}
                        ${workDuration}
                    </div>
                </div>
                <span class="record-badge ${badgeClass}">${badge}</span>
            </div>
        `;
    });

    listEl.innerHTML = html;
}

// ===== 日历视图 =====
let calendarCurrentMonth = new Date();
let calendarVisible = true;

function toggleCalendar() {
    calendarVisible = !calendarVisible;
    const calendarEl = document.getElementById('calendarView');
    calendarEl.style.display = calendarVisible ? 'block' : 'none';
    if (calendarVisible) {
        renderCalendar();
    }
}

function changeMonth(delta) {
    calendarCurrentMonth.setMonth(calendarCurrentMonth.getMonth() + delta);
    renderCalendar();
}

function getCalendarRecordState(record) {
    if (!record || !isRecordStarted(record)) {
        return { className: '', label: '' };
    }
    if (isRecordCompleted(record)) {
        return { className: ' checked', label: '\u5df2' };
    }
    return { className: ' partial', label: '\u4e2d' };
}

function getHolidayName(dateStr) {
    return HOLIDAYS[dateStr] || '';
}

function isProjectRestDay(project, dateStr, dateObj) {
    const restDays = normalizeProjectRestDays(project.restDays);
    return restDays.weekly.includes(dateObj.getDay()) || restDays.dates.includes(dateStr);
}

function renderCalendar() {
    const year = calendarCurrentMonth.getFullYear();
    const month = calendarCurrentMonth.getMonth();
    
    document.getElementById('calendarMonthTitle').textContent = 
        `${year}年${month + 1}月`;

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = getToday();
    const records = DB.getRecords();
    const project = DB.getActiveProject();

    let html = '';
    
    for (let i = 0; i < firstDay; i++) {
        html += '<div class="calendar-day other-month"></div>';
    }

    for (let d = 1; d <= daysInMonth; d++) {
        const dateObj = new Date(year, month, d);
        const dateStr = formatDate(dateObj);
        let classes = 'calendar-day';
        let label = '';
        const holidayName = getHolidayName(dateStr);
        const isRestDay = isProjectRestDay(project, dateStr, dateObj);
        
        if (dateStr === today) {
            classes += ' today';
        }

        if (dateObj.getDay() === 0 || dateObj.getDay() === 6) {
            classes += ' weekend';
        }

        if (holidayName) {
            classes += ' holiday';
        }

        if (isRestDay) {
            classes += ' rest-day';
        }
        
        const record = records[dateStr];
        const recordState = getCalendarRecordState(record);
        classes += recordState.className;
        label = recordState.label;

        if (!label && holidayName) {
            label = '\u5047';
        } else if (!label && isRestDay) {
            label = '\u4f11';
        }

        if (!recordState.className && !holidayName && !isRestDay && dateStr < today) {
            classes += ' missed';
            label = '\u672a';
        }

        html += `<div class="${classes}">
            <span class="calendar-date-num">${d}</span>
            ${label ? `<span class="calendar-status-label">${label}</span>` : ''}
        </div>`;
    }

    document.getElementById('calendarDays').innerHTML = html;
}

function updateCalendar() {
    renderCalendar();
}

// ===== 统计页面 =====
function parseTimeToMinutes(timeStr) {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
}

function minutesToHM(minutes) {
    if (minutes <= 0) return '0小时';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}小时${m}分` : `${h}小时`;
}

function getRecordsWithDuration(projectId = DB.getActiveProjectId()) {
    const records = DB.getRecords(projectId);
    const result = [];
    Object.keys(records).forEach(date => {
        const r = records[date];
        if (!isRecordStarted(r)) return;
        let duration = 0;
        if (r.signIn && r.signOut) {
            duration = getWorkDurationMinutes(r);
        }
        result.push({ date, signIn: r.signIn, signOut: r.signOut, completedAt: r.completedAt, signOutDate: getSignOutDate(r), duration });
    });
    result.sort((a, b) => a.date.localeCompare(b.date));
    return result;
}

function getProjectSummary(project) {
    const records = getRecordsWithDuration(project.id);
    const completed = records.filter(r => r.completedAt || r.duration > 0 || (r.signIn && r.signOut));
    const totalMinutes = records.reduce((sum, r) => sum + Math.max(0, r.duration), 0);
    return {
        days: records.length,
        completed: completed.length,
        totalMinutes
    };
}

function getWeeklyData() {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(now);
    monday.setDate(now.getDate() + mondayOffset);
    const today = getToday();
    const records = DB.getRecords();
    const weekdays = ['一', '二', '三', '四', '五', '六', '日'];

    return weekdays.map((wd, i) => {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        const dateStr = formatDate(d);
        const record = records[dateStr];
        let duration = 0;
        let status = 'none';
        if (isRecordStarted(record)) {
            if (isRecordCompleted(record)) {
                duration = getWorkDurationMinutes(record);
                status = 'full';
            } else {
                status = 'partial';
            }
        }
        return {
            label: wd,
            date: dateStr,
            duration,
            status,
            isToday: dateStr === today
        };
    });
}

function renderWeeklyChart() {
    const container = document.getElementById('weeklyChart');
    const data = getWeeklyData();
    const hasData = data.some(d => d.status !== 'none');

    if (!hasData) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📝</div><div>本周暂无打卡记录</div></div>';
        return;
    }

    const maxDuration = Math.max(...data.map(d => d.duration), 1);
    const maxHeight = 120;

    let html = '<div class="bar-chart">';
    data.forEach(d => {
        const height = d.duration > 0 ? Math.max((d.duration / maxDuration) * maxHeight, 8) : 3;
        let barClass = 'bar-fill';
        if (d.status === 'none') barClass += ' zero';
        if (d.isToday) barClass += ' today-bar';

        const displayValue = d.duration > 0 ? minutesToHM(d.duration) : '';

        html += `
            <div class="bar-col">
                <div class="bar-value">${displayValue}</div>
                <div class="${barClass}" style="height:${height}px;"></div>
                <div class="bar-label">${d.label}</div>
            </div>`;
    });
    html += '</div>';
    container.innerHTML = html;
}

function getTrendData() {
    const records = DB.getRecords();
    const today = getToday();
    const data = [];

    for (let i = 29; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = formatDate(d);
        const record = records[dateStr];
        let status = 'missed';
        if (isRecordStarted(record)) {
            status = isRecordCompleted(record) ? 'full' : 'partial';
        }
        data.push({
            date: dateStr,
            status,
            isToday: dateStr === today,
            day: d.getDate()
        });
    }
    return data;
}

function renderTrendChart() {
    const container = document.getElementById('trendChart');
    const data = getTrendData();
    const hasData = data.some(d => d.status !== 'missed');

    if (!hasData) {
        container.classList.add('trend-chart-empty');
        container.innerHTML = '<div class="trend-empty-state">暂无打卡记录</div>';
        return;
    }

    container.classList.remove('trend-chart-empty');
    const maxHeight = 80;
    let html = '<div class="trend-chart">';

    // Show month markers
    let lastMonth = -1;
    data.forEach((d, i) => {
        const dObj = new Date(d.date + 'T00:00:00');
        const month = dObj.getMonth();
        const day = dObj.getDate();

        let dotClass = 'trend-dot';
        if (d.status === 'full') dotClass += ' filled';
        else if (d.status === 'partial') dotClass += ' filled';
        else dotClass += ' missed';
        if (d.isToday) dotClass += ' today-dot';

        const height = d.status === 'missed' ? 4 : d.status === 'full' ? maxHeight : maxHeight * 0.4;

        // Show month label on first day or every 5th day
        let monthLabel = '';
        if (month !== lastMonth || i === 0) {
            monthLabel = (month + 1) + '月';
            lastMonth = month;
        }

        html += `<div class="trend-col">
            <div class="${dotClass}" style="height:${height}px;" title="${d.date}: ${d.status === 'full' ? '已完成' : d.status === 'partial' ? '未签退' : '未打卡'}"></div>
            ${monthLabel ? `<div class="trend-month-label">${monthLabel}</div>` : ''}
        </div>`;
    });
    html += '</div>';
    container.innerHTML = html;
}

function getMonthlyBreakdown() {
    const allRecords = getRecordsWithDuration();
    const months = {};
    const today = getToday();
    const [thisYear, thisMonth] = today.split('-').map(Number);

    // Generate last 12 months
    for (let i = 11; i >= 0; i--) {
        const m = thisMonth - i;
        const y = thisYear + (m <= 0 ? Math.floor((m - 1) / 12) : 0);
        const month = ((m - 1) % 12 + 12) % 12 + 1;
        const key = `${y}-${String(month).padStart(2, '0')}`;
        months[key] = { days: 0, totalMinutes: 0, completed: 0 };
    }

    allRecords.forEach(r => {
        const key = r.date.substring(0, 7);
        if (months[key]) {
            months[key].days++;
            if (r.duration > 0) {
                months[key].totalMinutes += r.duration;
                months[key].completed++;
            }
        }
    });

    return Object.entries(months).map(([month, stats]) => ({
        month,
        label: month.replace('-', '年') + '月',
        days: stats.days,
        completed: stats.completed,
        totalHours: Math.round(stats.totalMinutes / 60)
    }));
}

function renderMonthlyTable() {
    const container = document.getElementById('monthlyTable');
    const data = getMonthlyBreakdown();
    const hasData = data.some(d => d.days > 0);

    if (!hasData) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📝</div><div>暂无打卡记录</div></div>';
        return;
    }

    const maxDays = Math.max(...data.map(d => d.days), 1);

    let html = '';
    data.forEach(d => {
        const barWidth = maxDays > 0 ? (d.days / maxDays) * 100 : 0;
        html += `
            <div class="month-row">
                <span class="month-name">${d.label}</span>
                <div class="month-bar-wrap">
                    <div class="month-bar-fill" style="width:${barWidth}%;"></div>
                </div>
                <span class="month-stats">${d.days}天 · ${d.totalHours}h</span>
            </div>`;
    });
    container.innerHTML = html;
}

function renderAverages() {
    const project = DB.getActiveProject();
    if (project.mode === 'single') {
        document.getElementById('avgSignIn').textContent = '--:--';
        document.getElementById('avgSignOut').textContent = '--:--';
        document.getElementById('avgDuration').textContent = '无时长';
        document.getElementById('earliestSignIn').textContent = '--:--';
        return;
    }

    const allRecords = getRecordsWithDuration();
    const completed = allRecords.filter(r => r.duration > 0);

    if (completed.length === 0) {
        document.getElementById('avgSignIn').textContent = '--:--';
        document.getElementById('avgSignOut').textContent = '--:--';
        document.getElementById('avgDuration').textContent = '--';
        document.getElementById('earliestSignIn').textContent = '--:--';
        return;
    }

    // Average sign-in time
    let totalInMin = 0;
    let totalOutMin = 0;
    let totalDuration = 0;
    let earliestInMin = Infinity;

    completed.forEach(r => {
        const inMin = parseTimeToMinutes(r.signIn);
        const outMin = parseTimeToMinutes(r.signOut);
        totalInMin += inMin;
        totalOutMin += outMin;
        totalDuration += r.duration;
        if (inMin < earliestInMin) earliestInMin = inMin;
    });

    const avgInMin = Math.round(totalInMin / completed.length);
    const avgOutMin = Math.round(totalOutMin / completed.length);
    const avgDurMin = Math.round(totalDuration / completed.length);
    const avgInH = String(Math.floor(avgInMin / 60)).padStart(2, '0');
    const avgInM = String(avgInMin % 60).padStart(2, '0');
    const avgOutH = String(Math.floor(avgOutMin / 60)).padStart(2, '0');
    const avgOutM = String(avgOutMin % 60).padStart(2, '0');
    const earlyH = String(Math.floor(earliestInMin / 60)).padStart(2, '0');
    const earlyM = String(earliestInMin % 60).padStart(2, '0');

    document.getElementById('avgSignIn').textContent = `${avgInH}:${avgInM}`;
    document.getElementById('avgSignOut').textContent = `${avgOutH}:${avgOutM}`;
    document.getElementById('avgDuration').textContent = minutesToHM(avgDurMin);
    document.getElementById('earliestSignIn').textContent = `${earlyH}:${earlyM}`;
}

function renderProjectStatsList() {
    const container = document.getElementById('projectStatsList');
    if (!container) return;

    const projects = DB.getProjects();
    container.innerHTML = projects.map(project => {
        const summary = getProjectSummary(project);
        return `
            <div class="project-stat-card">
                <div>
                    <div class="project-stat-name">${escapeHTML(project.name)}</div>
                    <div class="project-stat-mode">${getModeLabel(project.mode)}</div>
                </div>
                <div class="project-stat-values">
                    <span>${summary.days}天</span>
                    <span>${summary.completed}次完成</span>
                    ${project.mode === 'range' ? `<span>${minutesToHM(summary.totalMinutes)}</span>` : ''}
                </div>
            </div>
        `;
    }).join('');
}

function updateHistoryOverview() {
    const allRecords = getRecordsWithDuration();
    const project = DB.getActiveProject();
    const today = getToday();
    const now = new Date();

    // Total days
    const totalDays = allRecords.length;
    document.getElementById('hTotalDays').textContent = totalDays;

    // Longest consecutive streak
    let longestStreak = 0;
    let currentStreak = 0;
    const sortedDates = allRecords.map(r => r.date).sort();
    for (let i = 0; i < sortedDates.length; i++) {
        if (i === 0) {
            currentStreak = 1;
        } else {
            const prev = new Date(sortedDates[i - 1] + 'T00:00:00');
            const curr = new Date(sortedDates[i] + 'T00:00:00');
            const diffDays = Math.round((curr - prev) / (1000 * 60 * 60 * 24));
            if (diffDays === 1) {
                currentStreak++;
            } else {
                currentStreak = 1;
            }
        }
        if (currentStreak > longestStreak) longestStreak = currentStreak;
    }
    document.getElementById('hConsecutiveDays').textContent = longestStreak;

    // Total work hours
    const totalMinutes = allRecords.reduce((sum, r) => sum + Math.max(0, r.duration), 0);
    document.getElementById('hTotalHours').textContent = project.mode === 'single' ? '-' : Math.round(totalMinutes / 60) + 'h';

    // Completion rate (签退 / 签到)
    const withSignOut = allRecords.filter(r => r.completedAt || r.duration > 0 || (r.signIn && r.signOut)).length;
    const rate = totalDays > 0 ? Math.round((withSignOut / totalDays) * 100) + '%' : '-';
    document.getElementById('hCompletionRate').textContent = rate;

    // Also update main page stats
    updateStats();
}

function renderHistoryPage() {
    updateHistoryOverview();
    renderProjectStatsList();
    renderWeeklyChart();
    renderTrendChart();
    renderMonthlyTable();
    renderAverages();
}

// ===== 选项卡切换 =====
function showTab(tab, el) {
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    el.classList.add('active');
    currentTab = tab;

    const mainPage = document.getElementById('mainPage');
    const historyPage = document.getElementById('historyPage');

    if (tab === 'main') {
        mainPage.classList.add('active');
        historyPage.classList.remove('active');
    } else if (tab === 'history') {
        mainPage.classList.remove('active');
        historyPage.classList.add('active');
        renderHistoryPage();
    }
}

// ===== 设置页面 =====
function showSettings() {
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    
    // 查找设置按钮并激活
    document.querySelectorAll('.nav-item').forEach(item => {
        if (item.textContent.includes('设置')) item.classList.add('active');
    });
    
    // 显示设置弹窗
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:200;display:flex;align-items:center;justify-content:center;animation:fadeIn 0.2s ease;';
    
    const panel = document.createElement('div');
    panel.style.cssText = 'background:var(--card);border-radius:var(--radius);padding:24px;width:90%;max-width:380px;max-height:86vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);';
    
    panel.innerHTML = `
        <h3 style="margin-bottom:16px;font-size:18px;text-align:center;">⚙️ 设置</h3>
        <div class="settings-block">
            <div class="settings-block-title">项目管理</div>
            <div id="projectSettingsList"></div>
            <div class="project-form">
                <input type="text" id="newProjectName" placeholder="新项目名称" maxlength="12">
                <select id="newProjectMode">
                    <option value="range">签到/签退模式</option>
                    <option value="single">单次打卡模式</option>
                </select>
                <button onclick="addProject()">添加项目</button>
            </div>
        </div>
        <div style="border-top:1px solid var(--border);padding-top:16px;margin-bottom:12px;">
            <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;">
                <span style="font-size:15px;">🔔 打卡提醒</span>
                <label class="switch">
                    <input type="checkbox" ${DB.getSettings().remindEnabled ? 'checked' : ''} onchange="toggleRemind(this.checked)">
                    <span class="slider"></span>
                </label>
            </div>
        </div>
        <div style="border-top:1px solid var(--border);padding-top:16px;margin-bottom:12px;">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
                <button onclick="exportJSON()" style="padding:10px;border:none;border-radius:var(--radius-sm);background:var(--bg);color:var(--text);font-size:14px;cursor:pointer;">\u5bfc\u51fa JSON</button>
                <button onclick="exportCSV()" style="padding:10px;border:none;border-radius:var(--radius-sm);background:var(--bg);color:var(--text);font-size:14px;cursor:pointer;">\u5bfc\u51fa CSV</button>
            </div>
            <button onclick="importJSON()" style="width:100%;padding:10px;border:none;border-radius:var(--radius-sm);background:var(--primary);color:white;font-size:14px;font-weight:600;cursor:pointer;">\u5bfc\u5165 JSON</button>
            <input id="jsonImportInput" type="file" accept="application/json,.json" onchange="handleJSONImportFile(this)" style="display:none;">
        </div>
        <div style="border-top:1px solid var(--border);padding-top:16px;margin-bottom:8px;">
            <div style="font-size:13px;color:var(--danger);font-weight:700;margin-bottom:8px;">\u5371\u9669\u64cd\u4f5c</div>
        </div>
        <button onclick="clearAllRecords()" style="width:100%;padding:12px;border:2px solid #EF4444;border-radius:var(--radius-sm);background:rgba(239,68,68,0.08);color:#EF4444;font-size:15px;font-weight:600;cursor:pointer;margin-bottom:8px;">
            🗑️ 清空所有打卡记录
        </button>
        <button onclick="closeSettings()" style="width:100%;padding:12px;border:none;border-radius:var(--radius-sm);background:var(--bg);color:var(--text);font-size:15px;cursor:pointer;">
            关闭
        </button>
    `;
    
    overlay.appendChild(panel);
    overlay.onclick = function(e) { if (e.target === overlay) closeSettings(); };
    overlay.id = 'settingsOverlay';
    document.body.appendChild(overlay);
    renderProjectSettings();
}

function closeSettings() {
    const overlay = document.getElementById('settingsOverlay');
    if (overlay) overlay.remove();
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    // 恢复到当前活跃的标签页
    const navItems = document.querySelectorAll('.nav-item');
    const tabIndex = currentTab === 'history' ? 1 : 0;
    if (navItems[tabIndex]) navItems[tabIndex].classList.add('active');
}

function renderProjectSettings() {
    const list = document.getElementById('projectSettingsList');
    if (!list) return;

    const settings = DB.getSettings();
    list.innerHTML = settings.projects.map(project => `
        <div class="project-settings-row">
            <div>
                <div class="project-settings-name">${escapeHTML(project.name)}</div>
                <div class="project-settings-mode">${getModeLabel(project.mode)}</div>
            </div>
            <div class="project-settings-actions">
                <button onclick="showProjectGoalsDialog('${project.id}')">\u76ee\u6807\u8bbe\u7f6e</button>
                <button onclick="showProjectRestDaysDialog('${project.id}')">\u4f11\u606f\u65e5\u8bbe\u7f6e</button>
                <button onclick="renameProject('${project.id}')">重命名</button>
                <button onclick="deleteProject('${project.id}')">删除</button>
            </div>
        </div>
    `).join('');
}

function showProjectGoalsDialog(projectId) {
    if (document.getElementById('projectGoalsOverlay')) return;

    const settings = DB.getSettings();
    const project = settings.projects.find(p => p.id === projectId);
    if (!project) return;

    const goals = normalizeProjectGoals(project.goals);
    const dailyGoalField = project.mode === 'range' ? `
        <label class="goal-field">
            <span>\u6bcf\u65e5\u76ee\u6807\u65f6\u957f\uff08\u5206\u949f\uff09</span>
            <input type="number" id="goalDailyMinutes" min="0" max="1440" step="1" inputmode="numeric" value="${goals.dailyMinutes}">
        </label>
    ` : '';

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'projectGoalsOverlay';
    overlay.innerHTML = `
        <div class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="projectGoalsTitle">
            <h3 id="projectGoalsTitle">\u76ee\u6807\u8bbe\u7f6e</h3>
            <div class="goal-project-name">${escapeHTML(project.name)}</div>
            <div class="goal-form">
                <label class="goal-field">
                    <span>\u6bcf\u5468\u76ee\u6807\uff08\u5929\uff09</span>
                    <input type="number" id="goalWeeklyDays" min="0" max="7" step="1" inputmode="numeric" value="${goals.weeklyDays}">
                </label>
                <label class="goal-field">
                    <span>\u6bcf\u6708\u76ee\u6807\uff08\u5929\uff09</span>
                    <input type="number" id="goalMonthlyDays" min="0" max="31" step="1" inputmode="numeric" value="${goals.monthlyDays}">
                </label>
                ${dailyGoalField}
            </div>
            <div class="modal-actions">
                <button type="button" class="modal-secondary" onclick="closeProjectGoalsDialog()">\u53d6\u6d88</button>
                <button type="button" class="modal-primary" onclick="submitProjectGoalsDialog('${project.id}')">\u4fdd\u5b58</button>
            </div>
        </div>
    `;
    overlay.onclick = function(e) { if (e.target === overlay) closeProjectGoalsDialog(); };
    document.body.appendChild(overlay);
    document.getElementById('goalWeeklyDays').focus();
}

function closeProjectGoalsDialog() {
    const overlay = document.getElementById('projectGoalsOverlay');
    if (overlay) overlay.remove();
}

function submitProjectGoalsDialog(projectId) {
    const settings = DB.getSettings();
    const project = settings.projects.find(p => p.id === projectId);
    if (!project) return;

    const weeklyInput = document.getElementById('goalWeeklyDays');
    const monthlyInput = document.getElementById('goalMonthlyDays');
    const dailyInput = document.getElementById('goalDailyMinutes');
    project.goals = normalizeProjectGoals({
        weeklyDays: weeklyInput ? weeklyInput.value : 0,
        monthlyDays: monthlyInput ? monthlyInput.value : 0,
        dailyMinutes: project.mode === 'range' && dailyInput ? dailyInput.value : 0
    });

    DB.saveSettings(settings);
    closeProjectGoalsDialog();
    renderProjectSettings();
    renderProjectSelector();
    loadTodayInfo();
    updateStats();
    updateCalendar();
    if (currentTab === 'history') renderHistoryPage();
    showToast('\u76ee\u6807\u5df2\u4fdd\u5b58', '\u2705');
}

function renderRestDateList() {
    const list = document.getElementById('restDateList');
    if (!list) return;

    const dates = JSON.parse(list.dataset.dates || '[]').filter(isValidDateString).sort();
    list.dataset.dates = JSON.stringify(dates);
    if (dates.length === 0) {
        list.innerHTML = `<div class="rest-date-empty">\u6682\u65e0\u81ea\u5b9a\u4e49\u4f11\u606f\u65e5</div>`;
        return;
    }
    list.innerHTML = dates.map(date => `
        <div class="rest-date-row">
            <span>${escapeHTML(date)}</span>
            <button type="button" onclick="removeRestDate('${date}')">\u5220\u9664</button>
        </div>
    `).join('');
}

function addRestDate() {
    const input = document.getElementById('restDateInput');
    const list = document.getElementById('restDateList');
    if (!input || !list) return;

    const date = input.value;
    if (!isValidDateString(date)) {
        showToast('\u8bf7\u9009\u62e9\u6709\u6548\u65e5\u671f', '\u26a0\ufe0f');
        return;
    }

    const dates = JSON.parse(list.dataset.dates || '[]');
    if (!dates.includes(date)) {
        dates.push(date);
    }
    list.dataset.dates = JSON.stringify(dates);
    input.value = '';
    renderRestDateList();
}

function removeRestDate(date) {
    const list = document.getElementById('restDateList');
    if (!list || !isValidDateString(date)) return;

    const dates = JSON.parse(list.dataset.dates || '[]').filter(item => item !== date);
    list.dataset.dates = JSON.stringify(dates);
    renderRestDateList();
}

function showProjectRestDaysDialog(projectId) {
    if (document.getElementById('projectRestDaysOverlay')) return;

    const settings = DB.getSettings();
    const project = settings.projects.find(p => p.id === projectId);
    if (!project) return;

    const restDays = normalizeProjectRestDays(project.restDays);
    const weekLabels = ['\u5468\u65e5', '\u5468\u4e00', '\u5468\u4e8c', '\u5468\u4e09', '\u5468\u56db', '\u5468\u4e94', '\u5468\u516d'];
    const weeklyOptions = weekLabels.map((label, index) => `
        <label class="rest-weekday-option">
            <input type="checkbox" name="restWeeklyDay" value="${index}" ${restDays.weekly.includes(index) ? 'checked' : ''}>
            <span>${label}</span>
        </label>
    `).join('');

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'projectRestDaysOverlay';
    overlay.innerHTML = `
        <div class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="projectRestDaysTitle">
            <h3 id="projectRestDaysTitle">\u4f11\u606f\u65e5\u8bbe\u7f6e</h3>
            <div class="goal-project-name">${escapeHTML(project.name)}</div>
            <div class="rest-days-form">
                <div class="rest-days-title">\u6bcf\u5468\u56fa\u5b9a\u4f11\u606f\u65e5</div>
                <div class="rest-weekday-grid">${weeklyOptions}</div>
                <div class="rest-days-title">\u81ea\u5b9a\u4e49\u4f11\u606f\u65e5</div>
                <div class="rest-date-input-row">
                    <input type="date" id="restDateInput">
                    <button type="button" onclick="addRestDate()">\u6dfb\u52a0</button>
                </div>
                <div id="restDateList" class="rest-date-list" data-dates='${JSON.stringify(restDays.dates)}'></div>
            </div>
            <div class="modal-actions">
                <button type="button" class="modal-secondary" onclick="closeProjectRestDaysDialog()">\u53d6\u6d88</button>
                <button type="button" class="modal-primary" onclick="submitProjectRestDaysDialog('${project.id}')">\u4fdd\u5b58</button>
            </div>
        </div>
    `;
    overlay.onclick = function(e) { if (e.target === overlay) closeProjectRestDaysDialog(); };
    document.body.appendChild(overlay);
    renderRestDateList();
}

function closeProjectRestDaysDialog() {
    const overlay = document.getElementById('projectRestDaysOverlay');
    if (overlay) overlay.remove();
}

function submitProjectRestDaysDialog(projectId) {
    const settings = DB.getSettings();
    const project = settings.projects.find(p => p.id === projectId);
    if (!project) return;

    const weekly = Array.from(document.querySelectorAll('input[name="restWeeklyDay"]:checked')).map(input => input.value);
    const list = document.getElementById('restDateList');
    const dates = list ? JSON.parse(list.dataset.dates || '[]') : [];
    project.restDays = normalizeProjectRestDays({ weekly, dates });

    DB.saveSettings(settings);
    closeProjectRestDaysDialog();
    renderProjectSettings();
    renderProjectSelector();
    loadTodayInfo();
    updateStats();
    updateCalendar();
    if (currentTab === 'history') renderHistoryPage();
    showToast('\u4f11\u606f\u65e5\u5df2\u4fdd\u5b58', '\u2705');
}

function createProject(name, mode) {
    const settings = DB.getSettings();
    const project = {
        id: createProjectId(),
        name,
        mode,
        goals: { ...DEFAULT_PROJECT_GOALS },
        restDays: { ...DEFAULT_PROJECT_REST_DAYS }
    };
    settings.projects.push(project);
    settings.activeProjectId = project.id;
    DB.saveSettings(settings);
    return project;
}

function addProject() {
    const nameInput = document.getElementById('newProjectName');
    const modeSelect = document.getElementById('newProjectMode');
    const name = nameInput.value.trim();
    if (!name) {
        showToast('请输入项目名称', '⚠️');
        return;
    }

    createProject(name, modeSelect.value);
    updateCalendar();
    nameInput.value = '';
    renderProjectSettings();
    renderProjectSelector();
    loadTodayInfo();
    updateStats();
    loadRecords();
    showToast('项目已添加', '✅');
}

function finishAddProject(name, mode) {
    const project = createProject(name.trim().slice(0, 12), mode);
    renderProjectSelector();
    loadTodayInfo();
    updateStats();
    loadRecords();
    updateCalendar();
    if (currentTab === 'history') renderHistoryPage();
    showToast(`\u5df2\u6dfb\u52a0 ${project.name}`, '\u2705');
    return project;
}

function showAddProjectDialog() {
    if (document.getElementById('addProjectOverlay')) return;

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'addProjectOverlay';
    overlay.innerHTML = `
        <div class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="addProjectTitle">
            <h3 id="addProjectTitle">\u6dfb\u52a0\u6253\u5361\u9879\u76ee</h3>
            <div class="project-form">
                <input type="text" id="quickProjectName" placeholder="\u9879\u76ee\u540d\u79f0" maxlength="12">
                <select id="quickProjectMode">
                    <option value="range">\u7b7e\u5230/\u7b7e\u9000\u6a21\u5f0f</option>
                    <option value="single">\u5355\u6b21\u6253\u5361\u6a21\u5f0f</option>
                </select>
            </div>
            <div class="modal-actions">
                <button type="button" class="modal-secondary" onclick="closeAddProjectDialog()">\u53d6\u6d88</button>
                <button type="button" class="modal-primary" onclick="submitAddProjectDialog()">\u6dfb\u52a0</button>
            </div>
        </div>
    `;
    overlay.onclick = function(e) { if (e.target === overlay) closeAddProjectDialog(); };
    document.body.appendChild(overlay);
    document.getElementById('quickProjectName').focus();
}

function closeAddProjectDialog() {
    const overlay = document.getElementById('addProjectOverlay');
    if (overlay) overlay.remove();
}

function submitAddProjectDialog() {
    const nameInput = document.getElementById('quickProjectName');
    const modeSelect = document.getElementById('quickProjectMode');
    const name = nameInput.value.trim();
    if (!name) {
        showToast('\u8bf7\u8f93\u5165\u9879\u76ee\u540d\u79f0', '\u26a0\ufe0f');
        nameInput.focus();
        return;
    }

    finishAddProject(name, modeSelect.value);
    closeAddProjectDialog();
}
function renameProject(projectId) {
    const settings = DB.getSettings();
    const project = settings.projects.find(p => p.id === projectId);
    if (!project) return;

    const name = prompt('请输入新的项目名称', project.name);
    if (!name || !name.trim()) return;

    project.name = name.trim().slice(0, 12);
    DB.saveSettings(settings);
    renderProjectSettings();
    renderProjectSelector();
    loadTodayInfo();
    updateStats();
    loadRecords();
    if (currentTab === 'history') renderHistoryPage();
    showToast('项目已重命名', '✅');
}

function deleteProject(projectId) {
    const settings = DB.getSettings();
    if (settings.projects.length <= 1) {
        showToast('至少保留一个项目', '⚠️');
        return;
    }

    const project = settings.projects.find(p => p.id === projectId);
    if (!project) return;
    if (!confirm(`确定删除项目“${project.name}”吗？该项目记录也会删除。`)) return;

    settings.projects = settings.projects.filter(p => p.id !== projectId);
    if (settings.activeProjectId === projectId) {
        settings.activeProjectId = settings.projects[0].id;
    }
    DB.saveSettings(settings);

    const allRecords = DB.getAllRecords();
    delete allRecords[projectId];
    DB.saveAllRecords(allRecords);

    renderProjectSettings();
    renderProjectSelector();
    loadTodayInfo();
    updateStats();
    loadRecords();
    updateCalendar();
    if (currentTab === 'history') renderHistoryPage();
    showToast('项目已删除', '🗑️');
}

function clearStoredRecords() {
    safeStorageRemove(STORAGE_KEYS.records);
    refreshAllViews();
}

function clearAllRecords() {
    const message = '\u786e\u5b9a\u8981\u6e05\u7a7a\u6240\u6709\u6253\u5361\u8bb0\u5f55\u5417\uff1f\n\u6b64\u64cd\u4f5c\u4e0d\u53ef\u6062\u590d\uff0c\u4f46\u4e0d\u4f1a\u5220\u9664\u9879\u76ee\u914d\u7f6e\u3002';
    if (!confirm(message)) return;
    if (!confirm('\u518d\u6b21\u786e\u8ba4\uff1a\u6e05\u7a7a\u540e\u6240\u6709\u6253\u5361\u8bb0\u5f55\u90fd\u65e0\u6cd5\u6062\u590d\uff0c\u9879\u76ee\u914d\u7f6e\u4f1a\u4fdd\u7559\u3002')) return;
    clearStoredRecords();
    closeSettings();
    showToast('\u6240\u6709\u6253\u5361\u8bb0\u5f55\u5df2\u6e05\u7a7a', '\ud83d\uddd1\ufe0f');
}

function resetRecordsForTesting() {
    if (!confirm('\u786e\u5b9a\u6e05\u7a7a\u6240\u6709\u9879\u76ee\u7684\u6253\u5361\u8bb0\u5f55\uff0c\u4ece\u96f6\u5f00\u59cb\u6d4b\u8bd5\u5417\uff1f')) return;
    clearStoredRecords();
    showToast('\u8bb0\u5f55\u5df2\u6e05\u7a7a\uff0c\u53ef\u4ee5\u91cd\u65b0\u6d4b\u8bd5', '\ud83e\uddea');
}

// ===== Settings =====
function toggleRemind(enabled) {
    const settings = DB.getSettings();
    settings.remindEnabled = enabled;
    DB.saveSettings(settings);
    if (enabled) {
        showToast('\u6253\u5361\u63d0\u9192\u5df2\u5f00\u542f', '\ud83d\udd14');
        requestNotificationPermission();
    } else {
        showToast('\u6253\u5361\u63d0\u9192\u5df2\u5173\u95ed', '\ud83d\udd15');
    }
}

function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
}
function checkNewDay() {
    const lastCheck = safeStorageGet(STORAGE_KEYS.lastDate);
    const today = getToday();
    
    // 只有日期真的变了（过午夜），才刷新数据
    if (lastCheck !== null && lastCheck !== today) {
        safeStorageSet(STORAGE_KEYS.lastDate, today);
        loadTodayInfo();
        updateStats();
        loadRecords();
        updateCalendar();
    }
    
    // 首次使用，记录今天日期
    if (lastCheck === null) {
        safeStorageSet(STORAGE_KEYS.lastDate, today);
    }
}

// ===== 页面可见性变化时更新 =====
// 切回来时更新时间，但不重置打卡状态
document.addEventListener('visibilitychange', function() {
    if (!document.hidden) {
        updateHeaderDate();
        checkNewDay();
        const now = new Date();
        document.getElementById('currentTime').textContent = formatTime(now);
    }
});

// ===== 键盘事件 =====
document.getElementById('userNameInput').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        saveUserName();
    }
});

// ===== 启动应用 =====
document.addEventListener('DOMContentLoaded', function() {
    initApp();
    
    // 每分钟检查日期变更
    setInterval(checkNewDay, 60000);
    
    // 请求通知权限
    if ('Notification' in window && Notification.permission === 'default') {
        setTimeout(() => Notification.requestPermission(), 30000);
    }
});

// ===== 注册 Service Worker =====
if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
        navigator.serviceWorker.register('sw.js').then(function(registration) {
            console.log('ServiceWorker 注册成功:', registration.scope);
        }, function(err) {
            console.log('ServiceWorker 注册失败:', err);
        });
    });
}
