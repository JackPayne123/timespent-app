from flask import Flask, render_template, request, jsonify, send_from_directory
from supabase import create_client, Client
from dotenv import load_dotenv
import os

# Load environment variables from .env file
load_dotenv()

app = Flask(__name__)

# Initialize Supabase client
url: str = os.environ.get("SUPABASE_URL")
key: str = os.environ.get("SUPABASE_KEY")

if not url or not key:
    raise ValueError("Supabase URL and Key must be set in environment variables.")

supabase: Client = create_client(url, key)

# Function to read the version file
def get_git_version():
    try:
        # Assumes .version file is in the root directory where app.py runs
        version_file_path = os.path.join(app.root_path, '.version')
        with open(version_file_path, 'r') as f:
            return f.read().strip()
    except FileNotFoundError:
        return 'unknown' # Fallback if file doesn't exist
    except Exception as e:
        print(f"Error reading version file: {e}")
        return 'error'

# Inject version into all template contexts
@app.context_processor
def inject_version():
    return dict(git_version=get_git_version())

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/favicon.ico')
def favicon():
    return send_from_directory(os.path.join(app.root_path, 'static'),
                               'favicon.ico', mimetype='image/vnd.microsoft.icon')

# Route to serve the specific sound file from the root directory
@app.route('/<path:filename>')
def serve_root_file(filename):
    if filename == "531030__creeeeak__bell9.wav":
        return send_from_directory(app.root_path, filename, mimetype='audio/wav')
    else:
        # Optionally handle other root files or return 404
        return "File not found", 404

# API Endpoint to get all history entries from Supabase
@app.route('/api/history', methods=['GET'])
def get_history():
    try:
        # Select all columns including the new start_time and end_time
        # Order by start_time descending (or created_at if you prefer)
        response = supabase.table('history').select("*").order('start_time', desc=True).execute()

        # Convert comma-separated tags back to list and ensure times are included
        data = []
        for entry in response.data:
            if entry.get('tags') and isinstance(entry['tags'], str):
                entry['tags'] = entry['tags'].split(',')
            elif not entry.get('tags'): # Handle potential null tags
                entry['tags'] = []
            # Ensure start_time and end_time are present (even if null)
            entry['start_time'] = entry.get('start_time')
            entry['end_time'] = entry.get('end_time')
            data.append(entry)

        return jsonify(data)
    except Exception as e:
        print(f"Error fetching history: {e}")
        return jsonify({'error': 'Failed to fetch history'}), 500

# API Endpoint to add a new history entry to Supabase
@app.route('/api/history', methods=['POST'])
def add_history_entry():
    data = request.json
    description = data.get('description')
    duration = data.get('duration')
    # Tags are expected as a comma-separated string from JS
    tags_string = data.get('tags')
    # Get start_time and end_time from the request
    start_time = data.get('start_time')
    end_time = data.get('end_time')

    # Basic validation
    if not description or duration is None or not start_time or not end_time:
        # end_time can be null if timer completes naturally, but we expect it from JS now
        # let's require all for now based on JS implementation
        missing_fields = []
        if not description: missing_fields.append('description')
        if duration is None: missing_fields.append('duration')
        if not start_time: missing_fields.append('start_time')
        if not end_time: missing_fields.append('end_time') # If allowing null end_time, remove this check
        return jsonify({'error': f'Missing fields: {", ".join(missing_fields)}'}), 400

    try:
        # Insert data including start_time and end_time into Supabase 'history' table
        insert_data = {
            'description': description,
            'duration': duration,
            'tags': tags_string if tags_string else None,
            'start_time': start_time, # Assumes JS sends ISO 8601 string
            'end_time': end_time       # Assumes JS sends ISO 8601 string
        }
        response = supabase.table('history').insert(insert_data).execute()

        if len(response.data) > 0:
             # Convert tags back to list and include times before sending response
            new_entry = response.data[0]
            if new_entry.get('tags') and isinstance(new_entry['tags'], str):
                new_entry['tags'] = new_entry['tags'].split(',')
            elif not new_entry.get('tags'):
                new_entry['tags'] = []
            # Ensure times are included in the response
            new_entry['start_time'] = new_entry.get('start_time')
            new_entry['end_time'] = new_entry.get('end_time')
            return jsonify(new_entry), 201
        else:
             raise Exception("Insert operation returned no data")

    except Exception as e:
        print(f"Error adding history: {e}")
        return jsonify({'error': 'Failed to add history entry'}), 500

# API Endpoint to delete all history entries from Supabase
@app.route('/api/history', methods=['DELETE'])
def delete_all_history():
    try:
        # Delete all rows. Use a filter that always matches (e.g., id > 0 if id exists and is positive)
        # Or more simply, delete without a filter if RLS allows.
        # Assuming RLS allows, delete everything.
        # A filter like `neq` on a dummy value is often used if a filter is mandatory.
        response = supabase.table('history').delete().neq('id', -1).execute() # Example: delete where id is not -1 (effectively all)
        
        # The response structure for delete might vary, check supabase-py docs if needed
        # For now, assume success if no exception
        print(f"Delete response: {response}") # Log response for debugging
        # Determine number of rows affected if possible/needed from response
        
        return jsonify({'message': f'Successfully deleted history entries.'}), 200
    except Exception as e:
        print(f"Error deleting history: {e}")
        return jsonify({'error': 'Failed to delete history'}), 500

# API Endpoint to delete a SPECIFIC history entry by ID
@app.route('/api/history/<int:entry_id>', methods=['DELETE'])
def delete_specific_history_entry(entry_id):
    if not entry_id:
        return jsonify({'error': 'Missing entry ID'}), 400
    
    try:
        # Attempt to delete the specific entry by its ID
        response = supabase.table('history').delete().eq('id', entry_id).execute()
        
        # Check if any data was returned/affected (might depend on Supabase client version/settings)
        # A successful delete might return an empty data list or specific confirmation.
        # For simplicity, we'll assume success if no exception is raised and potentially check affected rows if available.
        # Supabase python client `delete` might not return the deleted data, 
        # and `count` might not be directly in the response object in v1/v2? Checking is tricky.
        # Let's rely on the fact that if `eq('id', entry_id)` doesn't find a match, 
        # it shouldn't error, but also won't delete anything. We assume frontend provides valid IDs.
        
        print(f"Delete response for ID {entry_id}: {response}") # Log response for debugging

        # If the deletion was technically successful (no error) even if 0 rows affected
        # (e.g., ID didn't exist), return success. The frontend state handles the actual list.
        return jsonify({'message': f'Attempted deletion for entry ID {entry_id}.'}), 200
        
    except Exception as e:
        print(f"Error deleting history entry ID {entry_id}: {e}")
        # Be more specific if possible (e.g., distinguish not found vs. server error)
        return jsonify({'error': f'Failed to delete history entry ID {entry_id}'}), 500

# API Endpoint to filter history entries by tag from Supabase
# Note: This route is likely redundant now as filtering is done client-side
# You might consider removing it unless you want server-side tag filtering.
# If keeping, it should also select and return start_time/end_time.
@app.route('/api/history/filter', methods=['GET'])
def filter_history():
    tag_query = request.args.get('tag')
    try:
        # Update query to select all fields and order by start_time
        query = supabase.table('history').select("*").order('start_time', desc=True)
        if tag_query:
            # Use Supabase `like` or `ilike` for case-insensitive search on the tags string
            # Adjust based on how tags are stored if they are an array type in PG
            query = query.like('tags', f'%{tag_query}%') # Assumes comma-separated string

        response = query.execute()

        # Convert tags to list and include times
        data = []
        for entry in response.data:
            if entry.get('tags') and isinstance(entry['tags'], str):
                entry['tags'] = entry['tags'].split(',')
            elif not entry.get('tags'):
                entry['tags'] = []
            # Ensure start_time and end_time are present
            entry['start_time'] = entry.get('start_time')
            entry['end_time'] = entry.get('end_time')
            data.append(entry)

        return jsonify(data)
    except Exception as e:
        print(f"Error filtering history: {e}")
        return jsonify({'error': 'Failed to filter history'}), 500

if __name__ == '__main__':
    # Use port from environment variable for deployment flexibility
    port = int(os.environ.get("PORT", 5000))
    app.run(debug=False, host='0.0.0.0', port=port) # Use 0.0.0.0 for deployment, remove debug=True 