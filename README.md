# TimeSpent

A modern web application to track time spent on tasks, with a focus timer and history tracking.

## Features

- Set a timer for focused work periods
- Track tasks with descriptions
- Tag tasks with categories (e.g., #ML, #Coding)
- View history of completed tasks
- Filter task history by tags
- Timezone support (default: AEST - Australia/Sydney)
- Modern, responsive UI

## Setup

### Prerequisites

- Python 3.12 or higher

### Installation

1. Clone this repository:

```bash
git clone https://github.com/yourusername/timespent.git
cd timespent
```

2. Create and activate a virtual environment:

```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. Install dependencies:

```bash
pip install -e .
```

### Running the Application

1. Start the Flask development server:

```bash
python app.py
```

2. Open your browser and navigate to:

```
http://127.0.0.1:5000
```

## Usage

1. Set a timer by entering the number of minutes and a task description
2. Use hashtags in your task description to add categories (e.g., "#ML Learning RoPE")
3. Start the timer and focus on your task
4. When the timer completes or you stop it manually, the task will be saved to your history
5. View your task history and filter by tags using the dropdown selector
6. Click on tags to quickly filter by that tag
7. Set your preferred timezone from the dropdown in the header

## Data Storage

Tasks are stored in a local SQLite database (`timespent.db`).

## Browser Support

For the best experience, use a modern browser like Chrome, Firefox, Safari, or Edge.

## License

MIT
