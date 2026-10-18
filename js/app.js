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
    statDue: $('stat-due'),
    trendChart: $('trend-chart'),
  };

  // ---- 工具函数 ----
  const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };
  const PRIORITY_TEXT = { high: '高', medium: '中', low: '低' };

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

  // 待办排序：优先级高→低，同优先级按创建时间
  function sortByPriority(list) {
    return [...list].sort((a, b) => {
      const pa = PRIORITY_ORDER[a.priority] != null ? PRIORITY_ORDER[a.priority] : 1;
      const pb = PRIORITY_ORDER[b.priority] != null ? PRIORITY_ORDER[b.priority] : 1;
      return pa !== pb ? pa - pb : a.createdAt - b.createdAt;
    });
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
    const priorityCls = todo.priority ? `tag-${todo.priority}` : 'tag-low';
    const doneCls = doneView ? ' done-item' : '';
    const checkBtn = doneView
      ? '<button class="todo-check" title="恢复待办" data-act="restore">&#10003;</button>'
      : '<button class="todo-check" title="完成" data-act="done"></button>';
    const actions = doneView
      ? `<button class="btn small ghost" data-act="restore">恢复</button>
         <button class="btn small ghost danger" data-act="del">删除</button>`
      : `<button class="btn small ghost" data-act="edit">编辑</button>
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
            <span class="tag ${priorityCls}">${PRIORITY_TEXT[todo.priority] || '中'}优先级</span>
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
    const list = state.data.todos.filter((t) => !t.done)
      .filter((t) => state.groupFilter === 'all' || t.groupId === state.groupFilter);
    el.todoSummary.innerHTML = list.length
      ? `今天还剩 <b>${list.length}</b> 件待办，加油！`
      : '当前没有待办事项，休息一下吧';
    el.todoList.innerHTML = list.length
      ? sortByPriority(list).map((t) => todoItemHtml(t, false)).join('')
      : '<div class="empty-tip">暂无待办，点击右上角"新建待办"开始记录</div>';
  }

  function renderDone() {
    const list = state.data.todos.filter((t) => t.done)
      .sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
    el.doneList.innerHTML = list.length
      ? list.map((t) => todoItemHtml(t, true)).join('')
      : '<div class="empty-tip">还没有完成的事项</div>';
  }

  function renderMemo() {
    const list = [...state.data.memos].sort((a, b) => b.createdAt - a.createdAt);
    el.memoList.innerHTML = list.length
      ? list.map((m) => `
          <div class="memo-item" data-id="${m.id}">
            <div class="memo-content">
              <div>${escapeHtml(m.content)}</div>
              <div class="memo-time">记录于 ${fmtTime(m.createdAt)}</div>
            </div>
            <div class="todo-actions">
              <button class="btn small ghost" data-act="edit">编辑</button>
              <button class="btn small ghost danger" data-act="del">删除</button>
            </div>
          </div>`).join('')
      : '<div class="empty-tip">备忘录是空的，点击右上角"新增备忘"记录重要信息</div>';
  }

  function renderStats() {
    const todos = state.data.todos;
    const doneToday = todos.filter((t) => t.done && isToday(t.doneAt)).length;
    const remain = todos.filter((t) => !t.done).length;
    const addedToday = todos.filter((t) => isToday(t.createdAt)).length;
    el.statDoneNum.textContent = doneToday;
    el.statTodoNum.textContent = remain;
    el.statTotalNum.textContent = addedToday;

    // 按项目统计（今日）
    const today = todayStr();
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

    // 近期待办（3 天内或已逾期）
    const near = sortByPriority(todos.filter((t) => {
      if (t.done || !t.dueDate) return false;
      return t.dueDate <= addDaysStr(today, 3);
    }));
    el.statDue.innerHTML = near.length
      ? near.map((t) => todoItemHtml(t, false)).join('')
      : '<div class="empty-tip">近期没有临期或逾期的事项</div>';

    renderTrendChart(todos);
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
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
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
             <option value="high">高</option>
             <option value="medium">中</option>
             <option value="low">低</option>
           </select></div>
         <div class="form-group"><label>所属项目</label>
           <select id="f-group">${groupOptions}</select></div>
       </div>
       <div class="form-group"><label>截止日期（可选）</label>
         <input id="f-due" type="date" value="${todo && todo.dueDate ? todo.dueDate : ''}"></div>`,
      '保存',
      () => {
        const title = $('f-title').value.trim();
        if (!title) { $('f-title').focus(); return false; }
        const payload = {
          title,
          note: $('f-note').value.trim(),
          priority: $('f-priority').value,
          groupId: $('f-group').value,
          dueDate: $('f-due').value || null,
        };
        if (isEdit) {
          Object.assign(todo, payload);
        } else {
          state.data.todos.push({ id: uid('t_'), done: false, createdAt: Date.now(), doneAt: null, ...payload });
        }
        save().then(() => renderAll());
      }
    );
    // 回填选中值
    if (todo) {
      $('f-priority').value = todo.priority || 'medium';
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
      async () => {
        // 保存改名
        el.modalBody.querySelectorAll('.group-name-input[data-gid]').forEach((input) => {
          const g = state.data.groups.find((x) => x.id === input.dataset.gid);
          if (g && input.value.trim() && g.name !== input.value.trim()) g.name = input.value.trim();
        });
        await save();
        renderAll();
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
      save().then(() => {
        openGroupManager();
        renderAll();
      });
    };
    // 删除分组：该组待办归入默认分组
    el.modalBody.querySelectorAll('[data-del-group]').forEach((btn) => {
      btn.onclick = async () => {
        const gid = btn.dataset.delGroup;
        state.data.todos.forEach((t) => { if (t.groupId === gid) t.groupId = state.data.groups[0].id; });
        state.data.groups = state.data.groups.filter((g) => g.id !== gid);
        await save();
        renderAll();
        openGroupManager();
      };
    });
  }

  // ---- 备忘录 ----
  function openMemoForm(memo) {
    const isEdit = !!memo;
    openModal(
      isEdit ? '编辑备忘' : '新增备忘',
      `<div class="form-group"><label>内容</label>
         <textarea id="f-memo" style="min-height:140px" placeholder="网址、账号、密码、注意事项……">${escapeHtml(memo ? memo.content : '')}</textarea></div>`,
      '保存',
      () => {
        const content = $('f-memo').value.trim();
        if (!content) return false;
        if (isEdit) {
          memo.content = content;
        } else {
          state.data.memos.push({ id: uid('m_'), content, createdAt: Date.now() });
        }
        save().then(() => renderMemo());
      }
    );
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
    $('add-memo-btn').addEventListener('click', () => openMemoForm(null));

    // 列表事件委托：待办/已办/统计近期待办共用一个处理
    [el.todoList, el.doneList, el.statDue].forEach((box) => {
      box.addEventListener('click', (e) => {
        const item = e.target.closest('.todo-item');
        if (!item) return;
        const id = item.dataset.id;
        const todo = state.data.todos.find((t) => t.id === id);
        if (!todo) return;
        const act = e.target.closest('[data-act]') && e.target.closest('[data-act]').dataset.act;
        if (!act) return;
        if (act === 'done') { todo.done = true; todo.doneAt = Date.now(); save().then(() => renderAll()); }
        else if (act === 'restore') { todo.done = false; todo.doneAt = null; save().then(() => renderAll()); }
        else if (act === 'edit') { openTodoForm(todo); }
        else if (act === 'del') { confirmDelete(() => { state.data.todos = state.data.todos.filter((t) => t.id !== id); save().then(() => renderAll()); }); }
      });
    });

    el.memoList.addEventListener('click', (e) => {
      const item = e.target.closest('.memo-item');
      if (!item) return;
      const id = item.dataset.id;
      const memo = state.data.memos.find((m) => m.id === id);
      if (!memo) return;
      const act = e.target.closest('[data-act]') && e.target.closest('[data-act]').dataset.act;
      if (act === 'edit') openMemoForm(memo);
      else if (act === 'del') confirmDelete(() => { state.data.memos = state.data.memos.filter((m) => m.id !== id); save().then(() => renderMemo()); });
    });

    $('clear-done-btn').addEventListener('click', () => {
      confirmDelete(() => {
        state.data.todos = state.data.todos.filter((t) => !t.done);
        save().then(() => renderAll());
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
        return;
      } catch (err) { /* 读取失败则转入授权流程 */ }
    }
    el.authMask.classList.remove('hidden');
  }

  init();
})();
