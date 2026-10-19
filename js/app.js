/**
 * 应用主逻辑：四个视图（待办 / 已办 / 备忘录 / 统计）的渲染与交互。
 * 数据读写全部通过 window.DB 落盘到本地 data.json，字段与数据文件保持一致。
 */

(() => {
  'use strict';

  // ---- 状态 ----
  const state = {
    data: null,
    view: 'todo',
    groupFilter: 'all',
    trendChart: null,
    priorityChart: null,
    weekChart: null,
  };

  // ---- DOM ----
  const $ = (id) => document.getElementById(id);
  const el = {
    authMask: $('auth-mask'),
    authMsg: $('auth-msg'),
    authBtn: $('auth-btn'),
    modal: $('modal'),
    modalTitle: $('modal-title'),
    modalBody: $('modal-body'),
    modalOk: $('modal-ok'),
    modalCancel: $('modal-cancel'),
    groupFilter: $('group-filter'),
    todoList: $('todo-list'),
    todoSummary: $('todo-summary'),
    doneList: $('done-list'),
    memoList: $('memo-list'),
    statDoneNum: $('stat-done-num'),
    statTodoNum: $('stat-todo-num'),
    statTotalNum: $('stat-total-num'),
    statGroups: $('stat-groups'),
    priorityChart: $('priority-chart'),
    weekChart: $('week-chart'),
    weekDiff: $('week-diff'),
    trendChart: $('trend-chart'),
  };

  // ---- 工具函数 ----
  // 优先级标签：普通(蓝)/紧急(红)；旧数据 high 视为紧急，medium/low 视为普通
  function priorityInfo(priority) {
    if (priority === 'urgent' || priority === 'high') return { text: '紧急', cls: 'tag-urgent' };
    return { text: '普通', cls: 'tag-normal' };
  }

  function uid(prefix) {
    return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function pad(n) { return String(n).padStart(2, '0'); }

  function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function addDaysStr(base, days) {
    const d = new Date(base + 'T00:00:00');
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function dateOf(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function isToday(ts) {
    return dateOf(ts) === todayStr();
  }

  function fmtTime(ts) {
    const d = new Date(ts);
    return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ---- 数据访问 ----
  async function save() {
    await DB.writeData(state.data);
  }

  function getGroup(id) {
    return state.data.groups.find((g) => g.id === id) || state.data.groups[0];
  }

  // ---- 待办条目渲染 ----
  function dueTagHtml(todo) {
    if (!todo.dueDate) return '';
    const today = todayStr();
    if (todo.dueDate < today) return `<span class="tag tag-due">已逾期 ${todo.dueDate}</span>`;
    if (todo.dueDate === today) return `<span class="tag tag-due">今天截止</span>`;
    if (todo.dueDate <= addDaysStr(today, 3)) return `<span class="tag tag-soon">${todo.dueDate} 截止</span>`;
    return `<span class="tag tag-time">${todo.dueDate} 截止</span>`;
  }

  function todoItemHtml(todo, doneView) {
    const group = getGroup(todo.groupId);
    const pri = priorityInfo(todo.priority);
    const doneCls = doneView ? ' done-item' : '';
    const checkBtn = doneView
      ? '<button class="todo-check" title="恢复待办" data-act="restore">&#10003;</button>'
      : '<button class="todo-check" title="完成" data-act="done"></button>';
    const actions = doneView
      ? `<button class="btn small ghost" data-act="restore">恢复</button>
         <button class="btn small ghost danger" data-act="del">删除</button>`
      : `<button class="btn small ghost" data-act="up" title="上移">↑</button>
         <button class="btn small ghost" data-act="down" title="下移">↓</button>
         <button class="btn small ghost" data-act="edit">编辑</button>
         <button class="btn small ghost danger" data-act="del">删除</button>`;
    const doneTime = doneView && todo.doneAt ? `<span class="tag tag-time">完成于 ${fmtTime(todo.doneAt)}</span>` : '';

    return `
      <div class="todo-item${doneCls}" data-id="${todo.id}">
        ${checkBtn}
        <div class="todo-body">
          <div class="todo-title">${escapeHtml(todo.title)}</div>
          ${todo.note ? `<div class="todo-note">${escapeHtml(todo.note)}</div>` : ''}
          <div class="todo-meta">
            <span class="tag tag-group">${escapeHtml(group.name)}</span>
            <span class="tag ${pri.cls}">${pri.text}</span>
            ${dueTagHtml(todo)}
            ${doneTime}
          </div>
        </div>
        <div class="todo-actions">${actions}</div>
      </div>`;
  }

  // ---- 视图渲染 ----
  function renderGroupFilter() {
    const opts = ['<option value="all">全部分组</option>']
      .concat(state.data.groups.map((g) => `<option value="${g.id}">${escapeHtml(g.name)}</option>`))
      .join('');
    el.groupFilter.innerHTML = opts;
    el.groupFilter.value = state.groupFilter;
  }

  function renderTodo() {
    renderGroupFilter();
    // 按 data.todos 数组顺序渲染（拖拽排序后数组顺序即显示顺序）
    const list = state.data.todos.filter((t) => !t.done)
      .filter((t) => state.groupFilter === 'all' || t.groupId === state.groupFilter);
    el.todoSummary.innerHTML = list.length
      ? `今天还剩 <b>${list.length}</b> 件待办，加油！`
      : '当前没有待办事项，休息一下吧';
    el.todoList.innerHTML = list.length
      ? list.map((t) => todoItemHtml(t, false)).join('')
      : '<div class="empty-tip">暂无待办，点击右上角"新建待办"开始记录</div>';
  }

  function renderDone() {
    const list = state.data.todos.filter((t) => t.done)
      .sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
    el.doneList.innerHTML = list.length
      ? list.map((t) => todoItemHtml(t, true)).join('')
      : '<div class="empty-tip">还没有完成的事项</div>';
  }

  // 备忘条目：只读文本区块（标题+内容），支持上移/下移/删除
  function memoItemHtml(memo) {
    return `
      <div class="memo-item" data-id="${memo.id}">
        <div class="memo-body">
          ${memo.title ? `<div class="memo-title">${escapeHtml(memo.title)}</div>` : ''}
          <div class="memo-content">${escapeHtml(memo.content)}</div>
          <div class="memo-time">记录于 ${fmtTime(memo.createdAt)}</div>
        </div>
        <div class="todo-actions">
          <button class="btn small ghost" data-act="up" title="上移">↑</button>
          <button class="btn small ghost" data-act="down" title="下移">↓</button>
          <button class="btn small ghost danger" data-act="del">删除</button>
        </div>
      </div>`;
  }

  // 备忘录按数组顺序渲染（排序由列表上的上移/下移按钮调整）
  function renderMemo() {
    el.memoList.innerHTML = state.data.memos.length
      ? state.data.memos.map(memoItemHtml).join('')
      : '<div class="empty-tip">备忘录是空的，在上方输入内容后点击保存即可记录</div>';
  }

  function renderStats() {
    const todos = state.data.todos;
    const doneToday = todos.filter((t) => t.done && isToday(t.doneAt)).length;
    const remain = todos.filter((t) => !t.done).length;
    const addedToday = todos.filter((t) => isToday(t.createdAt)).length;
    el.statDoneNum.textContent = doneToday;
    el.statTodoNum.textContent = remain;
    el.statTotalNum.textContent = addedToday;

    // 按项目统计今日完成与剩余待办
    const groupStats = state.data.groups.map((g) => {
      const gTodos = todos.filter((t) => t.groupId === g.id);
      return {
        name: g.name,
        done: gTodos.filter((t) => t.done && isToday(t.doneAt)).length,
        remain: gTodos.filter((t) => !t.done).length,
      };
    });
    el.statGroups.innerHTML = groupStats.map((s) => `
      <div class="stat-group-card">
        <div class="stat-group-name">${escapeHtml(s.name)}</div>
        <div class="stat-group-row">今日完成 <b style="color:var(--success)">${s.done}</b></div>
        <div class="stat-group-row">剩余待办 <b>${s.remain}</b></div>
      </div>`).join('');

    renderPriorityDist(todos);
    renderWeekSummary(todos);
    renderTrendChart(todos);
  }

  // 优先级分布：未完成待办里紧急/普通的占比（环形图）
  function renderPriorityDist(todos) {
    const pending = todos.filter((t) => !t.done);
    const urgent = pending.filter((t) => t.priority === 'urgent' || t.priority === 'high').length;
    const normal = pending.length - urgent;
    if (state.priorityChart) { state.priorityChart.destroy(); state.priorityChart = null; }
    state.priorityChart = new Chart(el.priorityChart, {
      type: 'doughnut',
      data: {
        labels: [`紧急 ${urgent}`, `普通 ${normal}`],
        datasets: [{
          data: [urgent, normal],
          backgroundColor: ['#e5484d', '#2f6fed'],
          borderWidth: 0,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '58%',
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 12 } } } },
      },
    });
  }

  // 本周小结：本周完成/新增数量对比柱状图，下方显示与上周的环比（周一为一周起点）
  function renderWeekSummary(todos) {
    const mondayTs = (weekOffset) => {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + weekOffset * 7);
      return d.getTime();
    };
    const thisMon = mondayTs(0);
    const lastMon = mondayTs(-1);
    const nextMon = mondayTs(1);
    const doneThis = todos.filter((t) => t.done && t.doneAt >= thisMon && t.doneAt < nextMon).length;
    const doneLast = todos.filter((t) => t.done && t.doneAt >= lastMon && t.doneAt < thisMon).length;
    const addedThis = todos.filter((t) => t.createdAt >= thisMon && t.createdAt < nextMon).length;
    const addedLast = todos.filter((t) => t.createdAt >= lastMon && t.createdAt < thisMon).length;

    if (state.weekChart) { state.weekChart.destroy(); state.weekChart = null; }
    state.weekChart = new Chart(el.weekChart, {
      type: 'bar',
      data: {
        labels: ['本周完成', '本周新增'],
        datasets: [{
          data: [doneThis, addedThis],
          backgroundColor: ['#2ecc71', '#f5a623'],
          borderRadius: 4,
          maxBarThickness: 48,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: true, ticks: { precision: 0 }, grid: { display: false } },
        },
      },
    });

    const diffSpan = (cur, prev) => {
      const d = cur - prev;
      if (d === 0) return '<span>持平</span>';
      return `<span class="${d > 0 ? 'up' : 'down'}">${d > 0 ? '↑' : '↓'}${Math.abs(d)}</span>`;
    };
    el.weekDiff.innerHTML = `较上周：完成 ${diffSpan(doneThis, doneLast)}　新增 ${diffSpan(addedThis, addedLast)}`;
  }

  function renderTrendChart(todos) {
    const labels = [];
    const counts = [];
    for (let i = 13; i >= 0; i--) {
      const day = addDaysStr(todayStr(), -i);
      labels.push(day.slice(5));
      counts.push(todos.filter((t) => t.done && dateOf(t.doneAt) === day).length);
    }
    if (state.trendChart) { state.trendChart.destroy(); state.trendChart = null; }
    state.trendChart = new Chart(el.trendChart, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: '完成数量',
          data: counts,
          backgroundColor: '#2f6fed',
          borderRadius: 4,
          maxBarThickness: 32,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: true, ticks: { precision: 0 }, grid: { display: false } },
        },
        plugins: { legend: { display: false } },
      },
    });
  }

  function renderAll() {
    renderTodo();
    renderDone();
    renderMemo();
    if (state.view === 'stats') renderStats();
  }

  // ---- 排序调整 ----
  // 把 list 中 itemId 项向上（dir=-1）或向下（dir=1）移动一位，越界时不操作
  function moveItem(list, itemId, dir) {
    const i = list.findIndex((x) => x.id === itemId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    const [item] = list.splice(i, 1);
    list.splice(j, 0, item);
  }

  // ---- 弹窗 ----
  function openModal(title, bodyHtml, okText, onOk) {
    el.modalTitle.textContent = title;
    el.modalBody.innerHTML = bodyHtml;
    el.modalOk.textContent = okText || '确定';
    el.modalOk.onclick = async () => {
      const keep = await onOk();
      if (keep !== false) closeModal();
    };
    el.modalCancel.onclick = closeModal;
    el.modal.classList.remove('hidden');
  }

  function closeModal() {
    el.modal.classList.add('hidden');
  }

  // ---- 待办表单 ----
  function openTodoForm(todo) {
    const isEdit = !!todo;
    const groupOptions = state.data.groups
      .map((g) => `<option value="${g.id}">${escapeHtml(g.name)}</option>`).join('');
    openModal(
      isEdit ? '编辑待办' : '新建待办',
      `<div class="form-group"><label>标题 *</label>
         <input id="f-title" type="text" maxlength="200" value="${escapeHtml(todo ? todo.title : '')}" placeholder="要做什么事情"></div>
       <div class="form-group"><label>备注</label>
         <textarea id="f-note" placeholder="补充说明（可选）">${escapeHtml(todo ? todo.note : '')}</textarea></div>
       <div class="form-row">
         <div class="form-group"><label>优先级</label>
           <select id="f-priority">
             <option value="normal">普通</option>
             <option value="urgent">紧急</option>
           </select></div>
         <div class="form-group"><label>所属项目</label>
           <select id="f-group">${groupOptions}</select></div>
       </div>`,
      '保存',
      () => {
        const title = $('f-title').value.trim();
        if (!title) { $('f-title').focus(); return false; }
        const payload = {
          title,
          note: $('f-note').value.trim(),
          priority: $('f-priority').value,
          groupId: $('f-group').value,
        };
        if (isEdit) {
          Object.assign(todo, payload);
        } else {
          state.data.todos.push({ id: uid('t_'), done: false, createdAt: Date.now(), doneAt: null, ...payload });
        }
        // 先刷新视图再落盘：新增/修改立即可见，不依赖写盘完成
        renderAll();
        save();
      }
    );
    // 回填选中值；旧数据 high 视为紧急，medium/low 视为普通
    if (todo) {
      $('f-priority').value = (todo.priority === 'urgent' || todo.priority === 'high') ? 'urgent' : 'normal';
      $('f-group').value = todo.groupId || state.data.groups[0].id;
    }
  }

  // ---- 分组管理 ----
  function openGroupManager() {
    const rows = state.data.groups.map((g, i) => `
      <div class="group-manage-row">
        ${g.builtin
          ? `<span class="group-name-input" style="display:inline-block;border-color:transparent;line-height:2.3">${escapeHtml(g.name)}（内置，不可删）</span>`
          : `<input class="group-name-input" value="${escapeHtml(g.name)}" data-gid="${g.id}">`}
        ${g.builtin ? '' : `
          <button class="btn small ghost danger" data-del-group="${g.id}">删除</button>`}
      </div>`).join('') +
      `<div class="group-manage-row">
        <input class="group-name-input" id="new-group-name" placeholder="新分组名称">
        <button class="btn small primary" id="add-group-btn">添加</button>
      </div>`;
    openModal(
      '分组管理',
      rows,
      '完成',
      () => {
        // 保存改名
        el.modalBody.querySelectorAll('.group-name-input[data-gid]').forEach((input) => {
          const g = state.data.groups.find((x) => x.id === input.dataset.gid);
          if (g && input.value.trim() && g.name !== input.value.trim()) g.name = input.value.trim();
        });
        renderAll();
        save();
      }
    );
    // 添加分组（同名分组不重复添加）
    $('add-group-btn').onclick = () => {
      const input = $('new-group-name');
      const name = input.value.trim();
      if (!name) return;
      if (state.data.groups.some((g) => g.name === name)) {
        input.value = '';
        return;
      }
      state.data.groups.push({ id: uid('g_'), name });
      input.value = '';
      openGroupManager();
      renderAll();
      save();
    };
    // 删除分组：该组待办归入默认分组
    el.modalBody.querySelectorAll('[data-del-group]').forEach((btn) => {
      btn.onclick = () => {
        const gid = btn.dataset.delGroup;
        state.data.todos.forEach((t) => { if (t.groupId === gid) t.groupId = state.data.groups[0].id; });
        state.data.groups = state.data.groups.filter((g) => g.id !== gid);
        renderAll();
        openGroupManager();
        save();
      };
    });
  }

  // ---- 备忘录（顶部固定输入区块，保存即新增） ----
  // 读取顶部输入框内容追加到备忘录列表末尾（重要的备忘保留在上方，新备忘排最后）并清空输入框；内容为空则不保存
  function saveNewMemo() {
    const title = $('memo-new-title').value.trim();
    const content = $('memo-new-content').value.trim();
    if (!content) return;
    state.data.memos.push({ id: uid('m_'), title, content, createdAt: Date.now() });
    $('memo-new-title').value = '';
    $('memo-new-content').value = '';
    renderMemo();
    save();
  }

  // ---- 左侧便签（全高，输入自动保存到 data.json 的 scratch 字段） ----
  let scratchTimer = null;

  // 把便签内容写入数据并落盘
  function saveScratch() {
    state.data.scratch = $('scratch-pad-input').value;
    save();
  }

  // 输入时防抖落盘，避免每次按键都写文件
  function scheduleSaveScratch() {
    clearTimeout(scratchTimer);
    scratchTimer = setTimeout(saveScratch, 400);
  }

  // 数据加载完成后回填便签内容
  function loadScratch() {
    $('scratch-pad-input').value = state.data.scratch || '';
  }

  // ---- 事件 ----
  function initEvents() {
    document.querySelectorAll('.tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        state.view = tab.dataset.view;
        document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
        $('view-' + state.view).classList.add('active');
        renderAll();
      });
    });

    $('add-todo-btn').addEventListener('click', () => openTodoForm(null));
    $('manage-groups-btn').addEventListener('click', openGroupManager);
    el.groupFilter.addEventListener('change', (e) => {
      state.groupFilter = e.target.value;
      renderTodo();
    });
    $('memo-save-btn').addEventListener('click', saveNewMemo);
    // 便签：输入即自动保存（防抖），失焦立即保存
    $('scratch-pad-input').addEventListener('input', scheduleSaveScratch);
    $('scratch-pad-input').addEventListener('blur', () => {
      clearTimeout(scratchTimer);
      saveScratch();
    });

    // 列表事件委托：待办/已办共用一个处理
    [el.todoList, el.doneList].forEach((box) => {
      box.addEventListener('click', (e) => {
        const item = e.target.closest('.todo-item');
        if (!item) return;
        const id = item.dataset.id;
        const todo = state.data.todos.find((t) => t.id === id);
        if (!todo) return;
        const act = e.target.closest('[data-act]') && e.target.closest('[data-act]').dataset.act;
        if (!act) return;
        // 先刷新视图再落盘，操作结果立即可见
        if (act === 'done') { todo.done = true; todo.doneAt = Date.now(); renderAll(); save(); }
        else if (act === 'restore') { todo.done = false; todo.doneAt = null; renderAll(); save(); }
        else if (act === 'up') { moveItem(state.data.todos, id, -1); renderAll(); save(); }
        else if (act === 'down') { moveItem(state.data.todos, id, 1); renderAll(); save(); }
        else if (act === 'edit') { openTodoForm(todo); }
        else if (act === 'del') { confirmDelete(() => { state.data.todos = state.data.todos.filter((t) => t.id !== id); renderAll(); save(); }); }
      });
    });

    el.memoList.addEventListener('click', (e) => {
      const actEl = e.target.closest('[data-act]');
      if (!actEl) return;
      const item = e.target.closest('.memo-item');
      const memo = item && state.data.memos.find((m) => m.id === item.dataset.id);
      if (!memo) return;
      const act = actEl.dataset.act;
      if (act === 'up') { moveItem(state.data.memos, memo.id, -1); renderMemo(); save(); }
      else if (act === 'down') { moveItem(state.data.memos, memo.id, 1); renderMemo(); save(); }
      else if (act === 'del') confirmDelete(() => { state.data.memos = state.data.memos.filter((m) => m.id !== memo.id); renderMemo(); save(); });
    });

    $('clear-done-btn').addEventListener('click', () => {
      confirmDelete(() => {
        state.data.todos = state.data.todos.filter((t) => !t.done);
        renderAll();
        save();
      });
    });

    el.authBtn.addEventListener('click', authorizeAndStart);
  }

  function confirmDelete(onOk) {
    openModal('确认删除', '<p style="color:var(--text-sub)">删除后不可恢复，确定继续吗？</p>', '删除', () => { onOk(); });
  }

  // ---- 授权与启动 ----
  // 用户点击"选择数据目录"按钮触发（带用户手势，可正常弹出系统目录选择框）
  async function authorizeAndStart() {
    try {
      state.data = await DB.readData();
      el.authMask.classList.add('hidden');
      renderAll();
      loadScratch();
    } catch (err) {
      el.authMsg.textContent = '未授权数据目录或读取失败，点击下方按钮重新选择（建议在浏览器弹窗中从"最近使用的文件夹"选择上次的目录）。';
    }
  }

  async function init() {
    initEvents();
    if (!DB.supported()) {
      el.authMsg.textContent = '当前浏览器不支持本地文件读写，请使用 Chrome 或 Edge 浏览器打开本页面。';
      el.authMask.classList.remove('hidden');
      return;
    }
    // 首次打开静默恢复上次授权的目录句柄；未授权过则停在遮罩等待用户点击
    const dir = await DB.restoreHandle();
    if (dir) {
      try {
        state.data = await DB.readWith(dir);
        el.authMask.classList.add('hidden');
        renderAll();
        loadScratch();
        return;
      } catch (err) { /* 读取失败则转入授权流程 */ }
    }
    el.authMask.classList.remove('hidden');
  }

  init();
})();
