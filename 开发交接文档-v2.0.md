# 每日打卡 v2.1 开发交接文档

本文档用于后续继续开发、重构或拆分模块。当前项目是一个纯前端 PWA，没有构建流程，主要由 `index.html`、`style.css`、`app.js`、`sw.js`、`manifest.json` 组成。

## 1. 项目定位

每日打卡 v2.1 是一个手机优先的多项目打卡 PWA。

当前能力：

- 单一用户。
- 多项目打卡。
- 项目独立记录。
- 两种打卡模式：
  - `range`：签到/签退模式，记录开始、结束和时长。
  - `single`：单次打卡模式，只记录完成时间。
- 默认项目：
  - `上班`：`range`
  - `健身`：`single`
- 首页添加项目，使用自定义弹窗选择项目名称和模式。
- 设置页管理项目，支持目标设置和休息日设置。
- 设置页支持导出 JSON、导出 CSV、导入 JSON。
- 日历默认展示，支持已完成、进行中、未打卡、休息日和节假日状态。
- 统计页按项目展示概览，并展示当前项目的详细统计。
- 旧版本全局记录自动归入 `上班` 项目。
- GitHub Pages 托管，手机可直接访问。

线上地址：

```text
https://dadaliu484-pixel.github.io/daily-checkin/
```

## 2. 文件结构

```text
D:\每日打卡
├── index.html              页面结构，包含首页、统计页、底部导航、基础挂载点
├── style.css               全部样式，移动端优先，含暗色模式
├── app.js                  核心业务逻辑、数据层、渲染、统计、设置弹窗
├── sw.js                   Service Worker 离线缓存
├── manifest.json           PWA 配置
├── icons/                  PWA 图标
├── 升级说明-v2.0.txt        面向用户/版本的升级说明
└── 开发交接文档-v2.0.md     当前文档
```

`.claude/` 是本地工具配置，已写入 `.gitignore`，不要提交。

## 3. 建议的模块框架

当前 `app.js` 是单文件脚本。后续如果项目继续变大，建议拆成以下模块：

```text
src/
├── storage.js        localStorage 封装、数据迁移、项目读写
├── projects.js       项目管理：新增、删除、重命名、模式约束
├── checkin.js        打卡动作：签到、签退、单次完成、跨天处理
├── stats.js          统计计算：连续、周、月、趋势、平均值
├── render-home.js    首页渲染：项目栏、今日状态、记录列表、日历
├── render-stats.js   统计页渲染：项目统计、图表、表格
├── settings.js       设置弹窗、提醒开关、项目管理 UI
├── utils.js          日期、时间、HTML 转义、Toast 等工具函数
└── app.js            初始化、事件入口、模块组装
```

拆分原则：

- `storage.js` 不碰 DOM，只负责数据读写和迁移。
- `stats.js` 不碰 DOM，只输入记录、输出统计结果。
- `render-*` 只负责把状态渲染到页面。
- `checkin.js` 只负责修改记录，不负责具体样式。
- 所有用户输入进入 HTML 前必须走转义。

## 4. 页面结构说明：index.html

### 4.1 顶部区域

关键节点：

- `#currentDate`：顶部日期。
- `.header-title`：应用标题。

由 `updateHeaderDate()` 更新。

### 4.2 首次设置页

关键节点：

- `#setupPage`：首次输入姓名页面。
- `#userNameInput`：用户姓名输入框。

相关函数：

- `initApp()`
- `saveUserName()`

说明：

- 当前仍保留用户名，只是不再支持多用户切换。
- 用户名保存在 `checkin_settings.name`。

### 4.3 首页主页面

关键节点：

- `#mainPage`：首页容器。
- `#displayName`：用户名显示。
- `#userStatus`：当前项目今日状态。
- `#projectSelector`：项目切换栏。
- `.project-selector-row`：项目切换栏和添加按钮外层。
- `.project-add-btn`：首页添加项目图标按钮。
- `#currentTime`：实时时钟。
- `#todayDate`：今日日期。
- `#todayWeekday`：星期。
- `#signInBtn`：签到/完成按钮。
- `#signOutBtn`：签退按钮。
- `#todayRecord`：今日记录展示。
- `#recordsList`：最近记录列表。
- `#calendarView` / `#calendarDays`：日历视图。

相关函数：

- `renderProjectSelector()`
- `switchProject(projectId)`
- `loadTodayInfo()`
- `updateTodayUI(record)`
- `signIn()`
- `signOut()`
- `updateStats()`
- `loadRecords()`
- `renderCalendar()`
- `showAddProjectDialog()`

### 4.4 统计页

关键节点：

- `#historyPage`：统计页容器。
- `#hTotalDays`：当前项目总打卡天数。
- `#hConsecutiveDays`：当前项目最长连续。
- `#hTotalHours`：当前项目累计时长。
- `#hCompletionRate`：当前项目完成率。
- `#projectStatsList`：全部项目汇总统计。
- `#weeklyChart`：本周图表。
- `#trendChart`：近 30 天趋势。
- `#monthlyTable`：月度统计。
- `#averagesGrid`：平均数据。

相关函数：

- `renderHistoryPage()`
- `updateHistoryOverview()`
- `renderProjectStatsList()`
- `renderWeeklyChart()`
- `renderTrendChart()`
- `renderMonthlyTable()`
- `renderAverages()`

### 4.5 底部导航

关键节点：

- 首页按钮：`showTab('main', this)`
- 统计按钮：`showTab('history', this)`
- 设置按钮：`showSettings()`

相关函数：

- `showTab(tab, el)`
- `showSettings()`
- `closeSettings()`

## 5. 样式结构说明：style.css

### 5.1 全局变量

`:root` 定义了核心设计 token：

- `--primary`
- `--success`
- `--warning`
- `--danger`
- `--bg`
- `--card`
- `--text`
- `--text-secondary`
- `--border`
- `--radius`

后续新增组件应优先复用这些变量。

### 5.2 主要样式区域

- 全局重置：`*`、`body`
- 顶部导航：`.header`
- 页面容器：`.page`
- 首次设置页：`.setup-container`
- 按钮：`.btn`、`.btn-primary`、`.btn-icon`、`.btn-text`
- 用户栏：`.user-bar`
- 打卡卡片：`.checkin-card`
- 项目切换：`.project-selector`、`.project-tab`
- 首页添加项目：`.project-selector-row`、`.project-add-btn`
- 通用弹窗：`.modal-overlay`、`.modal-panel`、`.modal-actions`
- 目标设置：`.goal-*`
- 休息日设置：`.rest-*`
- 统计卡片：`.stats-grid`、`.stat-card`
- 记录列表：`.records-list`、`.record-card`
- 日历：`.calendar-*`
- 底部导航：`.bottom-nav`
- Toast：`.toast`
- 设置页项目管理：`.settings-block`、`.project-settings-*`、`.project-form`
- 项目统计：`.project-stat-*`
- 图表：`.bar-chart`、`.trend-chart`、`.monthly-table`、`.averages-grid`
- 响应式：`@media (min-width: 768px)`
- 暗色模式：`@media (prefers-color-scheme: dark)`

### 5.3 后续样式建议

如果继续增加功能，建议把样式分组拆成：

```text
styles/
├── base.css
├── layout.css
├── home.css
├── projects.css
├── stats.css
├── settings.css
└── dark.css
```

## 6. 数据结构说明

所有数据当前保存在浏览器 `localStorage`。

### 6.1 设置：checkin_settings

示例：

```json
{
  "name": "用户",
  "remindEnabled": false,
  "remindTime": "08:00",
  "projects": [
    {
      "id": "work",
      "name": "上班",
      "mode": "range",
      "goals": {
        "weeklyDays": 5,
        "monthlyDays": 22,
        "dailyMinutes": 480
      },
      "restDays": {
        "weekly": [0, 6],
        "dates": ["2026-05-01"]
      }
    },
    {
      "id": "fitness",
      "name": "健身",
      "mode": "single"
    }
  ],
  "activeProjectId": "work"
}
```

字段说明：

- `name`：单一用户名称。
- `remindEnabled`：提醒开关，目前只保存状态，还没有真正定时提醒。
- `remindTime`：提醒时间，当前没有完整 UI 使用。
- `projects`：项目列表。
- `activeProjectId`：当前选中的项目。

项目字段：

- `id`：项目唯一标识。
- `name`：项目名称。
- `mode`：项目模式，只允许：
  - `range`
  - `single`
- `goals`：项目目标。
  - `weeklyDays`：每周目标天数，0-7。
  - `monthlyDays`：每月目标天数，0-31。
  - `dailyMinutes`：每日目标时长，0-1440；仅 `range` 项目展示。
- `restDays`：项目休息日。
  - `weekly`：每周固定休息日，0 表示周日，6 表示周六。
  - `dates`：自定义休息日期，格式为 `YYYY-MM-DD`。

### 6.2 打卡记录：checkin_records

v2.0 后的数据结构：

```json
{
  "work": {
    "2026-05-18": {
      "date": "2026-05-18",
      "signIn": "09:00:00",
      "signOut": "18:00:00",
      "signOutDate": "2026-05-18"
    }
  },
  "fitness": {
    "2026-05-18": {
      "date": "2026-05-18",
      "completedAt": "20:30:00"
    }
  }
}
```

`range` 模式记录：

- `date`：签到日期。
- `signIn`：开始时间。
- `signOut`：结束时间。
- `signOutDate`：结束日期。用于跨天签退。

`single` 模式记录：

- `date`：完成日期。
- `completedAt`：完成时间。

### 6.3 旧数据兼容

旧版本的 `checkin_records` 是这样的：

```json
{
  "2026-05-18": {
    "date": "2026-05-18",
    "signIn": "09:00:00"
  }
}
```

`DB.getAllRecords()` 会识别旧格式，并临时包装成：

```json
{
  "work": {
    "2026-05-18": {
      "date": "2026-05-18",
      "signIn": "09:00:00"
    }
  }
}
```

注意：当前是读取时兼容包装，不是单独执行一次迁移脚本。

## 7. app.js 模块详解

### 7.1 常量

#### `DEFAULT_PROJECTS`

默认项目：

- `work`：上班，`range`
- `fitness`：健身，`single`

#### `DEFAULT_PROJECT_GOALS`

默认项目目标：

- `weeklyDays`：0
- `monthlyDays`：0
- `dailyMinutes`：0

#### `DEFAULT_PROJECT_REST_DAYS`

默认项目休息日：

- `weekly`：空数组。
- `dates`：空数组。

#### `HOLIDAYS`

内置节假日映射，用于日历展示“假”状态。

当前只包含少量 2026 年示例日期，后续如需完整法定节假日，需要维护或接入数据源。

用于首次初始化或没有项目时补全。

### 7.2 数据层：DB

`DB` 是当前项目最核心的数据访问对象。

#### `DB.getRecords(projectId)`

读取某个项目的记录。

- 默认读取当前项目。
- 内部调用 `getAllRecords()`。

#### `DB.saveRecords(records, projectId)`

保存某个项目的记录。

- 不会覆盖其它项目。
- 会把全部项目记录重新写回 `localStorage.checkin_records`。

#### `DB.getAllRecords()`

读取全部项目记录。

职责：

- 从 `localStorage.checkin_records` 读取。
- 识别旧版全局记录。
- 旧版记录自动归入 `work`。

#### `DB.getSettings()`

读取设置。

职责：

- 返回默认设置。
- 标准化项目列表。
- 修复不存在的 `activeProjectId`。

#### `DB.saveSettings(settings)`

保存设置。

职责：

- 标准化项目列表。
- 确保当前项目有效。
- 写入 `localStorage.checkin_settings`。

#### `DB.normalizeProjects(projects)`

项目列表标准化。

规则：

- 没有项目时返回默认项目。
- 过滤无效项目。
- `mode` 只允许 `single`，否则一律按 `range`。

#### `DB.getProjects()`

返回项目列表。

#### `DB.getActiveProjectId()`

返回当前项目 id。

#### `DB.getActiveProject()`

返回当前项目对象。

#### `DB.setActiveProject(projectId)`

切换当前项目。

#### `DB.getDayRecord(dateStr, projectId)`

读取某项目某天记录。

#### `DB.setDayRecord(dateStr, record, projectId)`

写入某项目某天记录。

### 7.3 工具函数

#### `formatDate(date)`

格式化日期为：

```text
YYYY-MM-DD
```

#### `formatTime(date)`

格式化时间为：

```text
HH:mm:ss
```

#### `getWeekday(date)`

返回中文星期。

#### `getToday()`

返回今天日期字符串。

#### `getModeLabel(mode)`

把项目模式转换成中文：

- `single` -> `单次打卡`
- 其它 -> `签到/签退`

#### `escapeHTML(value)`

HTML 转义。

用途：

- 项目名来自用户输入，进入 `innerHTML` 前必须转义。

#### `createProjectId()`

生成项目 id：

```text
project_时间戳
```

#### `getSignOutDate(record)`

获取签退日期。

- 优先用 `record.signOutDate`。
- 旧数据没有该字段时回退到 `record.date`。

#### `getWorkDurationMinutes(record)`

计算 `range` 记录的时长，单位分钟。

特点：

- 支持跨天签退。
- 如果旧数据没有 `signOutDate`，但签退时间小于签到时间，会自动按次日计算。

#### `isRecordStarted(record)`

判断记录是否已经开始。

对两种模式兼容：

- `signIn`
- `completedAt`

#### `isRecordCompleted(record)`

判断记录是否完成。

对两种模式兼容：

- `signOut`
- `completedAt`

#### `findLatestOpenRecordDate(upToDateStr)`

查找最近一条已签到但未签退的 `range` 记录日期。

用途：

- 支持跨天签退。
- 防止上一条没结束时又开始新的 `range` 打卡。

### 7.4 Toast

#### `showToast(message, icon)`

展示居中提示。

安全点：

- 当前不再使用拼接 `innerHTML`。
- 使用 DOM 节点和 `textContent`，避免注入风险。

### 7.5 初始化和用户

#### `initApp()`

启动应用。

流程：

1. 读取设置。
2. 如果有用户名，进入主页面。
3. 渲染用户信息。
4. 渲染项目选择器。
5. 加载今日状态。
6. 更新统计。
7. 加载记录。
8. 启动时钟。
9. 如果没有用户名，显示首次设置页。

#### `saveUserName()`

保存首次输入的用户名。

#### `loadUserInfo()`

渲染用户名和头像。

头像使用姓名长度对 emoji 数组取模。

### 7.6 首页项目选择

#### `renderProjectSelector()`

渲染首页项目 tab。

每个项目展示：

- 项目名。
- 模式标签。

当前项目增加 `active` 样式。

#### `switchProject(projectId)`

切换项目。

切换后刷新：

- 项目栏。
- 今日状态。
- 首页统计。
- 记录列表。
- 日历。
- 如果当前在统计页，也刷新统计页。

### 7.7 时间显示

#### `updateHeaderDate()`

更新顶部日期。

#### `startClock()`

每秒更新首页大时钟。

注意：

- 当前函数每次调用都会 `setInterval`。
- 目前正常流程只在初始化后调用。
- 后续如果允许重新初始化主页面，需要避免重复定时器。

### 7.8 今日状态

#### `loadTodayInfo()`

加载当前项目今日记录。

逻辑：

- `single`：只看今天。
- `range`：如果今天没开始，会查找最近未签退记录，用于跨天签退。

#### `updateTodayUI(record)`

根据当前项目模式更新按钮和今日记录。

`single` 模式：

- 只显示 `完成打卡` 按钮。
- 隐藏签退按钮。
- 已完成后按钮禁用。

`range` 模式：

- 显示 `签到开始` 和 `签退结束`。
- 已签到后禁用开始按钮。
- 未签退时启用结束按钮。
- 已签退后两个按钮都不可继续操作。

### 7.9 打卡动作

#### `signIn()`

按钮入口函数，按项目模式分流。

`single` 模式：

1. 检查今天是否已经 `completedAt`。
2. 未完成则写入：

```json
{
  "date": "YYYY-MM-DD",
  "completedAt": "HH:mm:ss"
}
```

`range` 模式：

1. 检查是否有跨天未签退记录。
2. 如果有，提示先签退。
3. 如果今天已签到，提示不可重复。
4. 写入：

```json
{
  "date": "YYYY-MM-DD",
  "signIn": "HH:mm:ss"
}
```

#### `signOut()`

签退入口函数。

`single` 模式：

- 不需要签退，直接提示。

`range` 模式：

1. 查找最近未签退记录。
2. 没有则提示先签到。
3. 已签退则提示不可重复。
4. 写入：

```json
{
  "signOut": "HH:mm:ss",
  "signOutDate": "YYYY-MM-DD"
}
```

完成后刷新今日状态、统计、记录、日历。

### 7.10 首页统计

#### `updateStats()`

更新首页四个统计卡片。

当前统计跟随当前项目：

- 总天数。
- 连续天数。
- 本月天数。
- 本周天数。

本周起始日统一为周一。

### 7.11 记录列表

#### `loadRecords()`

渲染最近 20 条记录。

兼容两种模式：

- `single`：显示完成时间。
- `range`：显示开始、结束和时长。

### 7.12 日历

全局状态：

- `calendarCurrentMonth`
- `calendarVisible`

#### `toggleCalendar()`

显示/隐藏日历。

#### `changeMonth(delta)`

切换月份。

#### `renderCalendar()`

按当前项目渲染月历。

状态：

- 今天：`today`
- 已完成：`checked`
- 已开始未完成：`partial`
- 过去未打卡：`missed`
- 每周或自定义休息日：`rest-day`
- 内置节假日：`holiday`
- 周末：`weekend`

日历单元会显示短标签：

- `已`：完成。
- `中`：进行中。
- `未`：过去日期未打卡。
- `休`：项目休息日。
- `假`：内置节假日。

#### `updateCalendar()`

如果日历可见，则重新渲染。

### 7.13 基础统计函数

#### `parseTimeToMinutes(timeStr)`

把 `HH:mm:ss` 转为分钟。

#### `minutesToHM(minutes)`

把分钟转为中文时长。

示例：

- `60` -> `1小时`
- `90` -> `1小时30分`

#### `getRecordsWithDuration(projectId)`

返回某项目的记录数组，并补充 `duration`。

数组项示例：

```json
{
  "date": "2026-05-18",
  "signIn": "09:00:00",
  "signOut": "18:00:00",
  "completedAt": null,
  "signOutDate": "2026-05-18",
  "duration": 540
}
```

#### `getProjectSummary(project)`

计算单个项目汇总：

- `days`
- `completed`
- `totalMinutes`

### 7.14 周统计

#### `getWeeklyData()`

生成当前周 7 天数据。

当前周以周一开始。

#### `renderWeeklyChart()`

渲染本周柱状图。

说明：

- 对 `single` 项目，`duration` 为 0，但完成状态仍可显示。
- 如果后续要更适配 `single`，建议改成完成次数图，而不是工时图。

### 7.15 趋势统计

#### `getTrendData()`

生成近 30 天状态：

- `full`
- `partial`
- `missed`

#### `renderTrendChart()`

渲染近 30 天趋势。

之前的空状态图标有错位问题，目前已改成纯文本空状态。

### 7.16 月度统计

#### `getMonthlyBreakdown()`

生成最近 12 个月统计。

字段：

- `month`
- `label`
- `days`
- `completed`
- `totalHours`

#### `renderMonthlyTable()`

渲染月度条形表格。

### 7.17 平均数据

#### `renderAverages()`

`range` 项目：

- 平均签到。
- 平均签退。
- 平均工时。
- 最早签到。

`single` 项目：

- 显示无时长，不计算平均签退和工时。

### 7.18 统计页总渲染

#### `renderProjectStatsList()`

渲染所有项目的概览统计。

每个项目显示：

- 名称。
- 模式。
- 天数。
- 完成次数。
- 时长，仅 `range` 显示。

#### `updateHistoryOverview()`

更新当前项目概览卡片。

#### `renderHistoryPage()`

统计页总入口。

调用：

- `updateHistoryOverview()`
- `renderProjectStatsList()`
- `renderWeeklyChart()`
- `renderTrendChart()`
- `renderMonthlyTable()`
- `renderAverages()`

### 7.19 页面切换

#### `showTab(tab, el)`

底部导航切换。

支持：

- `main`
- `history`

进入统计页时会刷新统计数据。

### 7.20 设置弹窗

#### `showSettings()`

创建设置弹窗。

包含：

- 项目管理。
- 打卡提醒开关。
- 清空所有打卡记录。
- 关闭按钮。

注意：

- 当前设置弹窗使用 JS 动态创建 HTML。
- 后续建议改成固定 HTML 模板，减少字符串拼接。

#### `closeSettings()`

关闭设置弹窗，并恢复底部导航激活态。

#### `renderProjectSettings()`

渲染设置里的项目列表。

每个项目支持：

- 重命名。
- 删除。

### 7.21 项目管理

#### `createProject(name, mode)`

创建项目。

行为：

- 新项目加入 `settings.projects`。
- 自动切换为当前项目。
- 模式创建后不提供修改入口。

#### `addProject()`

设置页添加项目。

读取：

- `#newProjectName`
- `#newProjectMode`

添加后刷新：

- 设置页列表。
- 首页项目栏。
- 今日状态。
- 统计。
- 记录列表。

#### `showAddProjectDialog()`

首页添加项目。

当前实现：

- 使用自定义弹窗输入项目名称。
- 使用下拉框选择模式：
  - `range`：签到/签退。
  - `single`：单次打卡。
- 通过 `submitAddProjectDialog()` 提交，内部调用 `finishAddProject()`。

后续建议：

- 模式选择改为按钮或分段控件。

#### `showProjectGoalsDialog(projectId)`

设置页目标设置弹窗。

支持：

- 每周目标天数。
- 每月目标天数。
- 每日目标时长，仅 `range` 项目展示。

输入会经过 `normalizeProjectGoals()` 限制范围。

#### `showProjectRestDaysDialog(projectId)`

设置页休息日设置弹窗。

支持：

- 每周固定休息日。
- 自定义休息日期。

保存后会刷新设置页、项目栏、首页统计、日历和统计页。

#### `renameProject(projectId)`

重命名项目。

注意：

- 只改项目名。
- 不改项目 id。
- 不影响已有记录。

#### `deleteProject(projectId)`

删除项目。

行为：

- 至少保留一个项目。
- 删除项目配置。
- 删除该项目记录。
- 如果删除的是当前项目，自动切换到第一个项目。

### 7.22 清空记录

#### `clearAllRecords()`

设置页清空所有记录。

二次确认。

#### `resetRecordsForTesting()`

首页测试按钮。

行为：

- 一次确认。
- 清空 `checkin_records`。
- 保留项目配置。
- 刷新首页和统计。

### 7.23 提醒相关

#### `toggleRemind(enabled)`

保存提醒开关。

#### `requestNotificationPermission()`

请求浏览器通知权限。

当前限制：

- 尚未实现真正定时提醒。
- 电脑或手机关机时不会后台运行。
- 如果要做可靠提醒，需要后端、系统通知或移动端能力。

### 7.24 跨天处理

#### `checkNewDay()`

每分钟检查日期是否变化。

日期变化后刷新：

- 今日状态。
- 统计。
- 记录。
- 日历。

配合：

- `visibilitychange`
- 页面重新可见时也会检查。

### 7.25 启动逻辑

页面加载后：

1. `DOMContentLoaded`
2. `initApp()`
3. 每分钟 `checkNewDay()`
4. 延迟请求通知权限

Service Worker：

- 页面 `load` 后注册 `sw.js`。

## 8. Service Worker：sw.js

### 8.1 缓存名称

当前：

```js
const CACHE_NAME = 'checkin-cache-v12';
```

每次改动线上资源后，建议升级缓存名。

### 8.2 缓存资源

`ASSETS` 包含：

- `./`
- `./index.html`
- `./style.css`
- `./app.js`
- `./manifest.json`
- 图标文件

### 8.3 生命周期

#### install

- 打开缓存。
- 缓存静态资源。
- `self.skipWaiting()`。

#### activate

- 删除旧缓存。

#### fetch

策略：

- GET 请求才处理。
- 命中缓存时先返回缓存。
- 静态资源会后台尝试更新缓存。
- 未命中缓存时走网络。
- 导航失败时回退 `index.html`。

### 8.4 后续建议

- 增加版本更新提示。
- 激活后使用 `clients.claim()`。
- 对 HTML 使用网络优先，减少旧页面残留。
- 对 CSS/JS 使用带版本号的文件名或 query 参数。

## 9. manifest.json

PWA 配置。

关键字段：

- `name`
- `short_name`
- `start_url`
- `display: standalone`
- `theme_color`
- `icons`

后续如果要更像手机 App，可补充：

- `screenshots`
- `categories`
- 更完整的 maskable 图标。

## 10. 当前已知限制

1. 数据只存在浏览器本地。
   - 换手机、清缓存、换浏览器会丢数据。
   - 当前已有 JSON/CSV 导出和 JSON 导入。
   - 如果要多设备共享，仍建议后续做云同步。

2. 没有真正后台运行。
   - 手机/电脑关机时不会运行。
   - GitHub Pages 只负责托管网页，不负责后台任务。

3. 提醒功能还不完整。
   - 目前只是保存开关和请求通知权限。
   - 没有按项目、按时间真正推送提醒。

4. 内置节假日不完整。
   - 当前 `HOLIDAYS` 只维护了少量 2026 年示例日期。
   - 如果日历要长期可靠展示节假日，需要补全数据或接入节假日数据源。

5. `app.js` 过大。
   - 当前超过千行。
   - 建议按第 3 节的模块框架拆分。

6. `innerHTML` 仍有多处用于渲染模板。
   - 项目名已做 `escapeHTML`。
   - 后续新增用户输入字段时必须继续转义。
   - 更彻底的方案是统一改成 DOM API 或模板渲染函数。

7. 统计图对 `single` 项目还不够语义化。
   - 当前复用 `range` 的图表结构。
   - 后续可以为单次打卡项目单独展示完成次数、完成时间分布等。

## 11. 后续开发路线建议

### 11.1 v2.1：当前已完成

- 首页添加项目改成自定义弹窗。
- 增加项目目标设置。
- 增加项目休息日设置。
- 日历默认展示并支持休息日、节假日、未打卡状态。
- 增加 JSON/CSV 导出和 JSON 导入。

### 11.2 v2.2：体验和统计优化

- 设置页项目管理从字符串模板改成固定 DOM。
- 项目删除增加更明确的危险态。
- 单次打卡项目的统计图单独优化。
- 目标达成率统计。
- 完整节假日数据维护。
- 自动备份提醒。

### 11.3 v3.0：云同步

- 增加账号系统。
- 接入 Supabase / Firebase / 自建后端。
- 多设备同步。
- 手机和电脑共享数据。

### 11.4 v3.1：提醒系统

- 每个项目单独设置提醒。
- 支持工作日、每天、每周。
- 结合浏览器通知或后端推送。

### 11.5 v4.0：应用工程化

- 引入构建工具。
- 拆分模块。
- 增加测试。
- 增加版本化发布流程。

## 12. 开发注意事项

1. 不要随便修改项目 id。
   - 记录是按项目 id 存储的。
   - 改 id 会导致旧记录找不到。

2. 项目模式创建后不要改。
   - `range` 和 `single` 记录结构不同。
   - 如果未来要支持改模式，需要写迁移逻辑。

3. 修改缓存资源后记得升级 `CACHE_NAME`。
   - 否则手机可能继续使用旧 JS/CSS。

4. 所有用户输入进入 HTML 前必须转义。
   - 当前使用 `escapeHTML()`。

5. 不要提交 `.claude/`。
   - 它是本地工具配置。

6. 手机测试时如果页面不更新：
   - 强制刷新。
   - 关闭页面重开。
   - 必要时清理站点数据。

## 13. 当前 Git 状态

v2.0 曾作为交接版本打标签；当前工作区已进入 v2.1 文档状态，发布时再确认是否补打新标签：

```text
v2.0（历史标签）
```

当前线上主要功能已上传到 GitHub Pages。

推荐后续每次完成一个功能后：

```text
git add 相关文件
git commit -m "简短说明"
git push origin master
```

如果是版本发布：

```text
git tag -a v2.x -m "Version 2.x"
git push origin v2.x
```
