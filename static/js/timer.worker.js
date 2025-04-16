let minutes = 25;
let seconds = 0;
let intervalId = null;
let running = false;
let paused = false;
let initialTotalSecondsDuration = 25 * 60;

// Helper function to post messages back to the main thread
function post(messageType, data = {}) {
    self.postMessage({ type: messageType, ...data });
}

function tick() {
    if (!running || paused) return; // Should not happen if interval is managed correctly

    // Check if sound should play (1 second before end)
    if (minutes === 0 && seconds === 1) {
        post('playSound');
    }

    // Decrement time
    if (seconds > 0) {
        seconds--;
    } else if (minutes > 0) {
        minutes--;
        seconds = 59;
    } else {
        // Timer completed
        stopTimer();
        post('completed');
        return; // Stop further execution for this tick
    }

    // Post current time back to main thread
    post('tick', { minutes, seconds });
}

function startTimer(durationSeconds) {
    if (running) return; // Already running

    initialTotalSecondsDuration = durationSeconds;
    minutes = Math.floor(durationSeconds / 60);
    seconds = durationSeconds % 60;
    running = true;
    paused = false;

    // Post initial time immediately
    post('tick', { minutes, seconds }); 

    // Start the interval
    if (intervalId) clearInterval(intervalId);
    intervalId = setInterval(tick, 1000);
    post('started');
}

function stopTimer() {
    running = false;
    paused = false;
    if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
    }
    // Don't reset time here, reset command handles that
    post('stopped');
}

function pauseTimer() {
    if (!running || paused) return;
    paused = true;
    if (intervalId) { // Technically interval should still run but tick checks pause
        // No need to clear interval here, tick handles pause state
    }
     post('paused');
}

function resumeTimer() {
    if (!running || !paused) return;
    paused = false;
    // Interval should still be active
    post('resumed');
}

function resetTimer(durationSeconds) {
    stopTimer();
    initialTotalSecondsDuration = durationSeconds;
    minutes = Math.floor(durationSeconds / 60);
    seconds = durationSeconds % 60;
    post('resetComplete', { minutes, seconds });
    post('tick', { minutes, seconds }); // Send reset time
}

function addTimeToTimer(minutesToAdd) {
     if (!running && !paused) return; // Only add if active or paused

     let currentTotalSeconds = minutes * 60 + seconds;
     let newTotalSeconds = currentTotalSeconds + minutesToAdd * 60;
     // Also update the perceived total duration if needed (e.g., for elapsed calculation)
     initialTotalSecondsDuration += minutesToAdd * 60;

     // TODO: Add MAX_MINUTES check if necessary, requires knowing the limit

     minutes = Math.floor(newTotalSeconds / 60);
     seconds = newTotalSeconds % 60;

     // Send updated time immediately
     post('tick', { minutes, seconds });
     post('timeAdded', { added: minutesToAdd });
}

// Listen for messages from the main thread
self.onmessage = function(event) {
    const { command, data } = event.data;

    // console.log('[Worker] Received command:', command, data);

    switch (command) {
        case 'start':
            startTimer(data.durationSeconds);
            break;
        case 'stop': // Used for task completed or reset
            stopTimer();
            break;
        case 'pause':
            pauseTimer();
            break;
        case 'resume':
            resumeTimer();
            break;
        case 'reset':
            resetTimer(data.durationSeconds);
            break;
        case 'addTime':
            addTimeToTimer(data.minutesToAdd);
            break;
        // Add other commands as needed (e.g., setting initial state)
        default:
            console.warn('[Worker] Unknown command received:', command);
    }
}; 