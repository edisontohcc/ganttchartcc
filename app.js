let tasks = [];
let taskId = 1;
let collapsedTasks = new Set();
let editingTask = null;
let addingTask = null;
let isResizing = false;
let maxEndYear = new Date().getFullYear() + 20; // Track the maximum year currently rendered
let isRenderingGantt = false; // Prevent infinite re-render loops

const taskListContainer = document.getElementById('taskListContainer');
const ganttContainer = document.getElementById('ganttContainer');
const parentTask = document.getElementById('parentTask');
const dependency = document.getElementById('dependency');

// Icons (using Unicode symbols for simplicity)
const ICONS = {
  folder: '📁',
  list: '📋',
  expand: '▶',
  collapse: '▼'
};

// Initialize resize functionality
function initializeResize() {
  const resizeHandle = document.getElementById('resizeHandle');
  const ganttLeft = document.querySelector('.gantt-left');
  const ganttWrapper = document.querySelector('.gantt-wrapper');
  
  if (!resizeHandle || !ganttLeft || !ganttWrapper) return;
  
  resizeHandle.addEventListener('mousedown', (e) => {
    isResizing = true;
    resizeHandle.classList.add('resizing');
    document.body.style.cursor = 'col-resize';
    e.preventDefault();
  });
  
  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    
    const rect = ganttWrapper.getBoundingClientRect();
    const newWidth = e.clientX - rect.left;
    
    // Set min and max width constraints
    const minWidth = 300;
    const maxWidth = Math.min(800, rect.width * 0.7);
    
    if (newWidth >= minWidth && newWidth <= maxWidth) {
      ganttLeft.style.width = newWidth + 'px';
    }
  });
  
  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      resizeHandle.classList.remove('resizing');
      document.body.style.cursor = '';
    }
  });
}

function renderTaskList() {
  taskListContainer.innerHTML = '';
  
  // Group tasks by hierarchy
  const rootTasks = tasks.filter(t => !t.parent);
  
  rootTasks.forEach(task => {
    renderTaskItem(task, 0);
    if (!collapsedTasks.has(task.id)) {
      renderSubTasks(task.id, 1);
    }
  });
}

function renderSubTasks(parentId, level) {
  const subTasks = tasks.filter(t => t.parent === parentId);
  subTasks.forEach(task => {
    renderTaskItem(task, level);
    if (!collapsedTasks.has(task.id)) {
      renderSubTasks(task.id, level + 1);
    }
  });
}

function renderTaskItem(task, level) {
  const div = document.createElement('div');
  div.className = `task-item ${level === 0 ? 'parent' : 'sub'} level-${Math.min(level, 3)}`;
  div.dataset.taskId = task.id;
  
  const hasChildren = tasks.some(t => t.parent === task.id);
  const isCollapsed = collapsedTasks.has(task.id);
  
  if (editingTask === task.id) {
    div.innerHTML = createEditForm(task, level);
  } else {
    div.innerHTML = `
      ${hasChildren ? 
        `<span class="task-expand" onclick="toggleCollapse(${task.id})">${isCollapsed ? ICONS.expand : ICONS.collapse}</span>` : 
        '<span class="task-expand"></span>'
      }
      <span class="task-icon">${level === 0 ? ICONS.folder : ICONS.list}</span>
      <span class="task-name" onclick="editTaskName(${task.id})">${task.name}</span>
      <div class="task-dates" onclick="editTaskDates(${task.id})">
        ${formatDate(task.start)} - ${formatDate(task.end)}
      </div>
      <div class="task-actions">
        <button class="task-action-btn" onclick="addSubTask(${task.id})" title="Add Sub-task">+</button>
        <button class="task-action-btn" onclick="deleteTask(${task.id})" title="Delete">×</button>
      </div>
    `;
  }
  
  taskListContainer.appendChild(div);
  
  // Calculate and apply dynamic height based on content
  setTimeout(() => {
    adjustTaskRowHeight(div, task.id);
  }, 0);
}

function adjustTaskRowHeight(taskElement, taskId) {
  const taskNameElement = taskElement.querySelector('.task-name');
  if (!taskNameElement) return;
  
  // Create a temporary element to measure text height
  const tempDiv = document.createElement('div');
  tempDiv.style.position = 'absolute';
  tempDiv.style.visibility = 'hidden';
  tempDiv.style.width = taskNameElement.offsetWidth + 'px';
  tempDiv.style.fontSize = window.getComputedStyle(taskNameElement).fontSize;
  tempDiv.style.fontFamily = window.getComputedStyle(taskNameElement).fontFamily;
  tempDiv.style.lineHeight = window.getComputedStyle(taskNameElement).lineHeight;
  tempDiv.style.wordWrap = 'break-word';
  tempDiv.textContent = taskNameElement.textContent;
  
  document.body.appendChild(tempDiv);
  const textHeight = tempDiv.offsetHeight;
  document.body.removeChild(tempDiv);
  
  // Calculate required height (minimum 60px, plus padding)
  const minHeight = 60;
  const padding = 16; // 8px top + 8px bottom
  const requiredHeight = Math.max(minHeight, textHeight + padding + 8);
  
  const currentHeight = parseInt(taskElement.dataset.rowHeight || 60);
  
  // Only update if height has changed significantly
  if (Math.abs(currentHeight - requiredHeight) > 5) {
    taskElement.style.height = requiredHeight + 'px';
    taskElement.dataset.rowHeight = requiredHeight;
    
    // Debounced gantt re-render to update bar positions
    clearTimeout(window.ganttRenderTimeout);
    window.ganttRenderTimeout = setTimeout(() => {
      renderGantt();
    }, 100);
  }
}

function getTaskRowHeights() {
  const heights = {};
  const taskElements = document.querySelectorAll('.task-item[data-task-id]');
  
  taskElements.forEach(element => {
    const taskId = element.dataset.taskId;
    const height = element.dataset.rowHeight || 60;
    heights[taskId] = parseInt(height);
  });
  
  return heights;
}

function createEditForm(task, level) {
  return `
    <span class="task-expand"></span>
    <span class="task-icon">${level === 0 ? ICONS.folder : ICONS.list}</span>
    <div class="task-form-inline">
      <input type="text" class="task-name-input" value="${task.name}" id="editName">
      <div class="date-editor">
        <input type="date" class="date-input" value="${task.start}" id="editStart">
        <input type="date" class="date-input" value="${task.end}" id="editEnd">
      </div>
      <div class="task-form-buttons">
        <button class="btn-save" onclick="saveTask(${task.id})">✓</button>
        <button class="btn-cancel" onclick="cancelEdit()">×</button>
      </div>
    </div>
  `;
}

function createAddForm(parentId, level) {
  return `
    <span class="task-expand"></span>
    <span class="task-icon">${level === 0 ? ICONS.folder : ICONS.list}</span>
    <div class="task-form-content-inline">
      <input type="text" class="task-name-input-inline" placeholder="Enter task name..." id="newTaskName">
      <div class="date-inputs-inline">
        <input type="date" class="date-input-inline" id="newTaskStart" value="${getDefaultStartDate()}" title="Start Date">
        <input type="date" class="date-input-inline" id="newTaskEnd" value="${getDefaultEndDate()}" title="End Date">
      </div>
      <div class="task-form-buttons-inline">
        <button class="btn-save-inline" onclick="saveNewTask(${parentId || 'null'})">✓</button>
        <button class="btn-cancel-inline" onclick="cancelAdd()">×</button>
      </div>
    </div>
  `;
}

function getDefaultStartDate() {
  const today = new Date();
  return today.toISOString().split('T')[0];
}

function getDefaultEndDate() {
  const today = new Date();
  today.setDate(today.getDate() + 7); // Default 1 week duration
  return today.toISOString().split('T')[0];
}

function formatDate(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
}

function toggleCollapse(taskId) {
  if (collapsedTasks.has(taskId)) {
    collapsedTasks.delete(taskId);
  } else {
    collapsedTasks.add(taskId);
  }
  renderTaskList();
  renderGantt();
}

function editTaskName(taskId) {
  if (editingTask || addingTask) return;
  editingTask = taskId;
  renderTaskList();
  document.getElementById('editName').focus();
}

function editTaskDates(taskId) {
  if (editingTask || addingTask) return;
  editingTask = taskId;
  renderTaskList();
  document.getElementById('editStart').focus();
}

function saveTask(taskId) {
  const name = document.getElementById('editName').value.trim();
  const start = document.getElementById('editStart').value;
  const end = document.getElementById('editEnd').value;
  
  if (!name || !start || !end) {
    alert('Please fill in all fields');
    return;
  }
  
  if (new Date(start) > new Date(end)) {
    alert('Start date must be before end date');
    return;
  }
  
  const task = tasks.find(t => t.id === taskId);
  if (task) {
    task.name = name;
    task.start = start;
    task.end = end;
  }
  
  editingTask = null;
  renderTaskList();
  renderGantt();
}

function cancelEdit() {
  editingTask = null;
  renderTaskList();
}

function addSubTask(parentId) {
  if (editingTask || addingTask) return;
  addingTask = { parentId };
  
  // Insert form after the parent task
  const parentElement = document.querySelector(`[data-task-id="${parentId}"]`);
  const formDiv = document.createElement('div');
  formDiv.className = 'task-item sub level-1';
  formDiv.innerHTML = createAddForm(parentId, 1);
  
  parentElement.parentNode.insertBefore(formDiv, parentElement.nextSibling);
  
  // Focus on the textarea and scroll it into view
  setTimeout(() => {
    const textarea = document.getElementById('newTaskName');
    if (textarea) {
      textarea.focus();
      textarea.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, 100);
}

function addNewTask() {
  if (editingTask || addingTask) return;
  addingTask = { parentId: null };
  
  const formDiv = document.createElement('div');
  formDiv.className = 'task-item parent level-0';
  formDiv.innerHTML = createAddForm(null, 0);
  
  taskListContainer.appendChild(formDiv);
  
  // Focus on the textarea and scroll it into view
  setTimeout(() => {
    const textarea = document.getElementById('newTaskName');
    if (textarea) {
      textarea.focus();
      textarea.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, 100);
}

function saveNewTask(parentId) {
  const name = document.getElementById('newTaskName').value.trim();
  const start = document.getElementById('newTaskStart').value;
  const end = document.getElementById('newTaskEnd').value;
  
  if (!name || !start || !end) {
    alert('Please fill in all fields');
    return;
  }
  
  if (new Date(start) > new Date(end)) {
    alert('Start date must be before end date');
    return;
  }
  
  tasks.push({
    id: taskId++,
    name,
    parent: parentId,
    dependsOn: null,
    start,
    end
  });
  
  addingTask = null;
  renderTaskList();
  renderGantt();
}

function cancelAdd() {
  addingTask = null;
  renderTaskList();
}

function deleteTask(taskId) {
  if (!confirm('Are you sure you want to delete this task? All sub-tasks will also be deleted.')) {
    return;
  }
  
  // Remove task and all its children recursively
  function removeTaskAndChildren(id) {
    tasks = tasks.filter(t => t.id !== id);
    const children = tasks.filter(t => t.parent === id);
    children.forEach(child => removeTaskAndChildren(child.id));
  }
  
  removeTaskAndChildren(taskId);
  renderTaskList();
  renderGantt();
}

function getVisibleTasks() {
  return tasks.filter(task => {
    if (!task.parent) return true; // Root tasks always visible
    
    // Check if any parent in the hierarchy is collapsed
    let currentParent = task.parent;
    while (currentParent) {
      if (collapsedTasks.has(currentParent)) return false;
      const parentTask = tasks.find(t => t.id === currentParent);
      currentParent = parentTask ? parentTask.parent : null;
    }
    return true;
  });
}

function getQuarterlyRange() {
  const currentYear = new Date().getFullYear();
  
  if (!tasks.length) {
    // Show extensive year range by default (use maxEndYear)
    const startYear = currentYear;
    const endYear = maxEndYear;
    return { 
      start: new Date(startYear, 0, 1), 
      end: new Date(endYear, 11, 31), 
      quarters: generateQuarters(startYear, endYear)
    };
  }
  
  const startDate = new Date(Math.min(...tasks.map(t => new Date(t.start))));
  const endDate = new Date(Math.max(...tasks.map(t => new Date(t.end))));
  
  // Extend range significantly to provide "infinity" years
  const taskStartYear = startDate.getFullYear();
  const taskEndYear = endDate.getFullYear();
  
  // Start from earlier of current year or earliest task year
  const startYear = Math.min(currentYear, taskStartYear);
  
  // End at the maximum of task end year + buffer or our tracked max year
  const endYear = Math.max(maxEndYear, taskEndYear + 15);
  
  // Update maxEndYear if we've extended beyond it
  if (endYear > maxEndYear) {
    maxEndYear = endYear;
  }
  
  return { 
    quarters: generateQuarters(startYear, endYear), 
    startDate: new Date(startYear, 0, 1), 
    endDate: new Date(endYear, 11, 31)
  };
}

function generateQuarters(startYear, endYear) {
  const quarters = [];
  
  // Generate quarters for the extended year range
  for (let year = startYear; year <= endYear; year++) {
    for (let q = 0; q < 4; q++) {
      quarters.push({
        year,
        quarter: q + 1,
        startMonth: q * 3,
        label: `Q${q + 1}`,
        startDate: new Date(year, q * 3, 1),
        endDate: new Date(year, q * 3 + 3, 0)
      });
    }
  }
  
  return quarters;
}

function renderGantt() {
  if (isRenderingGantt) return;
  isRenderingGantt = true;
  
  ganttContainer.innerHTML = '';
  
  const visibleTasks = getVisibleTasks();
  const { quarters } = getQuarterlyRange();
  const quarterWidth = 80; // Reduced from 120px to make quarters more narrow
  const baseRowHeight = 60; // Match task item height (timeline header height)
  const taskAreaTop = 60; // Timeline header height
  
  // Set container dimensions to use full available space
  const ganttRight = document.querySelector('.gantt-right');
  const containerHeight = ganttRight ? ganttRight.clientHeight : window.innerHeight - 100;
  
  // Calculate total height needed based on actual task row heights
  const rowHeights = getTaskRowHeights();
  const totalTasksHeight = visibleTasks.reduce((total, task) => {
    return total + (rowHeights[task.id] || baseRowHeight);
  }, 0);
  
  ganttContainer.style.width = (quarters.length * quarterWidth + 20) + 'px';
  ganttContainer.style.minHeight = '100%';
  ganttContainer.style.height = Math.max(containerHeight, totalTasksHeight + taskAreaTop + 20) + 'px';
  
  // Render timeline
  renderTimeline(quarters, quarterWidth);
  
  // Render today line
  renderTodayLine(quarters, quarterWidth, taskAreaTop, Math.max(containerHeight - taskAreaTop, totalTasksHeight));
  
  // Render task bars
  renderTaskBars(visibleTasks, quarters, quarterWidth, baseRowHeight, taskAreaTop);
  
  // Add scroll listener for infinite scrolling
  setupInfiniteScroll(quarters, quarterWidth);
  
  isRenderingGantt = false;
}

function renderTimeline(quarters, quarterWidth) {
  const timeline = document.createElement('div');
  timeline.className = 'gantt-timeline';
  
  // Group quarters by year
  const yearGroups = {};
  quarters.forEach(q => {
    if (!yearGroups[q.year]) yearGroups[q.year] = [];
    yearGroups[q.year].push(q);
  });
  
  let currentX = 0;
  Object.entries(yearGroups).forEach(([year, yearQuarters]) => {
    // Year header
    const yearHeader = document.createElement('div');
    yearHeader.className = 'gantt-year-header';
    yearHeader.style.left = currentX + 'px';
    yearHeader.style.width = (yearQuarters.length * quarterWidth) + 'px';
    yearHeader.textContent = year;
    timeline.appendChild(yearHeader);
    
    // Quarter headers
    yearQuarters.forEach(quarter => {
      const quarterHeader = document.createElement('div');
      quarterHeader.className = 'gantt-quarter-header';
      quarterHeader.style.left = currentX + 'px';
      quarterHeader.style.width = quarterWidth + 'px';
      quarterHeader.textContent = quarter.label;
      timeline.appendChild(quarterHeader);
      currentX += quarterWidth;
    });
  });
  
  ganttContainer.appendChild(timeline);
}

function renderTodayLine(quarters, quarterWidth, taskAreaTop, chartHeight) {
  const today = new Date();
  let todayX = 0;
  
  for (let i = 0; i < quarters.length; i++) {
    const quarter = quarters[i];
    if (today >= quarter.startDate && today <= quarter.endDate) {
      const quarterProgress = (today - quarter.startDate) / (quarter.endDate - quarter.startDate);
      todayX = i * quarterWidth + (quarterProgress * quarterWidth);
      break;
    }
  }
  
  if (todayX > 0) {
    const todayLine = document.createElement('div');
    todayLine.className = 'gantt-today-line';
    todayLine.style.left = todayX + 'px';
    todayLine.style.top = '0px';
    todayLine.style.height = (taskAreaTop + chartHeight) + 'px';
    
    const todayLabel = document.createElement('div');
    todayLabel.className = 'gantt-today-label';
    todayLabel.textContent = 'Today';
    todayLine.appendChild(todayLabel);
    
    ganttContainer.appendChild(todayLine);
  }
}

function renderTaskBars(visibleTasks, quarters, quarterWidth, rowHeight, taskAreaTop) {
  const chartArea = document.createElement('div');
  chartArea.className = 'gantt-chart-area';
  
  // Get actual row heights from the DOM
  const rowHeights = getTaskRowHeights();
  let currentY = 0;
  
  visibleTasks.forEach((task, index) => {
    const taskStart = new Date(task.start);
    const taskEnd = new Date(task.end);
    
    let startX = 0, endX = 0;
    
    // Calculate position within quarters
    for (let i = 0; i < quarters.length; i++) {
      const quarter = quarters[i];
      
      if (taskStart <= quarter.endDate && taskEnd >= quarter.startDate) {
        const overlapStart = new Date(Math.max(taskStart, quarter.startDate));
        const overlapEnd = new Date(Math.min(taskEnd, quarter.endDate));
        
        const startProgress = (overlapStart - quarter.startDate) / (quarter.endDate - quarter.startDate);
        const endProgress = (overlapEnd - quarter.startDate) / (quarter.endDate - quarter.startDate);
        
        if (startX === 0) startX = i * quarterWidth + (startProgress * quarterWidth);
        endX = i * quarterWidth + (endProgress * quarterWidth);
      }
    }
    
    if (endX > startX) {
      const bar = document.createElement('div');
      bar.className = `gantt-bar ${task.parent ? 'sub' : ''}`;
      bar.style.left = startX + 'px';
      
      // Use actual row height for this task and align perfectly with task row
      const actualRowHeight = rowHeights[task.id] || 60;
      const barHeight = task.parent ? 20 : 24;
      const verticalCenter = (actualRowHeight - barHeight) / 2;
      bar.style.top = (currentY + verticalCenter) + 'px';
      bar.style.width = (endX - startX) + 'px';
      
      // Remove text content - no wording in green timeline
      bar.title = `${task.name}\n${formatDate(task.start)} - ${formatDate(task.end)}`;
      chartArea.appendChild(bar);
    }
    
    // Update currentY for next task
    currentY += rowHeights[task.id] || 60;
  });
  
  ganttContainer.appendChild(chartArea);
}

function setupInfiniteScroll(quarters, quarterWidth) {
  const ganttRight = document.querySelector('.gantt-right');
  if (!ganttRight) return;
  
  ganttRight.addEventListener('scroll', () => {
    const scrollLeft = ganttRight.scrollLeft;
    const scrollWidth = ganttRight.scrollWidth;
    const clientWidth = ganttRight.clientWidth;
    
    // Check if user is near the end (within 500px)
    if (scrollLeft + clientWidth > scrollWidth - 500) {
      extendTimeline();
    }
  });
}

function extendTimeline() {
  // Extend the timeline by 10 more years
  const newMaxYear = maxEndYear + 10;
  maxEndYear = newMaxYear;
  
  // Re-render with extended timeline
  renderGantt();
}

// Export functions
document.getElementById('exportPdf').onclick = function() {
  const ganttWrapper = document.querySelector('.gantt-wrapper');
  if (!ganttWrapper) {
    alert('No gantt chart to export');
    return;
  }
  
  // Use html2canvas to capture the gantt wrapper
  html2canvas(ganttWrapper, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
    width: ganttWrapper.scrollWidth,
    height: ganttWrapper.scrollHeight,
    scrollX: 0,
    scrollY: 0
  }).then(canvas => {
    const imgData = canvas.toDataURL('image/png');
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
    });
    
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;
    
    // Calculate aspect ratio
    const ratio = Math.min(
      (pageWidth - 20) / canvasWidth,
      (pageHeight - 20) / canvasHeight
    );
    
    const imgWidth = canvasWidth * ratio;
    const imgHeight = canvasHeight * ratio;
    const x = (pageWidth - imgWidth) / 2;
    const y = (pageHeight - imgHeight) / 2;
    
    pdf.addImage(imgData, 'PNG', x, y, imgWidth, imgHeight);
    pdf.save('ganttchart.pdf');
  }).catch(error => {
    console.error('Error generating PDF:', error);
    alert('Error generating PDF. Please try again.');
  });
};

document.getElementById('exportPng').onclick = function() {
  const ganttWrapper = document.querySelector('.gantt-wrapper');
  if (!ganttWrapper) {
    alert('No gantt chart to export');
    return;
  }
  
  html2canvas(ganttWrapper, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
    width: ganttWrapper.scrollWidth,
    height: ganttWrapper.scrollHeight,
    scrollX: 0,
    scrollY: 0
  }).then(canvas => {
    const link = document.createElement('a');
    link.download = 'ganttchart.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  }).catch(error => {
    console.error('Error generating PNG:', error);
    alert('Error generating PNG. Please try again.');
  });
};

// Make functions global
window.toggleCollapse = toggleCollapse;
window.editTaskName = editTaskName;
window.editTaskDates = editTaskDates;
window.saveTask = saveTask;
window.cancelEdit = cancelEdit;
window.addSubTask = addSubTask;
window.addNewTask = addNewTask;
window.saveNewTask = saveNewTask;
window.cancelAdd = cancelAdd;
window.deleteTask = deleteTask;

// Initial render with empty state
tasks = [];
taskId = 1;

renderTaskList();
renderGantt();

// Initialize resize functionality after DOM is loaded
initializeResize(); 