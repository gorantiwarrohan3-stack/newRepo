"""
Flask API for Prasadam Connect
Handles user registration and login history
"""
import os
from flask import Flask, request, jsonify
from flask_cors import CORS
import firebase_admin
from firebase_admin import credentials, firestore
import re
import ipaddress
import traceback

app = Flask(__name__)

# Configure CORS based on environment
# In production: restrict to trusted origins from environment variable
# In development: allow all origins for easier testing
is_production = os.getenv('FLASK_ENV') != 'development' and os.getenv('ENVIRONMENT', '').lower() != 'development'

if is_production:
    # Production: use trusted origins from environment variable
    trusted_origins_str = os.getenv('TRUSTED_ORIGINS', '')
    if trusted_origins_str:
        # Parse comma-separated list of origins and strip whitespace
        trusted_origins = [origin.strip() for origin in trusted_origins_str.split(',') if origin.strip()]
    else:
        # If TRUSTED_ORIGINS is not set in production, default to empty list (no CORS)
        # This is a security safeguard - production should always specify trusted origins
        trusted_origins = []
        print("WARNING: TRUSTED_ORIGINS not set in production. CORS will be disabled.")
    
    # Configure CORS with trusted origins for production
    CORS(app, 
         origins=trusted_origins,
         methods=['GET', 'POST', 'OPTIONS'],
         allow_headers=['Content-Type', 'Authorization', 'X-Requested-With'],
         supports_credentials=True)
else:
    # Development/Testing: permissive CORS settings
    CORS(app)  # Enable CORS for all routes

# Initialize Firebase Admin SDK
if not firebase_admin._apps:
    # Try to load from environment variable or service account file
    cred_path = os.getenv('GOOGLE_APPLICATION_CREDENTIALS')
    if cred_path and os.path.exists(cred_path):
        cred = credentials.Certificate(cred_path)
    else:
        # Try to load from serviceAccountKey.json in the api directory
        service_account_path = os.path.join(os.path.dirname(__file__), 'serviceAccountKey.json')
        if os.path.exists(service_account_path):
            cred = credentials.Certificate(service_account_path)
        else:
            # Use default credentials (for local development with gcloud auth)
            cred = credentials.ApplicationDefault()
    
    firebase_admin.initialize_app(cred)

db = firestore.client()


def validate_email(email):
    """Validate email format"""
    pattern = r'^[^\s@]+@[^\s@]+\.[^\s@]+$'
    return re.match(pattern, email) is not None


def validate_phone(phone):
    """Validate E.164 phone format"""
    pattern = r'^\+\d{10,15}$'
    return re.match(pattern, phone) is not None


def normalize_phone_for_path(phone):
    """
    Normalize phone number for use in Firestore document path.
    Replaces + with _plus_ to make it safe for document IDs.
    """
    return phone.replace('+', '_plus_')


def normalize_email_for_path(email):
    """
    Normalize email for use in Firestore document path.
    Replaces @ with _at_ and . with _dot_ to make it safe for document IDs.
    """
    return email.lower().replace('@', '_at_').replace('.', '_dot_')


def validate_ip_address(ip_str):
    """
    Validate if a string is a valid IPv4 or IPv6 address.
    
    Args:
        ip_str: String to validate as an IP address
        
    Returns:
        bool: True if valid IP address, False otherwise
    """
    try:
        ipaddress.ip_address(ip_str.strip())
        return True
    except (ValueError, AttributeError):
        return False


def get_client_ip_address():
    """
    Safely extract the client IP address from the request.
    
    This function prioritizes request.remote_addr (which is set by the WSGI server
    and is not spoofable) and only falls back to X-Forwarded-For header when
    behind a trusted proxy/load balancer.
    
    IMPORTANT SECURITY NOTE: The X-Forwarded-For header can be spoofed by clients
    and must ONLY be trusted when:
    - The application is deployed behind a trusted proxy/load balancer
    - The proxy/load balancer strips or overwrites any existing X-Forwarded-For header
    - The application is configured to trust specific proxy IPs (not implemented here
      but should be configured at the deployment/proxy level)
    
    When using X-Forwarded-For:
    - Takes the first (leftmost) IP from the comma-separated list (this is the
      original client IP as seen by the first proxy)
    - Strips whitespace from the IP address
    - Validates the IP address format (IPv4 or IPv6)
    
    Returns:
        str: The client IP address, or 'unknown' if unable to determine
    """
    # Prefer request.remote_addr - this is set by the WSGI server and cannot be
    # spoofed by the client. It represents the direct peer connection.
    if request.remote_addr:
        # Validate it's a proper IP address (defensive programming)
        if validate_ip_address(request.remote_addr):
            return request.remote_addr.strip()
    
    # Fall back to X-Forwarded-For only when behind a trusted proxy
    # WARNING: Only use this if you're behind a trusted proxy/load balancer that
    # strips client-provided X-Forwarded-For headers. In production, configure
    # your proxy to only accept X-Forwarded-For from trusted sources.
    x_forwarded_for = request.headers.get('X-Forwarded-For')
    if x_forwarded_for:
        # X-Forwarded-For can contain multiple IPs: "client, proxy1, proxy2"
        # The first (leftmost) IP is the original client IP
        ips = [ip.strip() for ip in x_forwarded_for.split(',')]
        if ips:
            first_ip = ips[0].strip()
            # Validate the IP address format
            if validate_ip_address(first_ip):
                return first_ip
    
    # If we can't determine a valid IP, return 'unknown'
    return 'unknown'


@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({'status': 'healthy', 'service': 'prasadam-connect-api'}), 200


@app.route('/api/create-user-with-login', methods=['POST'])
def create_user_with_login():
    """
    Atomically create a new user and record their login history in a single transaction.
    This ensures both operations succeed or both fail together.
    Expected JSON body:
    {
        "uid": "firebase-auth-uid",
        "name": "User Name",
        "email": "user@example.com",
        "phoneNumber": "+1234567890",
        "address": "123 Main St, City, State"
    }
    """
    try:
        data = request.get_json()
        
        # Validate required fields
        required_fields = ['uid', 'name', 'email', 'phoneNumber', 'address']
        for field in required_fields:
            if not data.get(field):
                return jsonify({
                    'success': False,
                    'error': f'Missing required field: {field}'
                }), 400
        
        uid = data['uid']
        name = data['name'].strip()
        email = data['email'].strip().lower()
        phone_number = data['phoneNumber'].strip()
        address = data['address'].strip()
        
        # Validate email format
        if not validate_email(email):
            return jsonify({
                'success': False,
                'error': 'Invalid email format'
            }), 400
        
        # Validate phone format
        if not validate_phone(phone_number):
            return jsonify({
                'success': False,
                'error': 'Invalid phone number format. Must be in E.164 format (e.g., +1234567890)'
            }), 400
        
        # Get user agent and IP from request
        user_agent = request.headers.get('User-Agent', 'unknown')
        ip_address = get_client_ip_address()
        
        # Normalize phone and email for marker document paths
        normalized_phone = normalize_phone_for_path(phone_number)
        normalized_email = normalize_email_for_path(email)
        
        # Use Firestore transaction to ensure atomicity
        transaction = db.transaction()
        
        @firestore.transactional
        def create_user_and_login(transaction):
            # Read user document, phone marker, and email marker atomically
            user_ref = db.collection('users').document(uid)
            phone_marker_ref = db.collection('users_by_phone').document(normalized_phone)
            email_marker_ref = db.collection('users_by_email').document(normalized_email)
            
            user_doc = user_ref.get(transaction=transaction)
            phone_marker_doc = phone_marker_ref.get(transaction=transaction)
            email_marker_doc = email_marker_ref.get(transaction=transaction)
            
            # Abort if any document already exists
            if user_doc.exists:
                raise ValueError('User already registered')
            
            if phone_marker_doc.exists:
                raise ValueError('Phone number already registered')
            
            if email_marker_doc.exists:
                raise ValueError('Email already registered')
            
            # Create user document
            user_data = {
                'uid': uid,
                'name': name,
                'email': email,
                'phoneNumber': phone_number,
                'address': address,
                'createdAt': firestore.SERVER_TIMESTAMP,
                'updatedAt': firestore.SERVER_TIMESTAMP,
            }
            transaction.set(user_ref, user_data)
            
            # Create uniqueness marker documents
            phone_marker_data = {
                'uid': uid,
                'phoneNumber': phone_number,
                'createdAt': firestore.SERVER_TIMESTAMP,
            }
            transaction.set(phone_marker_ref, phone_marker_data)
            
            email_marker_data = {
                'uid': uid,
                'email': email,
                'createdAt': firestore.SERVER_TIMESTAMP,
            }
            transaction.set(email_marker_ref, email_marker_data)
            
            # Record login history
            login_data = {
                'uid': uid,
                'phoneNumber': phone_number,
                'timestamp': firestore.SERVER_TIMESTAMP,
                'userAgent': user_agent,
                'ipAddress': ip_address,
            }
            login_ref = db.collection('loginHistory').document()
            transaction.set(login_ref, login_data)
        
        # Execute transaction
        create_user_and_login(transaction)
        
        return jsonify({
            'success': True,
            'message': 'User registered and login recorded successfully',
            'user': {
                'uid': uid,
                'name': name,
                'email': email,
                'phoneNumber': phone_number,
            }
        }), 201
        
    except ValueError as e:
        # Handle validation/duplicate errors from transaction
        # All our ValueError exceptions indicate conflicts (user/phone/email already exists)
        error_msg = str(e)
        return jsonify({
            'success': False,
            'error': error_msg
        }), 409
    except Exception as e:
        # Handle other errors (transaction failures, network issues, etc.)
        print(f"Error in create_user_with_login: {str(e)}")
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': 'Internal server error'
        }), 500


@app.route('/api/register', methods=['POST'])
def register_user():
    """
    Register a new user
    Expected JSON body:
    {
        "uid": "firebase-auth-uid",
        "name": "User Name",
        "email": "user@example.com",
        "phoneNumber": "+1234567890",
        "address": "123 Main St, City, State"
    }
    """
    try:
        data = request.get_json()
        
        # Validate required fields
        required_fields = ['uid', 'name', 'email', 'phoneNumber', 'address']
        for field in required_fields:
            if not data.get(field):
                return jsonify({
                    'success': False,
                    'error': f'Missing required field: {field}'
                }), 400
        
        uid = data['uid']
        name = data['name'].strip()
        email = data['email'].strip().lower()
        phone_number = data['phoneNumber'].strip()
        address = data['address'].strip()
        
        # Validate email format
        if not validate_email(email):
            return jsonify({
                'success': False,
                'error': 'Invalid email format'
            }), 400
        
        # Validate phone format
        if not validate_phone(phone_number):
            return jsonify({
                'success': False,
                'error': 'Invalid phone number format. Must be in E.164 format (e.g., +1234567890)'
            }), 400
        
        # Check if user already exists
        user_ref = db.collection('users').document(uid)
        user_doc = user_ref.get()
        
        if user_doc.exists:
            return jsonify({
                'success': False,
                'error': 'User already registered'
            }), 409
        
        # Check if phone number is already registered
        phone_query = db.collection('users').where('phoneNumber', '==', phone_number).limit(1)
        phone_docs = phone_query.get()
        if phone_docs:
            return jsonify({
                'success': False,
                'error': 'Phone number already registered'
            }), 409
        
        # Check if email is already registered
        email_query = db.collection('users').where('email', '==', email).limit(1)
        email_docs = email_query.get()
        if email_docs:
            return jsonify({
                'success': False,
                'error': 'Email already registered'
            }), 409
        
        # Create user document
        user_data = {
            'uid': uid,
            'name': name,
            'email': email,
            'phoneNumber': phone_number,
            'address': address,
            'createdAt': firestore.SERVER_TIMESTAMP,
            'updatedAt': firestore.SERVER_TIMESTAMP,
        }
        
        user_ref.set(user_data)
        
        return jsonify({
            'success': True,
            'message': 'User registered successfully',
            'user': {
                'uid': uid,
                'name': name,
                'email': email,
                'phoneNumber': phone_number,
            }
        }), 201
        
    except Exception as e:
        print(f"Error in register_user: {str(e)}")
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': 'Internal server error'
        }), 500


@app.route('/api/check-user', methods=['POST'])
def check_user():
    """
    Check if a user exists by phone number
    Expected JSON body:
    {
        "phoneNumber": "+1234567890"
    }
    """
    try:
        data = request.get_json()
        phone_number = data.get('phoneNumber')
        
        if not phone_number:
            return jsonify({
                'success': False,
                'error': 'Phone number is required'
            }), 400
        
        # Validate phone format
        if not validate_phone(phone_number):
            return jsonify({
                'success': False,
                'error': 'Invalid phone number format'
            }), 400
        
        # Check if user exists
        query = db.collection('users').where('phoneNumber', '==', phone_number).limit(1)
        docs = query.get()
        
        return jsonify({
            'success': True,
            'exists': len(docs) > 0
        }), 200
        
    except Exception as e:
        print(f"Error in check_user: {str(e)}")
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': 'Internal server error'
        }), 500


@app.route('/api/login-history', methods=['POST'])
def record_login():
    """
    Record a login event
    Expected JSON body:
    {
        "uid": "firebase-auth-uid",
        "phoneNumber": "+1234567890"
    }
    """
    try:
        data = request.get_json()
        uid = data.get('uid')
        phone_number = data.get('phoneNumber')
        
        if not uid or not phone_number:
            return jsonify({
                'success': False,
                'error': 'UID and phone number are required'
            }), 400
        
        # Validate phone format
        if not validate_phone(phone_number):
            return jsonify({
                'success': False,
                'error': 'Invalid phone number format'
            }), 400
        
        # Verify user exists in users collection (backend safeguard)
        user_ref = db.collection('users').document(uid)
        user_doc = user_ref.get()
        
        if not user_doc.exists:
            return jsonify({
                'success': False,
                'error': 'User does not exist'
            }), 404
        
        # Verify phone number matches the user's registered phone number
        user_data = user_doc.to_dict()
        if user_data.get('phoneNumber') != phone_number:
            return jsonify({
                'success': False,
                'error': 'Phone number does not match registered user'
            }), 400
        
        # Get user agent and IP from request
        user_agent = request.headers.get('User-Agent', 'unknown')
        ip_address = get_client_ip_address()
        
        # Record login history
        login_data = {
            'uid': uid,
            'phoneNumber': phone_number,
            'timestamp': firestore.SERVER_TIMESTAMP,
            'userAgent': user_agent,
            'ipAddress': ip_address,
        }
        
        db.collection('loginHistory').add(login_data)
        
        return jsonify({
            'success': True,
            'message': 'Login recorded successfully'
        }), 201
        
    except Exception as e:
        print(f"Error in record_login: {str(e)}")
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': 'Internal server error'
        }), 500


@app.route('/api/login-history/<uid>', methods=['GET'])
def get_login_history(uid):
    """
    Get login history for a user
    Query params: limit (default: 50, max: 100)
    """
    try:
        if not uid:
            return jsonify({
                'success': False,
                'error': 'UID is required'
            }), 400
        
        # Get limit from query params
        limit = request.args.get('limit', 50, type=int)
        limit = min(limit, 100)  # Cap at 100
        
        # Query login history
        query = db.collection('loginHistory')\
                  .where('uid', '==', uid)\
                  .order_by('timestamp', direction=firestore.Query.DESCENDING)\
                  .limit(limit)
        
        docs = query.get()
        
        history = []
        for doc in docs:
            data = doc.to_dict()
            data['id'] = doc.id
            # Convert timestamp if it exists
            if 'timestamp' in data and data['timestamp']:
                if hasattr(data['timestamp'], 'timestamp'):
                    data['timestamp'] = data['timestamp'].timestamp()
            history.append(data)
        
        return jsonify({
            'success': True,
            'history': history,
            'count': len(history)
        }), 200
        
    except Exception as e:
        print(f"Error in get_login_history: {str(e)}")
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': 'Internal server error'
        }), 500


@app.route('/api/user/<uid>', methods=['GET'])
def get_user(uid):
    """
    Get user profile by UID
    """
    try:
        if not uid:
            return jsonify({
                'success': False,
                'error': 'UID is required'
            }), 400
        
        user_ref = db.collection('users').document(uid)
        user_doc = user_ref.get()
        
        if not user_doc.exists:
            return jsonify({
                'success': False,
                'error': 'User not found'
            }), 404
        
        user_data = user_doc.to_dict()
        
        # Remove sensitive fields before returning
        sensitive_fields = ['password', 'token', 'ssn', 'socialSecurityNumber', 'apiKey', 'secretKey', 'accessToken', 'refreshToken']
        for field in sensitive_fields:
            user_data.pop(field, None)
        
        return jsonify({
            'success': True,
            'user': user_data
        }), 200
        
    except Exception as e:
        print(f"Error in get_user: {str(e)}")
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': 'Internal server error'
        }), 500


@app.route('/api/unregister', methods=['POST'])
def unregister_user():
    """
    Remove a user registration (rollback endpoint for cleanup)
    Expected JSON body:
    {
        "uid": "firebase-auth-uid"
    }
    """
    try:
        data = request.get_json()
        uid = data.get('uid')
        
        if not uid:
            return jsonify({
                'success': False,
                'error': 'UID is required'
            }), 400
        
        user_ref = db.collection('users').document(uid)
        user_doc = user_ref.get()
        
        if not user_doc.exists:
            return jsonify({
                'success': False,
                'error': 'User not found'
            }), 404
        
        # Delete user document
        user_ref.delete()
        
        return jsonify({
            'success': True,
            'message': 'User unregistered successfully'
        }), 200
        
    except Exception as e:
        print(f"Error in unregister_user: {str(e)}")
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': 'Internal server error'
        }), 500


if __name__ == '__main__':
    port = int(os.getenv('PORT', 5001))  # Changed default to 5001 to avoid AirPlay conflict
    debug = os.getenv('FLASK_ENV') == 'development'
    app.run(host='0.0.0.0', port=port, debug=debug)

