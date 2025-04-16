document.addEventListener('DOMContentLoaded', function() {
    // App State
    const state = {
        countdownRunning: false,
        paused: false, // Added state to track pause
        countdownInterval: null,
        countdownMinutes: 25,
        countdownSeconds: 0,
        totalSecondsDuration: 25 * 60,
        currentSessionDescription: '', // Store description for the current session
        currentSessionTags: [], // Store tags for the current session
        history: [],
        activeFilterTag: null, // Added for filtering history
        volume: 0.5 // Default volume (0.0 to 1.0)
    };

    const MAX_MINUTES = 180; // Define max allowed minutes
    const SOUND_FILE = '/531030__creeeeak__bell9.wav'; // Updated sound file path

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
        volumeSlider: document.getElementById('volume-slider') // Slider input
    };

    // Initialize the app
    function init() {
        // Load volume from localStorage
        const savedVolume = localStorage.getItem('timeSpent_volume');
        if (savedVolume !== null) {
            state.volume = parseFloat(savedVolume);
        }
        elements.volumeSlider.value = state.volume; // Set slider position

        loadHistoryFromBackend();
        setCountdownLength(state.countdownMinutes);
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
                if (!state.countdownRunning && !state.paused) { // Only allow preset change if fully stopped
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
    }

    // Update Button Visibility and Text based on State
    function updateButtonStates() {
        const isRunningOrPaused = state.countdownRunning || state.paused;

        // Timer Controls
        elements.startButton.classList.toggle('hidden', isRunningOrPaused);
        elements.pauseButton.classList.toggle('hidden', !isRunningOrPaused);
        elements.taskCompletedButton.classList.toggle('hidden', !isRunningOrPaused);
        elements.resetButton.classList.remove('hidden'); // Reset is always visible

        // Add Time Controls Container Visibility
        elements.addTimeControls.classList.toggle('hidden', !isRunningOrPaused);

        if (state.paused) {
            elements.pauseButton.textContent = 'Resume';
        } else {
            elements.pauseButton.textContent = 'Pause';
        }
    }

    // Countdown Functions
    function updateCountdownDisplay() {
        const minutes = String(state.countdownMinutes).padStart(2, '0');
        const seconds = String(state.countdownSeconds).padStart(2, '0');
        elements.timeDisplay.textContent = `${minutes}:${seconds}`;
        document.title = `${minutes}:${seconds} - TimeSpent`;
    }

    function updateCountdownLengthFromInput() {
        if (state.countdownRunning || state.paused) return; // Don't allow change if running or paused
        let minutes = parseInt(elements.customTimeInput.value);
        if (isNaN(minutes) || minutes < 1) minutes = 1;
        if (minutes > 120) minutes = 120;
        elements.customTimeInput.value = minutes;
        setCountdownLength(minutes);
        elements.presetButtons.forEach(b => b.classList.remove('active'));
    }

    function setCountdownLength(minutes) {
        if (state.countdownRunning || state.paused) return;
        state.countdownMinutes = minutes;
        state.countdownSeconds = 0;
        state.totalSecondsDuration = minutes * 60;
        updateCountdownDisplay();
    }

    function startCountdown() {
        if (state.countdownRunning || state.paused) return; // Prevent starting if already running/paused

        const description = elements.sessionDescriptionInput.value.trim();
        if (!description) {
            alert('Please enter what you are working on before starting.');
            elements.sessionDescriptionInput.focus();
            return;
        }

        if (state.countdownMinutes === 0 && state.countdownSeconds === 0) {
            state.countdownMinutes = Math.floor(state.totalSecondsDuration / 60);
            state.countdownSeconds = state.totalSecondsDuration % 60;
            if (state.countdownMinutes === 0 && state.countdownSeconds === 0) {
                alert('Please set a countdown duration.');
                return; // Don't start if duration is 0
            }
        }

        state.currentSessionDescription = description;
        state.currentSessionTags = extractHashtags(description);
        state.countdownRunning = true;
        state.paused = false;

        // Disable inputs
        elements.customTimeInput.disabled = true;
        elements.sessionDescriptionInput.disabled = true;
        elements.presetButtons.forEach(btn => btn.disabled = true);

        updateButtonStates(); // Show Pause, Complete, hide Start
        state.countdownInterval = setInterval(updateCountdown, 1000);
    }

    function togglePause() {
        if (!state.countdownRunning && !state.paused) return; // Do nothing if stopped

        if (state.paused) {
            // Resume
            state.paused = false;
            state.countdownRunning = true;
            state.countdownInterval = setInterval(updateCountdown, 1000);
            // Keep inputs disabled
        } else {
            // Pause
            state.paused = true;
            state.countdownRunning = false;
            clearInterval(state.countdownInterval);
            // Keep inputs disabled
        }
        updateButtonStates(); // Update button text (Pause/Resume)
    }

    // NEW function to handle completion
    function handleTaskCompleted() {
        if (!state.countdownRunning && !state.paused) return; // Can only complete if running or paused

        clearInterval(state.countdownInterval);
        state.countdownRunning = false;
        state.paused = false;

        const remainingSeconds = state.countdownMinutes * 60 + state.countdownSeconds;
        const elapsedSeconds = state.totalSecondsDuration - remainingSeconds;
        const elapsedDuration = Math.max(1, Math.ceil(elapsedSeconds / 60));

        const completedDescription = state.currentSessionDescription;
        const completedTags = state.currentSessionTags;

        // Add to history locally and save to backend
        if (completedDescription && elapsedDuration > 0) {
            const historyEntry = {
                // Use locally generated ID for immediate rendering key
                id: `local_${Date.now()}`,
                description: completedDescription,
                tags: completedTags,
                duration: elapsedDuration,
                // Use created_at field name to match backend/render logic
                created_at: new Date().toISOString() 
            };

            // Add to the beginning for immediate visibility
            state.history.unshift(historyEntry); 
            
            saveHistoryToBackend(historyEntry); // Send to backend
            saveHistoryToLocalStorage(); // Save updated history locally
            renderHistory(); // Re-render immediately
        }

        // Reset the UI fully
        internalReset(false); 
        updateButtonStates();
    }

    // Renamed original reset function to internalReset
    function internalReset(showAlert = true) {
        clearInterval(state.countdownInterval);
        state.countdownRunning = false;
        state.paused = false;

        // Reset timer to the initial duration set by input/presets
        state.countdownMinutes = Math.floor(state.totalSecondsDuration / 60);
        state.countdownSeconds = state.totalSecondsDuration % 60;

        // Re-enable inputs
        elements.customTimeInput.disabled = false;
        elements.sessionDescriptionInput.disabled = false;
        elements.sessionDescriptionInput.value = '';
        elements.presetButtons.forEach(btn => btn.disabled = false);

        // Clear temporary session data
        state.currentSessionDescription = '';
        state.currentSessionTags = [];

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
        if (state.countdownMinutes === 0 && state.countdownSeconds === 1) {
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
        if (state.countdownSeconds > 0) {
            state.countdownSeconds--;
        } else if (state.countdownMinutes > 0) {
            state.countdownMinutes--;
            state.countdownSeconds = 59;
        } else {
            countdownCompleted(); // Timer reached zero
            return;
        }
        updateCountdownDisplay();
    }

    // Modified: Timer hitting zero NOW ALSO saves history
    function countdownCompleted() {
        clearInterval(state.countdownInterval);
        state.countdownRunning = false;
        state.paused = false;

        // Sound is played in updateCountdown

        // --- Save History Logic (Added Back) ---
        const completedDescription = state.currentSessionDescription;
        const completedTags = state.currentSessionTags;
        // When timer completes naturally, duration is the total initially set duration
        alert('Time\'s up!');

        // Reset the UI fully, without saving
        internalReset(false); // Reset without alert
        updateButtonStates(); // Update buttons
    }

    function getCountdownDuration() {
        // This might not be needed anymore as we calculate elapsed time
        return Math.floor(state.totalSecondsDuration / 60);
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

    // Removed Task Management Functions

    // Rendering Functions
    function formatDateHeader(date) {
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        today.setHours(0, 0, 0, 0);
        yesterday.setHours(0, 0, 0, 0);
        date.setHours(0, 0, 0, 0);

        if (date.getTime() === today.getTime()) {
            return 'Today';
        }
        if (date.getTime() === yesterday.getTime()) {
            return 'Yesterday';
        }
        return date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    }

    function renderHistory() {
        if (!elements.historyList || !elements.historyMetricsContainer) return;

        // 1. Render Filter Tags (independent of filtering)
        renderFilterTags();

        // 2. Filter History based on active tag
        const filteredHistory = state.activeFilterTag
            ? state.history.filter(entry => entry.tags && entry.tags.includes(state.activeFilterTag))
            : state.history; 

        // 3. Calculate Metrics for Today
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        let totalTimeToday = 0;
        let sessionsToday = 0;

        state.history.forEach(entry => {
            // Use created_at for metrics calculation
            const entryDate = new Date(entry.created_at); 
            entryDate.setHours(0, 0, 0, 0);
            if (!isNaN(entryDate.getTime()) && entryDate.getTime() === today.getTime()) { // Check date validity here too
                totalTimeToday += entry.duration;
                sessionsToday++;
            }
        });

        // 4. Render Metrics
        elements.historyMetricsContainer.innerHTML = `
            <div class="metric-item">
                <span class="metric-value">${sessionsToday}</span>
                <span class="metric-label">Sessions Today</span>
            </div>
            <div class="metric-item">
                <span class="metric-value">${totalTimeToday} min</span>
                <span class="metric-label">Total Time Today</span>
            </div>
        `;

        // 5. Group Filtered History by Day and Render
        elements.historyList.innerHTML = ''; // Clear previous list
        if (filteredHistory.length === 0) {
            const message = state.activeFilterTag 
                ? `No sessions found with tag #${state.activeFilterTag}.`
                : 'No completed sessions yet.';
            elements.historyList.innerHTML = `<div class="no-tasks">${message}</div>`;
            return;
        }

        // Use created_at for sorting
        const sortedHistory = [...filteredHistory].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        
        let currentDay = null;
        sortedHistory.forEach(entry => {
            // --- Robust Date Parsing using created_at --- 
            const entryDateObj = new Date(entry.created_at);
            if (isNaN(entryDateObj.getTime())) {
                console.error("Invalid date encountered in history:", entry.created_at, entry);
                return; // Skip this iteration
            }
            // --- Use entryDateObj for all date operations below --- 

            const entryDay = entryDateObj.toDateString(); // Use simple date string for comparison

            // Check if day changed, insert header if needed
            if (entryDay !== currentDay) {
                currentDay = entryDay;
                const dateHeader = document.createElement('div');
                dateHeader.classList.add('history-date-header');
                dateHeader.textContent = formatDateHeader(entryDateObj); // Use parsed date object
                elements.historyList.appendChild(dateHeader);
            }

            // Render the history item itself 
            // Use entryDateObj for formatting
            const formattedDate = entryDateObj.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) +
                                  ' ' + entryDateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); 
            
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
                        <span class="duration-time">${entry.duration} min · ${formattedDate}</span>
                    </div>
                </div>
            `;
            historyElement.querySelectorAll('.filterable-tag').forEach(tagEl => {
                tagEl.addEventListener('click', (e) => {
                    e.stopPropagation(); 
                    applyHistoryFilter(tagEl.dataset.tag);
                });
            });
            elements.historyList.appendChild(historyElement);
        });
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
                tags: entry.tags.join(',') // Send tags as comma-separated string
            })
        })
        .then(response => {
            if (!response.ok) {
                console.error('Failed to save history to backend:', response.statusText);
            }
            return response.json();
        })
        .then(savedEntry => {
            console.log('History saved:', savedEntry);
            // Optionally update local entry ID with backend ID if needed
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
                state.history = data.map(item => ({ ...item, tags: item.tags || [] }));
                saveHistoryToLocalStorage(); // Sync local storage
                renderHistory(); // <<< Render AFTER data is loaded and processed
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
                     tags: item.tags || [] // Ensure tags is an array on load
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
        if (!state.countdownRunning && !state.paused) return; // Only add time if running or paused

        // Calculate current total seconds remaining
        let currentTotalSeconds = state.countdownMinutes * 60 + state.countdownSeconds;
        
        // Calculate new total seconds (including added time)
        let newTotalSeconds = currentTotalSeconds + minutesToAdd * 60;
        
        // Calculate new total duration (initial + added)
        let newTotalDurationSeconds = state.totalSecondsDuration + minutesToAdd * 60;
        
        // Prevent exceeding max minutes for both remaining time and total duration
        if ((newTotalDurationSeconds / 60) > MAX_MINUTES) {
            alert(`Cannot add time, maximum countdown duration is ${MAX_MINUTES} minutes.`);
            return;
        }

        // Update state for remaining time
        state.countdownMinutes = Math.floor(newTotalSeconds / 60);
        state.countdownSeconds = newTotalSeconds % 60;

        // Update total duration state (important for elapsed time calculation)
        state.totalSecondsDuration = newTotalDurationSeconds;

        // Update display
        updateCountdownDisplay();
        console.log(`Added ${minutesToAdd} minutes. New duration: ${state.totalSecondsDuration / 60}m. New remaining: ${state.countdownMinutes}m ${state.countdownSeconds}s`);
    }

    // NEW: Handle Volume Change
    function handleVolumeChange(event) {
        state.volume = parseFloat(event.target.value);
        // Save volume to localStorage
        localStorage.setItem('timeSpent_volume', state.volume);
        console.log("Volume changed to:", state.volume);
        // Optional: Play a short sound snippet for feedback? Maybe too much.
    }

    // Initialize the app
    init();
});