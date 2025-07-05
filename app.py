from flask import Flask, request, jsonify, session, send_from_directory
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime
import re
import os

app = Flask(__name__)
app.config['SECRET_KEY'] = 'your-very-secret-key'  # Change this in production!
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///chatbot.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)
login_manager = LoginManager(app)
CORS(app, supports_credentials=True)

# Models
class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(128), nullable=False)
    chats = db.relationship('Chat', backref='user', lazy=True)

class Chat(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    user_message = db.Column(db.Text, nullable=False)
    ai_message = db.Column(db.Text, nullable=False)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

# Input validation helpers
def is_valid_email(email):
    return re.match(r"[^@]+@[^@]+\.[^@]+", email)

def is_valid_username(username):
    return re.match(r"^[A-Za-z0-9_]{3,32}$", username)

# Routes
@app.route('/signup', methods=['GET'])
def signup_form():
    return '''
    <form method="post" action="/signup">
        <input type="text" name="username" placeholder="Username" required><br>
        <input type="email" name="email" placeholder="Email" required><br>
        <input type="password" name="password" placeholder="Password" required><br>
        <button type="submit">Sign Up</button>
    </form>
    '''

@app.route('/login', methods=['GET'])
def login_form():
    return '''
    <form method="post" action="/login">
        <input type="text" name="username" placeholder="Username" required><br>
        <input type="password" name="password" placeholder="Password" required><br>
        <button type="submit">Login</button>
    </form>
    '''

@app.route('/signup', methods=['POST'])
def signup():
    if request.is_json:
        data = request.get_json()
        username = data.get('username', '').strip()
        email = data.get('email', '').strip().lower()
        password = data.get('password', '')
    else:
        username = request.form.get('username', '').strip()
        email = request.form.get('email', '').strip().lower()
        password = request.form.get('password', '')

    # Fix: Accept usernames with spaces and common characters for form-based signup
    if not (username and email and password):
        return jsonify({'error': 'All fields are required.'}), 400 if request.is_json else 'All fields are required!'
    if request.is_json:
        if not is_valid_username(username):
            return jsonify({'error': 'Invalid username.'}), 400
    # For form-based signup, allow more flexible usernames
    if not is_valid_email(email):
        return jsonify({'error': 'Invalid email address.'}), 400 if request.is_json else 'Invalid email!'
    if len(password) < 6:
        return jsonify({'error': 'Password must be at least 6 characters.'}), 400 if request.is_json else 'Password too short!'

    if User.query.filter((User.username == username) | (User.email == email)).first():
        return jsonify({'error': 'Username or email already exists.'}), 409 if request.is_json else 'Username or email exists!'

    user = User(
        username=username,
        email=email,
        password_hash=generate_password_hash(password)
    )
    db.session.add(user)
    db.session.commit()
    # Show popup and redirect to index.html
    if request.is_json:
        return jsonify({'message': 'User registered successfully.'}), 201
    else:
        return '''<script>alert('Signup successful! Please log in.'); window.location.href='/index.html';</script>'''

@app.route('/login', methods=['POST'])
def login():
    if request.is_json:
        data = request.get_json()
        username = data.get('username', '').strip()
        password = data.get('password', '')
    else:
        username = request.form.get('username', '').strip()
        password = request.form.get('password', '')

    user = User.query.filter_by(username=username).first()
    if user and check_password_hash(user.password_hash, password):
        login_user(user)
        if request.is_json:
            return jsonify({'message': 'Login successful.'}), 200
        else:
            return '''<script>alert('Login successful!'); window.location.href='/index.html';</script>'''
    return jsonify({'error': 'Invalid credentials.'}), 401 if request.is_json else 'Invalid credentials!'

@app.route('/logout', methods=['POST'])
@login_required
def logout():
    logout_user()
    return jsonify({'message': 'Logged out successfully.'}), 200

@app.route('/chat', methods=['POST'])
@login_required
def save_chat():
    data = request.get_json()
    user_message = data.get('user_message', '').strip()
    ai_message = data.get('ai_message', '').strip()

    if not user_message or not ai_message:
        return jsonify({'error': 'Both user_message and ai_message are required.'}), 400

    chat = Chat(
        user_id=current_user.id,
        user_message=user_message,
        ai_message=ai_message
    )
    db.session.add(chat)
    db.session.commit()
    return jsonify({'message': 'Chat saved.'}), 201

@app.route('/chats', methods=['GET'])
@login_required
def get_chats():
    chats = Chat.query.filter_by(user_id=current_user.id).order_by(Chat.timestamp.desc()).all()
    chat_list = [
        {
            'id': chat.id,
            'user_message': chat.user_message,
            'ai_message': chat.ai_message,
            'timestamp': chat.timestamp.isoformat()
        }
        for chat in chats
    ]
    return jsonify({'chats': chat_list}), 200

@app.route('/')
def serve_index():
    return send_from_directory(os.path.abspath(os.path.dirname(__file__)), 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory(os.path.abspath(os.path.dirname(__file__)), path)

@app.route('/signup.html')
def serve_signup_html():
    return send_from_directory(os.path.abspath(os.path.dirname(__file__)), 'signup.html')

@app.route('/login.html')
def serve_login_html():
    return send_from_directory(os.path.abspath(os.path.dirname(__file__)), 'login.html')

# Error handlers
@app.errorhandler(400)
def bad_request(e):
    return jsonify({'error': 'Bad request.'}), 400

@app.errorhandler(401)
def unauthorized(e):
    return jsonify({'error': 'Unauthorized.'}), 401

@app.errorhandler(404)
def not_found(e):
    return jsonify({'error': 'Not found.'}), 404

@app.errorhandler(500)
def server_error(e):
    return jsonify({'error': 'Server error.'}), 500

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    app.run(debug=True)
