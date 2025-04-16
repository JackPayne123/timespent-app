document.addEventListener('DOMContentLoaded', () => {
    // Elements
    const timeDisplay = document.getElementById('time-display');
    const currentTaskElement = document.getElementById('current-task');
    const startTimerBtn = document.getElementById('start-timer');
    const restartTimerBtn = document.getElementById('restart-timer');
    const customTimeInput = document.getElementById('custom-time');
    const taskDescriptionInput = document.getElementById('task-description');
    const tasksListElement = document.getElementById('tasks-list');
    const historyListElement = document.getElementById('history-list');
    const filterTagSelect = document.getElementById('filter-tag');
    const timezoneSelect = document.getElementById('timezone');
    const addTaskBtn = document.getElementById('add-task');
    const taskModal = document.getElementById('task-modal');
    const closeModalBtn = document.getElementById('close-modal');
    const cancelTaskBtn = document.getElementById('cancel-task');
    const saveTaskBtn = document.getElementById('save-task');
    const presetBtns = document.querySelectorAll('.preset-btn');
    const taskCount = document.getElementById('task-count');
    
    // Variables
    let timerInterval;
    let isTimerRunning = false;
    let timerPaused = false;
    let remainingSeconds = 0;
    let totalSeconds = 0;
    let endTime;
    let currentTask = '';
    let allTags = new Set();
    let completedTasks = [];
    
    // Initialize timezone
    const savedTimezone = localStorage.getItem('timezone') || 'Australia/Sydney'; // Default to AEST
    timezoneSelect.value = savedTimezone;
    moment.tz.setDefault(savedTimezone);
    
    // Save timezone preference when changed
    timezoneSelect.addEventListener('change', () => {
        const selectedTimezone = timezoneSelect.value;
        localStorage.setItem('timezone', selectedTimezone);
        moment.tz.setDefault(selectedTimezone);
        loadTasks(); // Reload tasks to update displayed times
    });
    
    // Initialize timer with default 25 minutes
    totalSeconds = 25 * 60;
    remainingSeconds = totalSeconds;
    updateTimeDisplay();
    
    // Load tasks
    loadTasks();
    
    // Event Listeners
    startTimerBtn.addEventListener('click', toggleTimer);
    restartTimerBtn.addEventListener('click', restartTimer);
    addTaskBtn.addEventListener('click', openTaskModal);
    closeModalBtn.addEventListener('click', closeTaskModal);
    cancelTaskBtn.addEventListener('click', closeTaskModal);
    saveTaskBtn.addEventListener('click', saveAndStartTask);
    filterTagSelect.addEventListener('change', filterTasks);
    customTimeInput.addEventListener('change', updateTimerFromInput);
    
    // Preset time buttons
    presetBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const minutes = parseInt(btn.dataset.minutes);
            if (!isNaN(minutes)) {
                customTimeInput.value = minutes;
                
                // Update timer display
                totalSeconds = minutes * 60;
                remainingSeconds = totalSeconds;
                updateTimeDisplay();
                
                // Update active state
                presetBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            }
        });
    });
    
    // Functions
    function updateTimerFromInput() {
        const minutes = parseInt(customTimeInput.value);
        if (!isNaN(minutes) && minutes > 0) {
            totalSeconds = minutes * 60;
            remainingSeconds = totalSeconds;
            updateTimeDisplay();
            
            // Reset active states on preset buttons
            presetBtns.forEach(btn => btn.classList.remove('active'));
        }
    }
    
    function toggleTimer() {
        if (isTimerRunning) {
            // Pause timer
            clearInterval(timerInterval);
            isTimerRunning = false;
            timerPaused = true;
            timeDisplay.parentElement.classList.remove('timer-active');
            timeDisplay.parentElement.classList.add('timer-paused');
            startTimerBtn.innerHTML = '<i class="fas fa-play"></i> Resume';
        } else {
            if (timerPaused) {
                // Resume timer
                startTimer(false);
                timeDisplay.parentElement.classList.add('timer-active');
                timeDisplay.parentElement.classList.remove('timer-paused');
                startTimerBtn.innerHTML = '<i class="fas fa-pause"></i> Pause';
            } else {
                // Start a new timer
                if (!currentTask) {
                    openTaskModal();
                    return;
                }
                startTimer(true);
                timeDisplay.parentElement.classList.add('timer-active');
                timeDisplay.parentElement.classList.remove('timer-paused');
                startTimerBtn.innerHTML = '<i class="fas fa-pause"></i> Pause';
            }
        }
    }
    
    function startTimer(isNewTimer) {
        if (isNewTimer) {
            const minutes = parseInt(customTimeInput.value);
            if (isNaN(minutes) || minutes <= 0) {
                alert('Please set a valid time');
                return;
            }
            
            totalSeconds = minutes * 60;
            remainingSeconds = totalSeconds;
            updateTimeDisplay();
        }
        
        endTime = new Date(Date.now() + remainingSeconds * 1000);
        isTimerRunning = true;
        timerPaused = false;
        
        timerInterval = setInterval(updateTimer, 1000);
    }
    
    function restartTimer() {
        clearInterval(timerInterval);
        
        // Reset timer to initial value from input
        const minutes = parseInt(customTimeInput.value);
        if (!isNaN(minutes) && minutes > 0) {
            totalSeconds = minutes * 60;
            remainingSeconds = totalSeconds;
        } else {
            totalSeconds = 25 * 60; // Default to 25 minutes
            remainingSeconds = totalSeconds;
            customTimeInput.value = 25;
        }
        
        updateTimeDisplay();
        isTimerRunning = false;
        timerPaused = false;
        timeDisplay.parentElement.classList.remove('timer-active');
        timeDisplay.parentElement.classList.remove('timer-paused');
        startTimerBtn.innerHTML = '<i class="fas fa-play"></i> Start';
    }
    
    function updateTimer() {
        const now = new Date();
        const diff = Math.floor((endTime - now) / 1000);
        
        if (diff <= 0) {
            // Timer complete
            clearInterval(timerInterval);
            isTimerRunning = false;
            remainingSeconds = 0;
            
            // Play notification sound or alert
            playNotificationSound();
            
            // Save completed task
            if (currentTask) {
                const duration = Math.round(totalSeconds / 60);
                saveCompletedTask(currentTask, duration);
                currentTask = '';
                currentTaskElement.textContent = 'No task in progress';
            }
            
            // Reset timer state
            timeDisplay.parentElement.classList.remove('timer-active');
            startTimerBtn.innerHTML = '<i class="fas fa-play"></i> Start';
            
            // Reset timer to initial value
            const minutes = parseInt(customTimeInput.value);
            if (!isNaN(minutes) && minutes > 0) {
                totalSeconds = minutes * 60;
                remainingSeconds = totalSeconds;
            } else {
                totalSeconds = 25 * 60; // Default to 25 minutes
                remainingSeconds = totalSeconds;
                customTimeInput.value = 25;
            }
            
            updateTimeDisplay();
        } else {
            remainingSeconds = diff;
            updateTimeDisplay();
        }
    }
    
    function updateTimeDisplay() {
        timeDisplay.textContent = formatTime(remainingSeconds);
    }
    
    function formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    
    function playNotificationSound() {
        // Check if browser supports notifications
        if (!("Notification" in window)) {
            alert("Time is up!");
            return;
        }
        
        // Check notification permission
        if (Notification.permission === "granted") {
            // Create and show notification
            new Notification("TimeSpent", {
                body: "Time is up! Task completed.",
                icon: "/static/favicon.ico"
            });
        } else if (Notification.permission !== "denied") {
            // Request permission
            Notification.requestPermission().then(permission => {
                if (permission === "granted") {
                    new Notification("TimeSpent", {
                        body: "Time is up! Task completed.",
                        icon: "/static/favicon.ico"
                    });
                } else {
                    alert("Time is up!");
                }
            });
        } else {
            // Fall back to alert
            alert("Time is up!");
        }
    }
    
    function openTaskModal() {
        taskModal.classList.add('active');
        setTimeout(() => {
            taskDescriptionInput.focus();
        }, 100);
    }
    
    function closeTaskModal() {
        taskModal.classList.remove('active');
        taskDescriptionInput.value = '';
    }
    
    function saveAndStartTask() {
        const description = taskDescriptionInput.value.trim();
        if (!description) {
            alert('Please enter a task description');
            return;
        }
        
        currentTask = description;
        currentTaskElement.textContent = description;
        closeTaskModal();
        startTimer(true);
        timeDisplay.parentElement.classList.add('timer-active');
        startTimerBtn.innerHTML = '<i class="fas fa-pause"></i> Pause';
    }
    
    function saveCompletedTask(description, duration) {
        fetch('/api/tasks', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                description,
                duration
            })
        })
        .then(response => response.json())
        .then(data => {
            // Add to completed tasks
            completedTasks.push(data);
            
            // Update task count
            taskCount.textContent = completedTasks.length;
            
            // Refresh task lists
            displayCompletedTasks();
            loadTasks();
        })
        .catch(error => console.error('Error saving task:', error));
    }
    
    function loadTasks() {
        fetch('/api/tasks')
            .then(response => response.json())
            .then(tasks => {
                completedTasks = tasks;
                
                // Update task count
                taskCount.textContent = completedTasks.length;
                
                // Display tasks
                displayCompletedTasks();
                displayHistoryTasks(tasks);
                updateTagsFilter(tasks);
            })
            .catch(error => console.error('Error loading tasks:', error));
    }
    
    function displayCompletedTasks() {
        tasksListElement.innerHTML = '';
        
        if (completedTasks.length === 0) {
            tasksListElement.innerHTML = '<p class="no-tasks">No tasks completed yet</p>';
            return;
        }
        
        // Show only today's tasks in the task list
        const today = moment().startOf('day');
        const todaysTasks = completedTasks.filter(task => {
            const taskDate = moment(task.created_at);
            return taskDate.isSame(today, 'day');
        });
        
        if (todaysTasks.length === 0) {
            tasksListElement.innerHTML = '<p class="no-tasks">No tasks completed today</p>';
            return;
        }
        
        todaysTasks.forEach(task => {
            const taskItem = createTaskItem(task);
            tasksListElement.appendChild(taskItem);
        });
    }
    
    function displayHistoryTasks(tasks) {
        historyListElement.innerHTML = '';
        
        if (tasks.length === 0) {
            historyListElement.innerHTML = '<p class="no-tasks">No tasks found</p>';
            return;
        }
        
        tasks.forEach(task => {
            const taskItem = createTaskItem(task, true);
            historyListElement.appendChild(taskItem);
        });
    }
    
    function createTaskItem(task, showDate = false) {
        // Extract tags
        const taskTags = task.tags || [];
        
        // Create task item element
        const taskItem = document.createElement('div');
        taskItem.className = 'task-item';
        
        // Create checkbox
        const checkbox = document.createElement('div');
        checkbox.className = 'task-checkbox completed';
        checkbox.innerHTML = '<i class="fas fa-check"></i>';
        
        // Create task content
        const content = document.createElement('div');
        content.className = 'task-content';
        
        const name = document.createElement('div');
        name.className = 'task-name';
        name.textContent = task.description;
        
        const meta = document.createElement('div');
        meta.className = 'task-meta';
        
        let metaText = `${task.duration} min`;
        if (showDate) {
            metaText += ` • ${formatTaskDate(task.created_at)}`;
        }
        meta.textContent = metaText;
        
        content.appendChild(name);
        content.appendChild(meta);
        
        // Add tags if any
        if (taskTags.length > 0) {
            const tagsContainer = document.createElement('div');
            tagsContainer.className = 'task-tags';
            
            taskTags.forEach(tagText => {
                const tag = document.createElement('span');
                tag.className = 'tag';
                tag.textContent = tagText;
                tag.addEventListener('click', () => {
                    filterTagSelect.value = tagText;
                    filterTasks();
                });
                tagsContainer.appendChild(tag);
                
                // Add to all tags set
                allTags.add(tagText);
            });
            
            content.appendChild(tagsContainer);
        }
        
        // Assemble task item
        taskItem.appendChild(checkbox);
        taskItem.appendChild(content);
        
        return taskItem;
    }
    
    function formatTaskDate(dateString) {
        const date = moment(dateString);
        return date.format('D MMM YYYY, h:mm A');
    }
    
    function updateTagsFilter(tasks) {
        // Get all unique tags
        tasks.forEach(task => {
            const taskTags = task.tags || [];
            taskTags.forEach(tag => allTags.add(tag));
        });
        
        // Current selected value
        const currentValue = filterTagSelect.value;
        
        // Clear options except the first one
        filterTagSelect.innerHTML = '<option value="">All tasks</option>';
        
        // Add tag options
        Array.from(allTags).sort().forEach(tag => {
            const option = document.createElement('option');
            option.value = tag;
            option.textContent = tag;
            filterTagSelect.appendChild(option);
        });
        
        // Restore selected value if it exists
        if (currentValue && Array.from(allTags).includes(currentValue)) {
            filterTagSelect.value = currentValue;
        }
    }
    
    function filterTasks() {
        const selectedTag = filterTagSelect.value;
        if (!selectedTag) {
            loadTasks();
            return;
        }
        
        fetch(`/api/tasks/filter?tag=${encodeURIComponent(selectedTag)}`)
            .then(response => response.json())
            .then(tasks => {
                displayHistoryTasks(tasks);
            })
            .catch(error => console.error('Error filtering tasks:', error));
    }
});
