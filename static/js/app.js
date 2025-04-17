document.addEventListener('DOMContentLoaded', function() {
    // --- Worker Setup ---
    let timerWorker = null;
    if (window.Worker) {
        timerWorker = new Worker('/static/js/timer.worker.js');
        timerWorker.onerror = function(error) {
            console.error('Worker Error:', error);
            alert('Error initializing timer worker. Timer may not function correctly.');
        };
    } else {
        console.error('Web Workers not supported in this browser.');
        alert('Your browser does not support Web Workers. Timer functionality might be limited.');
    }
    // ---------------------

    // App State (Removed timer-specific state)
    const state = {
        // Local state reflecting worker status for UI updates
        isTimerActive: false, 
        isTimerPaused: false,
        currentDisplayMinutes: 25, // Keep track of display time
        currentDisplaySeconds: 0,
        initialDurationSet: 25 * 60, // Store initial duration for reset/completion

        currentSessionDescription: '', 
        currentSessionTags: [], 
        history: [],
        activeFilterTag: null,
        volume: 0.5,
        includeBreaksInMetrics: true // NEW: State for break toggle
    };

    const MAX_MINUTES = 180; 
    const SOUND_FILE = '/531030__creeeeak__bell9.wav'; 

    // DOM Elements
    const elements = {
        timeDisplay: document.getElementById('time-display'),
        customTimeInput: document.getElementById('custom-time'),
        sessionDescriptionInput: document.getElementById('session-description'), // New input
        startButton: document.getElementById('start-timer-btn'),
        pauseButton: document.getElementById('pause-timer-btn'), // New pause button
        taskCompletedButton: document.getElementById('task-completed-btn'), // New complete button
        addTimeControls: document.querySelector('.add-time-controls'), // Container for add time buttons
        add5mButton: document.getElementById('add-5m-btn'), // New button
        add15mButton: document.getElementById('add-15m-btn'), // New button
        resetButton: document.getElementById('reset-timer-btn'),
        presetButtons: document.querySelectorAll('.preset-btn'),
        historyList: document.getElementById('history-list'),
        historyFilterTagsContainer: document.getElementById('history-filter-tags'), // Added filter container
        clearHistoryButton: document.getElementById('clear-history-btn'), // Added clear button element
        historyMetricsContainer: document.getElementById('history-metrics'), // Added metrics container
        volumeSettingsButton: document.getElementById('volume-settings-btn'), // Cog button
        volumeSlider: document.getElementById('volume-slider'), // Slider input
        presetTagsContainer: document.getElementById('preset-tags-container'), // For preset tag buttons
        dayTrackingViewContainer: document.getElementById('day-tracking-view'), // For daily summary view
        includeBreaksToggle: document.getElementById('include-breaks-toggle') // NEW: Checkbox element
    };

    // --- Worker Message Handling ---
    if (timerWorker) {
        timerWorker.onmessage = function(event) {
            const { type, minutes, seconds, added } = event.data;
            // console.log('[Main] Received message:', type, event.data);

            switch (type) {
                case 'tick':
                    state.currentDisplayMinutes = minutes;
                    state.currentDisplaySeconds = seconds;
                    updateCountdownDisplay(); // Update UI with received time
                    break;
                case 'playSound':
                    playSound();
                    break;
                case 'completed':
                    handleWorkerCompletion();
                    break;
                case 'started':
                    state.isTimerActive = true;
                    state.isTimerPaused = false;
                    disableInputs();
                    updateButtonStates();
                    break;
                case 'stopped': // From worker's stop/reset
                    state.isTimerActive = false;
                    state.isTimerPaused = false;
                    enableInputs();
                    updateButtonStates();
                    break;
                 case 'paused':
                    state.isTimerActive = true; // Still active session
                    state.isTimerPaused = true;
                    updateButtonStates();
                    break;
                 case 'resumed':
                    state.isTimerActive = true;
                    state.isTimerPaused = false;
                    updateButtonStates();
                    break;
                 case 'resetComplete': // After worker resets internal time
                    state.isTimerActive = false;
                    state.isTimerPaused = false;
                    state.currentDisplayMinutes = minutes;
                    state.currentDisplaySeconds = seconds;
                    enableInputs(); 
                    updateButtonStates();
                    updateCountdownDisplay(); // Update display with reset time
                    break;
                 case 'timeAdded':
                    console.log(`Worker confirmed ${added} minutes added.`);
                    // UI/state already updated based on subsequent 'tick'
                    break;
            }
        };
    }
    // -----------------------------

    // --- Helper to play sound ---
    function playSound() {
         try {
            const audio = new Audio(SOUND_FILE);
            audio.volume = state.volume;
            audio.play().catch(err => console.log('Audio play failed.', err));
        } catch (err) {
            console.error('Error playing sound:', err);
        }
    }
    // --------------------------

    // Initialize the app
    function init() {
        // Load volume from localStorage
        const savedVolume = localStorage.getItem('timeSpent_volume');
        if (savedVolume !== null) {
            state.volume = parseFloat(savedVolume);
        }
        elements.volumeSlider.value = state.volume; // Set slider position

        // NEW: Load break toggle state from localStorage
        const savedIncludeBreaks = localStorage.getItem('timeSpent_includeBreaks');
        if (savedIncludeBreaks !== null) {
            state.includeBreaksInMetrics = JSON.parse(savedIncludeBreaks);
        }
        elements.includeBreaksToggle.checked = state.includeBreaksInMetrics; // Set checkbox state

        loadHistoryFromBackend();
        setCountdownLength(state.currentDisplayMinutes);
        updateCountdownDisplay();
        setupEventListeners();
        updateButtonStates();
        // Keep slider hidden initially
        elements.volumeSlider.classList.add('hidden');
    }

    // Setup Event Listeners
    function setupEventListeners() {
        // Countdown controls
        elements.startButton.addEventListener('click', startCountdown);
        elements.pauseButton.addEventListener('click', togglePause); // Use togglePause for Pause/Resume
        elements.taskCompletedButton.addEventListener('click', handleTaskCompleted);
        elements.add5mButton.addEventListener('click', () => addTime(5)); // Listener for +5m
        elements.add15mButton.addEventListener('click', () => addTime(15)); // Listener for +15m
        elements.resetButton.addEventListener('click', resetCountdown);
        elements.clearHistoryButton.addEventListener('click', handleClearHistory); // Added listener for clear button

        // Countdown length controls
        elements.customTimeInput.addEventListener('change', updateCountdownLengthFromInput);

        // Preset buttons
        elements.presetButtons.forEach(btn => {
            btn.addEventListener('click', function() {
                const minutes = parseInt(this.dataset.minutes);
                if (!state.isTimerActive && !state.isTimerPaused) { // Only allow preset change if fully stopped
                    setCountdownLength(minutes);
                    elements.customTimeInput.value = minutes;
                    elements.presetButtons.forEach(b => b.classList.remove('active'));
                    this.classList.add('active');
                }
            });
        });

        // Volume Control Listeners
        elements.volumeSettingsButton.addEventListener('click', () => {
            elements.volumeSlider.classList.toggle('hidden');
        });
        elements.volumeSlider.addEventListener('input', handleVolumeChange);

        // NEW: Listener for the break toggle checkbox
        elements.includeBreaksToggle.addEventListener('change', handleBreakToggleChange);
    }

    // Update Button Visibility and Text based on State
    function updateButtonStates() {
        const isRunningOrPaused = state.isTimerActive;

        // Timer Controls
        elements.startButton.classList.toggle('hidden', isRunningOrPaused);
        elements.pauseButton.classList.toggle('hidden', !isRunningOrPaused);
        elements.taskCompletedButton.classList.toggle('hidden', !isRunningOrPaused);
        elements.resetButton.classList.remove('hidden'); // Reset is always visible

        // Add Time Controls Container Visibility
        elements.addTimeControls.classList.toggle('hidden', !isRunningOrPaused);

        if (state.isTimerPaused) {
            elements.pauseButton.textContent = 'Resume';
        } else {
            elements.pauseButton.textContent = 'Pause';
        }
    }

    // Countdown Functions
    function updateCountdownDisplay() {
        const minutes = String(state.currentDisplayMinutes).padStart(2, '0');
        const seconds = String(state.currentDisplaySeconds).padStart(2, '0');
        elements.timeDisplay.textContent = `${minutes}:${seconds}`;
        document.title = `${minutes}:${seconds} - TimeSpent`;
    }

    function updateCountdownLengthFromInput() {
        if (state.isTimerActive || state.isTimerPaused) return; // Don't allow change if running or paused
        let minutes = parseInt(elements.customTimeInput.value);
        if (isNaN(minutes) || minutes < 1) minutes = 1;
        if (minutes > 120) minutes = 120;
        elements.customTimeInput.value = minutes;
        setCountdownLength(minutes);
        elements.presetButtons.forEach(b => b.classList.remove('active'));
    }

    function setCountdownLength(minutes) {
        if (state.isTimerActive || state.isTimerPaused) return;
        state.currentDisplayMinutes = minutes;
        state.currentDisplaySeconds = 0;
        state.initialDurationSet = minutes * 60;
        updateCountdownDisplay();
    }

    // Modified startCountdown to request permission if needed
    function startCountdown() {
        if (state.isTimerActive || state.isTimerPaused) return;

        // --- Request Notification Permission --- 
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission().then(permission => {
                console.log('Notification permission:', permission);
                // We don't need to do anything else here, just requested.
            });
        }
        // --- End Request ---

        const description = elements.sessionDescriptionInput.value.trim();
        if (!description) {
            alert('Please enter what you are working on before starting.');
            elements.sessionDescriptionInput.focus();
            return;
        }

        if (state.initialDurationSet === 0) {
            alert('Please set a countdown duration.');
            return; // Don't start if duration is 0
        }

        state.currentSessionDescription = description;
        state.currentSessionTags = extractHashtags(description);
        state.isTimerActive = true;
        state.isTimerPaused = false;

        // Disable inputs
        elements.customTimeInput.disabled = true;
        elements.sessionDescriptionInput.disabled = true;
        elements.presetButtons.forEach(btn => btn.disabled = true);
        elements.sessionDescriptionInput.classList.add('timer-active-style'); // Add class for styling
        elements.presetTagsContainer.classList.add('hidden'); // Hide preset tags

        updateButtonStates(); // Show Pause, Complete, hide Start
        sendWorkerCommand('start', { durationSeconds: state.initialDurationSet });
    }

    function togglePause() {
        if (!state.isTimerActive) return;
        if (state.isTimerPaused) {
            sendWorkerCommand('resume');
        } else {
            sendWorkerCommand('pause');
        }
         // UI updates happen via worker messages ('paused', 'resumed')
    }

    // NEW function to handle completion
    function handleTaskCompleted() {
        if (!state.isTimerActive) return;
        
        // Tell worker to stop immediately
        sendWorkerCommand('stop');

        // Calculate elapsed time based on initial and *current displayed* time
        const remainingSeconds = state.currentDisplayMinutes * 60 + state.currentDisplaySeconds;
        const elapsedSeconds = state.initialDurationSet - remainingSeconds;
        const elapsedDuration = Math.max(1, Math.ceil(elapsedSeconds / 60));

        saveCurrentSessionToHistory(elapsedDuration);

        // Reset UI immediately (worker will also send 'stopped')
        const resetTime = new Date(); // Capture time *before* resetting state
        state.isTimerActive = false;
        state.isTimerPaused = false;
        enableInputs();
        updateButtonStates();
        // Reset display time to initial
        state.currentDisplayMinutes = Math.floor(state.initialDurationSet / 60);
        state.currentDisplaySeconds = state.initialDurationSet % 60;
        updateCountdownDisplay();
        // Clear session data
        state.currentSessionDescription = '';
        state.currentSessionTags = [];
        elements.sessionDescriptionInput.value = '';
        // Note: saveCurrentSessionToHistory was called *before* this UI reset
    }

    // Modified internalReset to remove flashing logic
    function internalReset(showAlert = true) {
        sendWorkerCommand('reset', { durationSeconds: state.initialDurationSet });
        state.isTimerActive = false;
        state.isTimerPaused = false;
        state.currentDisplayMinutes = Math.floor(state.initialDurationSet / 60);
        state.currentDisplaySeconds = state.initialDurationSet % 60;
        elements.customTimeInput.disabled = false;
        elements.sessionDescriptionInput.disabled = false;
        elements.sessionDescriptionInput.value = '';
        elements.presetButtons.forEach(btn => btn.disabled = false);
        updateCountdownDisplay();
        document.title = 'TimeSpent - Simple Countdown';
        if (showAlert) {
            alert('Countdown reset.');
        }
    }

    // Reset button calls internalReset
    function resetCountdown() {
        internalReset(true);
        updateButtonStates(); // Update buttons after reset
    }

    function updateCountdown() {
        // Check if timer is about to hit zero (at 00:01)
        if (state.currentDisplayMinutes === 0 && state.currentDisplaySeconds === 1) {
            // Play sound 1 second early
            try {
                const audio = new Audio(SOUND_FILE);
                audio.volume = state.volume;
                audio.play().catch(err => console.log('Audio play failed.', err));
            } catch (err) {
                console.error('Error playing sound:', err);
            }
        }

        // Decrement timer
        if (state.currentDisplaySeconds > 0) {
            state.currentDisplaySeconds--;
        } else if (state.currentDisplayMinutes > 0) {
            state.currentDisplayMinutes--;
            state.currentDisplaySeconds = 59;
        } else {
            countdownCompleted(); // Timer reached zero
            return;
        }
        updateCountdownDisplay();
    }

    // Modified countdownCompleted to use Notification API
    function countdownCompleted() {
        sendWorkerCommand('stop');
        state.isTimerActive = false;
        state.isTimerPaused = false;
        state.currentDisplayMinutes = Math.floor(state.initialDurationSet / 60);
        state.currentDisplaySeconds = state.initialDurationSet % 60;
        updateCountdownDisplay();
        
        showCompletionNotification();
    }

    function getCountdownDuration() {
        // This might not be needed anymore as we calculate elapsed time
        return Math.floor(state.initialDurationSet / 60);
    }

    function extractHashtags(text) {
        const regex = /#(\w+)/g;
        const tags = [];
        let match;
        while ((match = regex.exec(text)) !== null) {
            tags.push(match[1]); // Push the captured group (the word after #)
        }
        return tags;
    }

    // Rendering Functions
    function formatDateHeader(date) {
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        // Work on copies to avoid mutating the original date object
        const dateCopy = new Date(date);
        const todayCopy = new Date(today);
        const yesterdayCopy = new Date(yesterday);

        todayCopy.setHours(0, 0, 0, 0);
        yesterdayCopy.setHours(0, 0, 0, 0);
        dateCopy.setHours(0, 0, 0, 0);

        // Compare using the modified copies
        if (dateCopy.getTime() === todayCopy.getTime()) {
            return 'Today';
        }
        if (dateCopy.getTime() === yesterdayCopy.getTime()) {
            return 'Yesterday';
        }
        // Return formatted original date (or copy, doesn't matter here)
        return date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    }

    function renderHistory() {
        if (!elements.historyList || !elements.historyMetricsContainer) return;

        // 1. Render Filter Tags (independent of filtering)
        renderFilterTags();

        // 2. Filter History based on active tag
        let filteredHistory = state.activeFilterTag
            ? state.history.filter(entry => entry.tags && entry.tags.includes(state.activeFilterTag))
            : state.history; 

        // 2.5 NEW: Filter out breaks if toggle is off (for metrics calculation)
        const historyForMetrics = state.includeBreaksInMetrics
            ? filteredHistory // Use the tag-filtered list as is
            : filteredHistory.filter(entry => !(entry.tags && entry.tags.includes('break'))); // Exclude breaks

        // 3. Calculate Metrics for Today based on FILTERED history (historyForMetrics)
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        let totalTimeToday = 0;
        let sessionsToday = 0;
        const todayStartTime = today.getTime(); // Get timestamp once

        // Use historyForMetrics for metrics calculation
        historyForMetrics.forEach(entry => {
            // Use start_time for metrics calculation and ensure it's valid
            if (!entry.start_time) return; // Skip if no start_time
            const entryDate = new Date(entry.start_time); 
            if (isNaN(entryDate.getTime())) return; // Skip if invalid date
            
            entryDate.setHours(0, 0, 0, 0);
            if (entryDate.getTime() === todayStartTime) { 
                totalTimeToday += entry.duration;
                sessionsToday++;
            }
        });
        
        // 4. Render Metrics - Update labels if filtered
        const filterSuffix = state.activeFilterTag ? ` (#${state.activeFilterTag})` : '';
        const breaksSuffix = !state.includeBreaksInMetrics ? ' (excl. breaks)' : ''; // NEW suffix
        elements.historyMetricsContainer.innerHTML = `
            <div class="metric-item">
                <span class="metric-value">${sessionsToday}</span>
                <span class="metric-label">Sessions Today${filterSuffix}${breaksSuffix}</span>
            </div>
            <div class="metric-item">
                <span class="metric-value">${totalTimeToday} min</span>
                <span class="metric-label">Total Time Today${filterSuffix}${breaksSuffix}</span>
            </div>
        `;

        // 5. Group Filtered History by Day and Render List (use original filteredHistory for the list display)
        elements.historyList.innerHTML = ''; // Clear previous list
        if (filteredHistory.length === 0) {
            const message = state.activeFilterTag 
                ? `No sessions found with tag #${state.activeFilterTag}.`
                : 'No completed sessions yet.';
            elements.historyList.innerHTML = `<div class="no-tasks">${message}</div>`;
            // Still render day tracking and preset tags even if history list is empty
            renderDayTrackingView(historyForMetrics); // Pass historyForMetrics to day tracking
            renderPresetTags(); 
            return; 
        }

        // Use start_time for sorting (use original filteredHistory)
        const sortedHistory = [...filteredHistory].sort((a, b) => {
             // Handle potential missing or invalid dates during sort
            const dateA = a.start_time ? new Date(a.start_time) : null;
            const dateB = b.start_time ? new Date(b.start_time) : null;
            if (!dateA || isNaN(dateA.getTime())) return 1; // Push invalid dates down
            if (!dateB || isNaN(dateB.getTime())) return -1;
            return dateB - dateA; // Sort descending
        });
        
        let currentDay = null;
        sortedHistory.forEach(entry => {
            // --- Robust Date Parsing using start_time --- 
            if (!entry.start_time) {
                console.error("Missing start_time for history entry:", entry);
                return; // Skip entry if no start_time
            }
            const startDateObj = new Date(entry.start_time);
            if (isNaN(startDateObj.getTime())) {
                return; // Skip this iteration
            }
            
            let endDateObj = null;
            let endTimeString = '';
            if (entry.end_time) {
                endDateObj = new Date(entry.end_time);
                if (!isNaN(endDateObj.getTime())) {
                     endTimeString = endDateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }); // Ensure 24hr
                } else {
                    console.warn("Invalid end_time encountered for entry:", entry.id, entry.end_time);
                    endDateObj = null; // Treat as invalid
                }
            } else {
                 console.warn("Missing end_time for entry:", entry.id);
            }

            const entryDay = startDateObj.toDateString(); // Use simple date string for comparison

            // Check if day changed, insert header if needed
            if (entryDay !== currentDay) {
                currentDay = entryDay;
                const dateHeader = document.createElement('div');
                dateHeader.classList.add('history-date-header');
                dateHeader.textContent = formatDateHeader(startDateObj); // Use parsed date object
                elements.historyList.appendChild(dateHeader);
            }

            // Render the history item itself 
            const startTimeString = startDateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }); // Explicitly use 24-hour format
            const dateString = startDateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); 
            
            const timeDisplay = endTimeString ? `${startTimeString} - ${endTimeString}` : startTimeString;
            
            const historyElement = document.createElement('div');
            historyElement.classList.add('history-item');
            historyElement.dataset.id = entry.id; 
            const safeDescription = document.createElement('div');
            safeDescription.textContent = entry.description;
            let tagsHTML = '';
            if (entry.tags && entry.tags.length > 0) {
                tagsHTML = entry.tags.map(tag => 
                    `<span class="task-tag filterable-tag" data-tag="${tag}">#${tag}</span>`
                ).join(' ');
            }
            historyElement.innerHTML = `
                <div class="task-info">
                    <div class="task-description">${safeDescription.innerHTML}</div>
                    <div class="task-meta">
                        ${tagsHTML}
                        <span class="duration-time">${entry.duration} min · ${dateString}, ${timeDisplay}</span>
                    </div>
                </div>
                <button class="delete-history-item-btn" title="Delete entry">×</button> 
            `; 
            
            const deleteButton = historyElement.querySelector('.delete-history-item-btn');
            if (deleteButton) {
                deleteButton.addEventListener('click', (e) => {
                    e.stopPropagation(); 
                    if (confirm('Are you sure you want to delete this history entry?')) {
                        deleteHistoryEntryFromBackend(entry.id);
                    }
                });
            }

            historyElement.querySelectorAll('.filterable-tag').forEach(tagEl => {
                tagEl.addEventListener('click', (e) => {
                    e.stopPropagation(); 
                    applyHistoryFilter(tagEl.dataset.tag);
                });
            });
            elements.historyList.appendChild(historyElement);
        });

        // 6. Render Day Tracking View (passing historyForMetrics)
        renderDayTrackingView(historyForMetrics);

        // 7. Render Preset Tags (based on full history - or maybe filtered?)
        // Let's keep preset tags based on full history for now
        renderPresetTags(); 
    }

    function renderFilterTags() {
        if (!elements.historyFilterTagsContainer) return;

        // Get all unique tags from history
        const allTags = new Set();
        state.history.forEach(entry => {
            if (entry.tags) {
                entry.tags.forEach(tag => allTags.add(tag));
            }
        });

        elements.historyFilterTagsContainer.innerHTML = ''; // Clear previous tags

        // Create "All" button
        const allButton = document.createElement('button');
        allButton.textContent = 'All';
        allButton.classList.add('filter-tag-btn');
        if (state.activeFilterTag === null) {
            allButton.classList.add('active');
        }
        allButton.addEventListener('click', () => applyHistoryFilter(null));
        elements.historyFilterTagsContainer.appendChild(allButton);

        // Create buttons for each unique tag
        Array.from(allTags).sort().forEach(tag => {
            const tagButton = document.createElement('button');
            tagButton.textContent = `#${tag}`;
            tagButton.classList.add('filter-tag-btn');
            if (state.activeFilterTag === tag) {
                tagButton.classList.add('active');
            }
            tagButton.addEventListener('click', () => applyHistoryFilter(tag));
            elements.historyFilterTagsContainer.appendChild(tagButton);
        });
    }

    function applyHistoryFilter(tag) {
        state.activeFilterTag = tag;
        renderHistory(); // Re-render the history list with the filter applied
    }

    // NEW: Render the top 4 preset tags
    function renderPresetTags() {
        if (!elements.presetTagsContainer) return;

        // 1. Calculate tag frequencies from *all* history
        const tagCounts = {};
        state.history.forEach(entry => {
            if (entry.tags) {
                entry.tags.forEach(tag => {
                    tagCounts[tag] = (tagCounts[tag] || 0) + 1;
                });
            }
        });

        // 2. Get top 4 tags
        const sortedTags = Object.entries(tagCounts)
            .sort(([, countA], [, countB]) => countB - countA) // Sort by count descending
            .map(([tag]) => tag) // Get just the tag names
            .slice(0, 4); // Take top 4

        // 3. Render buttons
        elements.presetTagsContainer.innerHTML = ''; // Clear previous
        if (sortedTags.length > 0) {
             sortedTags.forEach(tag => {
                const button = document.createElement('button');
                button.textContent = `#${tag}`;
                button.classList.add('preset-tag-btn');
                button.dataset.tag = tag;
                button.addEventListener('click', () => toggleTagInDescription(tag));
                elements.presetTagsContainer.appendChild(button);
            });
        }
    }

    // MODIFIED: Toggle selected preset tag in description input
    function toggleTagInDescription(tag) {
        const input = elements.sessionDescriptionInput;
        let currentValue = input.value;
        const tagText = `#${tag}`; 
        
        // Check if the exact tag exists, surrounded by spaces or at start/end of string
        // Case-insensitive check
        const checkRegex = new RegExp(`(^|\s)${tagText}(\s|$)`, 'i');

        if (checkRegex.test(currentValue)) {
            // Tag exists. Remove all occurrences (case-insensitive, global).
            // Match the tag, making sure it's bounded by spaces or start/end.
            const removeRegex = new RegExp(`(^|\s)${tagText}(\s|$)`, 'gi');
            
            // Replace the match. If tag was surrounded by spaces, replace with a single space.
            // If tag was at start/end with one space, replace with empty string (handled by trim).
            let newValue = currentValue.replace(removeRegex, (match, p1, p2) => {
                // p1 is the space before (or empty), p2 is the space after (or empty)
                // If both spaces exist, keep one space. Otherwise, remove entirely.
                return (p1 && p2) ? ' ' : ''; 
            });
            
            // Clean up any potential resulting double spaces and trim start/end.
            newValue = newValue.replace(/\s{2,}/g, ' ').trim(); 
            input.value = newValue;

        } else {
            // Tag doesn't exist, add it
            const prefix = (currentValue.length > 0 && !currentValue.endsWith(' ')) ? ' ' : '';
            // Add the tag followed by a space
            input.value += prefix + tagText + ' '; 
        }
        input.focus(); // Focus for convenience
    }
    
    // NEW: Render Day Tracking View
    function renderDayTrackingView(historyData) { // Accepts history data (potentially pre-filtered for breaks)
        if (!elements.dayTrackingViewContainer) return;

        const dailyTotals = {}; // { 'YYYY-MM-DD': totalMinutes }

        // History data is already filtered for breaks if necessary by the caller (renderHistory)
        historyData.forEach(entry => {
             if (!entry.start_time || !entry.duration) return; // Need start_time and duration

             const startDate = new Date(entry.start_time);
             if (isNaN(startDate.getTime())) return; // Skip invalid dates

             // Use local date components for the key
             const year = startDate.getFullYear();
             const month = String(startDate.getMonth() + 1).padStart(2, '0'); // Months are 0-indexed
             const day = String(startDate.getDate()).padStart(2, '0');
             const dayKey = `${year}-${month}-${day}`; // Use local 'YYYY-MM-DD'

             dailyTotals[dayKey] = (dailyTotals[dayKey] || 0) + entry.duration;
        });

        // Sort days chronologically
        const sortedDays = Object.entries(dailyTotals).sort(([dayA], [dayB]) => dayA.localeCompare(dayB));

        // Generate HTML 
        const breaksSuffix = !state.includeBreaksInMetrics ? ' (excl. breaks)' : ''; // Add suffix here too
        let html = `<h3 class="view-title">Daily Totals${breaksSuffix}</h3>`; 
        if (sortedDays.length === 0) {
            const baseMessage = state.activeFilterTag 
                ? 'No activity recorded for the selected filter.'
                : 'No activity recorded yet.';
            html += `<p class="no-data">${baseMessage}${breaksSuffix}</p>`;
        } else {
            html += '<ul class="daily-totals-list">';
            sortedDays.forEach(([day, totalMinutes]) => {
                 const dateObj = new Date(day + 'T00:00:00'); 
                 const displayDate = dateObj.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

                 const today = new Date();
                 today.setHours(0, 0, 0, 0);
                 const displayDayDate = new Date(dateObj); // Use a copy
                 displayDayDate.setHours(0, 0, 0, 0);
                 const dateLabel = (displayDayDate.getTime() === today.getTime()) ? 'Today' : displayDate;
                 
                 html += `<li><span class="date">${dateLabel}:</span> <span class="time">${totalMinutes} min</span></li>`;
            });
            html += '</ul>';
        }

        elements.dayTrackingViewContainer.innerHTML = html;
    }

    // Backend Interaction
    function saveHistoryToBackend(entry) {
        fetch('/api/history', { // Changed endpoint to /api/history
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                description: entry.description,
                duration: entry.duration,
                tags: entry.tags.join(','), // Send tags as comma-separated string
                start_time: entry.start_time, // Send start_time
                end_time: entry.end_time      // Send end_time
            })
        })
        .then(response => {
            if (!response.ok) {
                // Try to parse error details
                response.json().then(err => {
                     console.error('Failed to save history to backend:', response.statusText, err);
                }).catch(() => {
                    console.error('Failed to save history to backend:', response.statusText, '(No JSON body)');
                });
                 // Potentially throw an error here or handle it depending on desired behavior
                 // throw new Error(`HTTP error! status: ${response.status}`); 
            }
            return response.json(); // May error if response wasn't ok and not JSON
        })
        .then(savedEntry => {
            console.log('History saved:', savedEntry);
            // Optionally update local entry ID with backend ID if needed
            // Find the local entry and update its ID
             const localEntryIndex = state.history.findIndex(item => item.id === entry.id); // Use the original local ID passed in
            if (localEntryIndex !== -1 && savedEntry && savedEntry.id) {
                state.history[localEntryIndex].id = savedEntry.id; // Update the ID
                console.log(`Updated local entry ${entry.id} to backend ID ${savedEntry.id}`);
                saveHistoryToLocalStorage(); // Save the updated ID
                // Re-render might be needed if ID is displayed or used elsewhere immediately
                // renderHistory(); 
            } else if (!savedEntry || !savedEntry.id) {
                console.warn('Backend did not return a valid saved entry with ID.');
            }
        })
        .catch(error => {
            console.error('Error saving history to backend:', error);
            // Implement retry logic or user notification if needed
        });
    }

    function loadHistoryFromBackend() {
        fetch('/api/history')
            .then(response => {
                if (!response.ok) { throw new Error(`HTTP error! status: ${response.status}`); }
                return response.json();
            })
            .then(data => {
                // Ensure tags is always an array and handle start/end times
                state.history = data.map(item => ({ 
                    ...item, 
                    tags: item.tags || [],
                    // Assume backend returns ISO strings for start_time and end_time
                    start_time: item.start_time, 
                    end_time: item.end_time 
                }));
                saveHistoryToLocalStorage(); // Sync local storage
                renderHistory(); // Render AFTER data is loaded and processed
            })
            .catch(error => {
                console.error('Error loading history from backend:', error);
                loadHistoryFromLocalStorage(); // Fallback to local storage
                renderHistory(); // <<< Render AFTER fallback data is loaded
            });
    }

    // Local Storage Functions
    function saveHistoryToLocalStorage() {
        try {
            localStorage.setItem('timeSpent_history', JSON.stringify(state.history));
        } catch (error) {
            console.error('Error saving history to localStorage:', error);
        }
    }

    function loadHistoryFromLocalStorage() {
        try {
            const historyData = localStorage.getItem('timeSpent_history');
            if (historyData) {
                state.history = JSON.parse(historyData).map(item => ({
                     ...item,
                     tags: item.tags || [], // Ensure tags is an array on load
                     start_time: item.start_time, // Load start_time
                     end_time: item.end_time      // Load end_time
                 }));
            } else {
                state.history = [];
            }
        } catch (error) {
            console.error('Error loading history from localStorage:', error);
            localStorage.removeItem('timeSpent_history');
            state.history = [];
        }
        // No longer call renderHistory here, let loadHistoryFromBackend handle it
    }

    // NEW function to handle clearing history
    function handleClearHistory() {
        const confirmed = confirm("Are you sure you want to delete ALL history entries? This cannot be undone.");

        if (confirmed) {
            console.log("Attempting to clear history...");
            fetch('/api/history', { method: 'DELETE' })
                .then(response => {
                    if (!response.ok) {
                        // Try parsing error message from backend if available
                        return response.json().then(err => { 
                            throw new Error(err.error || `HTTP error! status: ${response.status}`);
                        }).catch(() => {
                            // Fallback if no JSON error message
                            throw new Error(`HTTP error! status: ${response.status}`);
                        });
                    }
                    return response.json();
                })
                .then(data => {
                    console.log("History cleared successfully on backend:", data.message);
                    // Clear local state
                    state.history = [];
                    state.activeFilterTag = null; // Reset filter
                    // Clear local storage
                    saveHistoryToLocalStorage();
                    // Re-render the history section (will show empty message)
                    renderHistory();
                    alert("History cleared successfully.");
                })
                .catch(error => {
                    console.error('Error clearing history:', error);
                    alert(`Failed to clear history: ${error.message}`);
                });
        }
    }

    // NEW function to add time to the countdown
    function addTime(minutesToAdd) {
        if (!state.isTimerActive) return; // Can only add if active/paused
        // Send addTime command to worker
        sendWorkerCommand('addTime', { minutesToAdd });
        // Actual time update comes from worker 'tick' message
    }

    // NEW: Handle Volume Change
    function handleVolumeChange(event) {
        state.volume = parseFloat(event.target.value);
        // Save volume to localStorage
        localStorage.setItem('timeSpent_volume', state.volume);
        console.log("Volume changed to:", state.volume);
    }

    // NEW: Handle Break Toggle Change
    function handleBreakToggleChange(event) {
        state.includeBreaksInMetrics = event.target.checked;
        // Save preference to localStorage
        localStorage.setItem('timeSpent_includeBreaks', JSON.stringify(state.includeBreaksInMetrics));
        console.log("Include breaks in metrics:", state.includeBreaksInMetrics);
        renderHistory(); // Re-render everything to reflect the change
    }

    // --- Functions Sending Commands to Worker ---
    function sendWorkerCommand(command, data = {}) {
        if (!timerWorker) {
            console.error("Timer Worker not available.");
            return; 
        }
        timerWorker.postMessage({ command, data });
    }

    function disableInputs() {
        elements.customTimeInput.disabled = true;
        elements.sessionDescriptionInput.disabled = true;
        elements.presetButtons.forEach(btn => btn.disabled = true);
        elements.sessionDescriptionInput.classList.add('timer-active-style'); // Add class for styling
        elements.presetTagsContainer.classList.add('hidden'); // Hide preset tags
    }

    function enableInputs() {
        elements.customTimeInput.disabled = false;
        elements.sessionDescriptionInput.disabled = false;
        elements.presetButtons.forEach(btn => btn.disabled = false);
        elements.sessionDescriptionInput.classList.remove('timer-active-style'); // Remove class
        elements.presetTagsContainer.classList.remove('hidden'); // Show preset tags
    }

    // Triggered by worker sending 'completed' message
    function handleWorkerCompletion() {
        // Timer reached zero naturally
        const completedDuration = Math.floor(state.initialDurationSet / 60);
        saveCurrentSessionToHistory(completedDuration); // Save with full duration

        // Worker should have already stopped interval
        state.isTimerActive = false;
        state.isTimerPaused = false;
        enableInputs();
        updateButtonStates();
        // Display should already be 00:00 from last worker tick
        // Reset display time to initial for next run
        state.currentDisplayMinutes = Math.floor(state.initialDurationSet / 60);
        state.currentDisplaySeconds = state.initialDurationSet % 60;
        updateCountdownDisplay(); // Show initial time again
        // Clear session data
        state.currentSessionDescription = '';
        state.currentSessionTags = [];
        elements.sessionDescriptionInput.value = '';
        
        showCompletionNotification(); // Show notification/alert
    }

    // Extracted history saving logic
    function saveCurrentSessionToHistory(durationMinutes) {
        const description = state.currentSessionDescription;
        const tags = state.currentSessionTags;
        const now = new Date();
        const endTime = now.toISOString(); // Capture end time *now*
        const startTime = new Date(now.getTime() - durationMinutes * 60 * 1000).toISOString(); // Estimate start time based on end time

        if (description && durationMinutes > 0) {
             const localId = `local_${Date.now()}`; // Generate local ID
             const historyEntry = {
                id: localId, // Use local ID initially
                description: description,
                tags: tags,
                duration: durationMinutes,
                start_time: startTime, // Use estimated start time
                end_time: endTime       // Use current end time
            };
            // Prepend to local state immediately for responsiveness
            state.history.unshift(historyEntry); 
            
            // Save to backend (passing the *intended* data including local ID for potential reference)
            saveHistoryToBackend(historyEntry); 
            
            // Update local storage
            saveHistoryToLocalStorage(); 
            
            // Re-render everything
            renderHistory(); 
        } else {
             console.log("Completion triggered but no description or duration=0, not saving history.");
        }
    }
    
    // Extracted notification/alert logic
    function showCompletionNotification() {
        const notificationMessage = 'Time\'s up!';
        if ('Notification' in window && Notification.permission === 'granted') {
             try {
                new Notification('TimeSpent', { body: notificationMessage, icon: '/favicon.ico' });
            } catch (err) {
                console.error('Error showing notification:', err);
                alert(notificationMessage); // Fallback to alert if Notification fails
            }
        } else {
            // Fallback to alert if permission not granted or API not supported
            alert(notificationMessage);
        }
    }

    // NEW: Function to delete a specific history entry
    function deleteHistoryEntryFromBackend(entryId) {
        // Prevent deleting local_ entries that haven't been confirmed by backend yet?
        // Could check if entryId is numeric string or starts with 'local_'
        if (typeof entryId === 'string' && entryId.startsWith('local_')) {
            console.warn('Attempted to delete an entry not yet confirmed by backend.');
            // Optionally allow deletion or show a message
            // return; 
        }
        
        console.log(`Attempting to delete history entry ID: ${entryId}`);
        
        fetch(`/api/history/${entryId}`, { 
            method: 'DELETE' 
        })
        .then(response => {
            if (!response.ok) {
                // Try to get error details from response body
                return response.json().then(err => { 
                    throw new Error(err.error || `HTTP error! status: ${response.status}`);
                }).catch(() => {
                    // Fallback if no JSON error message
                    throw new Error(`HTTP error! status: ${response.status}`);
                });
            }
            return response.json(); // Expecting { message: "..." } on success
        })
        .then(data => {
            console.log("Delete successful on backend:", data.message);
            
            // Find the index of the item to remove in local state
            // Ensure type consistency for comparison (e.g., if entryId is number, state IDs might be too)
            const idToDelete = Number.isInteger(entryId) ? entryId : String(entryId);
            const indexToRemove = state.history.findIndex(item => item.id === idToDelete);
            
            if (indexToRemove > -1) {
                // Remove item from local state
                state.history.splice(indexToRemove, 1);
                // Update local storage
                saveHistoryToLocalStorage();
                // Re-render the history section to reflect the change
                renderHistory(); 
                console.log(`Entry ${entryId} removed from local state and UI updated.`);
            } else {
                console.warn(`Entry ${entryId} not found in local state after successful deletion.`);
                 // Still re-render in case of discrepancy
                renderHistory();
            }
        })
        .catch(error => {
            console.error(`Error deleting history entry ID ${entryId}:`, error);
            alert(`Failed to delete entry: ${error.message}`);
        });
    }

    // Initialize the app
    init();
});
