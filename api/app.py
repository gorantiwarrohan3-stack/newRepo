"""
Flask API for Prasadam Connect
Handles user registration and login history
"""
import os
import uuid
from datetime import datetime, timezone, timedelta
from flask import Flask, request, jsonify
from flask_cors import CORS
import firebase_admin
from firebase_admin import credentials, firestore
import re
import ipaddress
import traceback

app = Flask(__name__)

# Configure CORS - Force development mode for local testing
# Check if we're in production (only if explicitly set)
is_production = os.getenv('FLASK_ENV') == 'production' or (os.getenv('ENVIRONMENT', '').lower() == 'production' and os.getenv('TRUSTED_ORIGINS'))

# Always use permissive CORS for development/local testing
# This ensures CORS works regardless of environment variable settings
CORS(app,
     resources={
         r"/api/*": {
             "origins": "*",
             "methods": ["GET", "POST", "PUT", "OPTIONS", "DELETE"],
             "allow_headers": ["Content-Type", "Authorization", "X-Requested-With"],
             "supports_credentials": False
         }
     })

print("CORS: Configured to allow all origins for /api/* routes")

# Add explicit after_request handler to ensure CORS headers are always set
@app.after_request
def after_request(response):
    # Always add CORS headers for API routes
    if request.path.startswith('/api/'):
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, OPTIONS, DELETE'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-Requested-With'
        response.headers['Access-Control-Max-Age'] = '3600'
    return response

# Add global OPTIONS handler for all API routes
@app.before_request
def handle_preflight():
    if request.method == "OPTIONS":
        response = jsonify({'status': 'ok'})
        response.headers.add("Access-Control-Allow-Origin", "*")
        response.headers.add('Access-Control-Allow-Headers', "Content-Type,Authorization,X-Requested-With")
        response.headers.add('Access-Control-Allow-Methods', "GET,PUT,POST,DELETE,OPTIONS")
        return response

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


def serialize_timestamp(value):
    """
    Convert Firestore timestamp/datetime to ISO 8601 string.
    """
    if value is None:
        return None
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc).isoformat()
    if hasattr(value, "timestamp"):
        # Firestore Timestamp
        return datetime.fromtimestamp(value.timestamp(), tz=timezone.utc).isoformat()
    return value


def parse_iso_datetime(value, *, assume_utc=True):
    """
    Parse an ISO-8601 datetime string into a timezone-aware datetime.
    Returns None if parsing fails or value is falsy.
    """
    if not value:
        return None
    if isinstance(value, datetime):
        dt = value
    else:
        try:
            value = value.replace('Z', '+00:00')
            dt = datetime.fromisoformat(value)
        except Exception:
            return None
    if dt.tzinfo is None and assume_utc:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


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
                'subscription': {
                    'active': False,
                    'waived': True,  # Launch phase waiver by default
                    'monthlyFeeCents': 100,  # $1.00 expressed in cents
                    'renewsAt': None,
                    'activatedAt': None,
                },
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
            'subscription': {
                'active': False,
                'waived': True,
                'monthlyFeeCents': 100,
                'renewsAt': None,
                'activatedAt': None,
            },
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


@app.route('/api/user/<uid>', methods=['PUT'])
def update_user(uid):
    """
    Update user profile by UID
    Expected JSON body:
    {
        "name": "User Name" (optional),
        "email": "user@example.com" (optional),
        "address": "123 Main St, City, State" (optional)
    }
    Note: Phone number cannot be updated for security reasons
    """
    try:
        if not uid:
            return jsonify({
                'success': False,
                'error': 'UID is required'
            }), 400
        
        data = request.get_json()
        if not data:
            return jsonify({
                'success': False,
                'error': 'Request body is required'
            }), 400
        
        user_ref = db.collection('users').document(uid)
        user_doc = user_ref.get()
        
        if not user_doc.exists:
            return jsonify({
                'success': False,
                'error': 'User not found'
            }), 404
        
        user_data = user_doc.to_dict()
        update_data = {}
        
        # Update name if provided
        if 'name' in data:
            name = data['name'].strip()
            if name:
                update_data['name'] = name
        
        # Update email if provided
        if 'email' in data:
            email = data['email'].strip().lower()
            if email:
                # Validate email format
                if not validate_email(email):
                    return jsonify({
                        'success': False,
                        'error': 'Invalid email format'
                    }), 400
                
                # Check if email is already taken by another user
                if email != user_data.get('email'):
                    normalized_email = normalize_email_for_path(email)
                    email_marker_ref = db.collection('users_by_email').document(normalized_email)
                    email_marker_doc = email_marker_ref.get()
                    
                    if email_marker_doc.exists:
                        return jsonify({
                            'success': False,
                            'error': 'Email already registered'
                        }), 409
                    
                    # Update email marker if email changed
                    old_email = user_data.get('email')
                    if old_email:
                        old_normalized_email = normalize_email_for_path(old_email)
                        old_email_marker_ref = db.collection('users_by_email').document(old_normalized_email)
                        old_email_marker_ref.delete()
                    
                    # Create new email marker
                    email_marker_data = {
                        'uid': uid,
                        'email': email,
                        'createdAt': firestore.SERVER_TIMESTAMP,
                    }
                    email_marker_ref.set(email_marker_data)
                
                update_data['email'] = email
        
        # Update address if provided
        if 'address' in data:
            address = data['address'].strip()
            if address:
                update_data['address'] = address
        
        # If no valid updates, return error
        if not update_data:
            return jsonify({
                'success': False,
                'error': 'No valid fields to update'
            }), 400
        
        # Add updated timestamp
        update_data['updatedAt'] = firestore.SERVER_TIMESTAMP
        
        # Update user document
        user_ref.update(update_data)
        
        # Get updated user data
        updated_user_doc = user_ref.get()
        updated_user_data = updated_user_doc.to_dict()
        
        # Remove sensitive fields before returning
        sensitive_fields = ['password', 'token', 'ssn', 'socialSecurityNumber', 'apiKey', 'secretKey', 'accessToken', 'refreshToken']
        for field in sensitive_fields:
            updated_user_data.pop(field, None)
        
        return jsonify({
            'success': True,
            'message': 'User profile updated successfully',
            'user': updated_user_data
        }), 200
        
    except Exception as e:
        print(f"Error in update_user: {str(e)}")
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': 'Internal server error'
        }), 500


@app.route('/api/offerings', methods=['GET'])
def list_offerings():
    """
    List prasadam offerings. Optionally filter by status.
    """
    try:
        status = request.args.get('status')
        query = db.collection('offerings')
        if status:
            query = query.where('status', '==', status.lower())

        try:
            query = query.order_by('availableAt', direction=firestore.Query.DESCENDING)
        except Exception:
            # Some documents may not have the field; ignore ordering issues.
            pass

        docs = query.get()

        offerings = []
        for doc in docs:
            data = doc.to_dict()
            data['id'] = doc.id
            if 'availableAt' in data:
                data['availableAt'] = serialize_timestamp(data.get('availableAt'))
            if 'updatedAt' in data:
                data['updatedAt'] = serialize_timestamp(data.get('updatedAt'))
            offerings.append(data)

        return jsonify({
            'success': True,
            'offerings': offerings,
            'count': len(offerings),
        }), 200
    except Exception as e:
        print(f"Error in list_offerings: {str(e)}")
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': 'Internal server error'
        }), 500


@app.route('/api/orders', methods=['POST'])
def create_order():
    """
    Create a new student order for a prasadam offering.
    Expected JSON body:
    {
        "uid": "firebase-auth-uid",
        "offeringId": "offering-document-id"
    }
    """
    try:
        data = request.get_json() or {}
        uid = (data.get('uid') or '').strip()
        offering_id = (data.get('offeringId') or '').strip()

        if not uid or not offering_id:
            return jsonify({
                'success': False,
                'error': 'UID and offeringId are required'
            }), 400

        user_ref = db.collection('users').document(uid)
        offering_ref = db.collection('offerings').document(offering_id)
        order_id = str(uuid.uuid4())
        order_ref = db.collection('orders').document(order_id)

        transaction = db.transaction()

        @firestore.transactional
        def create_order_txn(transaction):
            user_doc = user_ref.get(transaction=transaction)
            if not user_doc.exists:
                raise ValueError('User not found')

            offering_doc = offering_ref.get(transaction=transaction)
            if not offering_doc.exists:
                raise ValueError('Offering not found')

            offering_data = offering_doc.to_dict()
            status = (offering_data.get('status') or '').lower()
            if status not in ['available', 'open']:
                raise ValueError('Offering is not available')

            available_quantity = int(offering_data.get('availableQuantity', 0))
            if available_quantity <= 0:
                raise ValueError('Offering is sold out')

            fee_cents = int(offering_data.get('feeCents', 0))
            launch_fee_refund = bool(offering_data.get('launchFeeRefund', True))

            user_data = user_doc.to_dict() or {}
            subscription = user_data.get('subscription') or {}
            waived = subscription.get('waived', True)

            qr_token = str(uuid.uuid4())

            owner_uid = offering_data.get('ownerUid') or offering_data.get('owner') or offering_data.get('owner_id')

            order_data = {
                'orderId': order_id,
                'uid': uid,
                'offeringId': offering_id,
                'offeringTitle': offering_data.get('title'),
                'ownerUid': owner_uid,
                'status': 'pending',
                'feeCents': fee_cents,
                'feeRefundEligible': launch_fee_refund,
                'subscriptionWaived': waived,
                'createdAt': firestore.SERVER_TIMESTAMP,
                'updatedAt': firestore.SERVER_TIMESTAMP,
                'qrToken': qr_token,
            }

            new_quantity = available_quantity - 1
            offering_updates = {
                'availableQuantity': new_quantity,
                'updatedAt': firestore.SERVER_TIMESTAMP,
            }
            if new_quantity <= 0:
                offering_updates['status'] = 'sold-out'

            transaction.update(offering_ref, offering_updates)
            transaction.set(order_ref, order_data)

        try:
            create_order_txn(transaction)
        except ValueError as ve:
            return jsonify({
                'success': False,
                'error': str(ve)
            }), 400

        order_doc = order_ref.get()
        order_payload = order_doc.to_dict() or {}
        order_payload['id'] = order_doc.id
        order_payload['createdAt'] = serialize_timestamp(order_payload.get('createdAt'))
        order_payload['updatedAt'] = serialize_timestamp(order_payload.get('updatedAt'))

        return jsonify({
            'success': True,
            'order': order_payload
        }), 201

    except Exception as e:
        print(f"Error in create_order: {str(e)}")
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': 'Internal server error'
        }), 500


@app.route('/api/orders/<uid>', methods=['GET'])
def list_orders_for_user(uid):
    """
    List orders for a specific student UID.
    """
    try:
        if not uid:
            return jsonify({
                'success': False,
                'error': 'UID is required'
            }), 400

        # Try to query with order_by, but fall back if index is missing
        docs = []
        try:
            query = db.collection('orders')\
                .where('uid', '==', uid)\
                .order_by('createdAt', direction=firestore.Query.DESCENDING)\
                .limit(50)
            docs = query.get()
        except Exception as index_error:
            # If order_by fails (likely missing index), try without ordering
            error_str = str(index_error)
            # Extract index creation URL if present in error message
            index_url_match = re.search(r'https://console\.firebase\.google\.com[^\s]+', error_str)
            if index_url_match:
                # Log at debug level - index creation is optional, fallback works
                print(f"Info: Firestore index not found (optional). Query will work without ordering. Create index: {index_url_match.group(0)}")
            else:
                print(f"Info: order_by failed, using query without ordering: {error_str[:100]}")
            try:
                query = db.collection('orders')\
                    .where('uid', '==', uid)\
                    .limit(50)
                docs = query.get()
            except Exception as query_error:
                print(f"Error: Query failed even without order_by: {str(query_error)}")
                raise query_error
        
        orders = []
        for doc in docs:
            try:
                data = doc.to_dict()
                if data:  # Only process if data exists
                    data['id'] = doc.id
                    data['createdAt'] = serialize_timestamp(data.get('createdAt'))
                    data['updatedAt'] = serialize_timestamp(data.get('updatedAt'))
                    orders.append(data)
            except Exception as doc_error:
                print(f"Warning: Error processing order document {doc.id}: {str(doc_error)}")
                continue
        
        # Sort in memory if we couldn't use order_by
        if orders:
            try:
                orders.sort(key=lambda x: x.get('createdAt') or '', reverse=True)
            except Exception:
                pass  # Continue without sorting if sort fails

        return jsonify({
            'success': True,
            'orders': orders,
            'count': len(orders)
        }), 200
    except Exception as e:
        print(f"Error in list_orders_for_user: {str(e)}")
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': 'Internal server error'
        }), 500


@app.route('/api/supply/batches', methods=['POST'])
def create_supply_batch():
    """
    Create a supply batch entry for a supply owner.
    """
    try:
        data = request.get_json() or {}
        uid = (data.get('uid') or '').strip()
        title = (data.get('title') or '').strip()
        quantity = int(data.get('quantity', 0))
        expiration_at = parse_iso_datetime(data.get('expirationAt'))
        notes = (data.get('notes') or '').strip() or None

        if not uid:
            return jsonify({'success': False, 'error': 'UID is required'}), 400

        if quantity <= 0:
            return jsonify({'success': False, 'error': 'Quantity must be greater than zero'}), 400

        batch_data = {
            'ownerUid': uid,
            'title': title or 'Prasadam batch',
            'quantity': quantity,
            'remainingQuantity': quantity,
            'expirationAt': expiration_at,
            'notes': notes,
            'createdAt': firestore.SERVER_TIMESTAMP,
            'updatedAt': firestore.SERVER_TIMESTAMP,
            'status': 'active',
        }

        batch_ref = db.collection('supplyBatches').document()
        batch_ref.set(batch_data)

        batch_doc = batch_ref.get()
        payload = batch_doc.to_dict() or {}
        payload['id'] = batch_doc.id
        payload['createdAt'] = serialize_timestamp(payload.get('createdAt'))
        payload['updatedAt'] = serialize_timestamp(payload.get('updatedAt'))
        payload['expirationAt'] = serialize_timestamp(payload.get('expirationAt'))

        return jsonify({'success': True, 'batch': payload}), 201
    except Exception as e:
        print(f"Error in create_supply_batch: {str(e)}")
        traceback.print_exc()
        return jsonify({'success': False, 'error': 'Internal server error'}), 500


@app.route('/api/supply/batches/<uid>', methods=['GET'])
def list_supply_batches(uid):
    """
    List supply batches for a supply owner.
    """
    try:
        if not uid:
            return jsonify({'success': False, 'error': 'UID is required'}), 400

        try:
            query = db.collection('supplyBatches')\
                .where('ownerUid', '==', uid)\
                .order_by('createdAt', direction=firestore.Query.DESCENDING)\
                .limit(100)
            docs = query.get()
        except Exception as index_error:
            # If order_by fails (likely missing index), try without ordering
            error_str = str(index_error)
            import re
            index_url_match = re.search(r'https://console\.firebase\.google\.com[^\s]+', error_str)
            if index_url_match:
                print(f"Info: Firestore index not found for supplyBatches (optional). Query will work without ordering. Create index: {index_url_match.group(0)}")
            else:
                print(f"Info: order_by failed in list_supply_batches, using query without ordering: {error_str[:100]}")
            try:
                query = db.collection('supplyBatches')\
                    .where('ownerUid', '==', uid)\
                    .limit(100)
                docs = query.get()
            except Exception as query_error:
                print(f"Error: Query failed even without order_by: {str(query_error)}")
                raise query_error
        
        batches = []
        for doc in docs:
            data = doc.to_dict() or {}
            data['id'] = doc.id
            data['createdAt'] = serialize_timestamp(data.get('createdAt'))
            data['updatedAt'] = serialize_timestamp(data.get('updatedAt'))
            data['expirationAt'] = serialize_timestamp(data.get('expirationAt'))
            batches.append(data)
        
        # Sort in memory if we couldn't use order_by
        if batches:
            try:
                batches.sort(key=lambda x: x.get('createdAt') or '', reverse=True)
            except Exception:
                pass  # Continue without sorting if sort fails
        
        return jsonify({'success': True, 'batches': batches, 'count': len(batches)}), 200
    except Exception as e:
        print(f"Error in list_supply_batches: {str(e)}")
        traceback.print_exc()
        return jsonify({'success': False, 'error': 'Internal server error'}), 500


@app.route('/api/supply/future-offerings', methods=['POST'])
def create_future_offering():
    """
    Create a scheduled future offering announcement.
    """
    try:
        data = request.get_json() or {}
        uid = (data.get('uid') or '').strip()
        title = (data.get('title') or '').strip()
        description = (data.get('description') or '').strip()
        scheduled_at = parse_iso_datetime(data.get('scheduledAt'))
        notes = (data.get('notes') or '').strip() or None
        # Explicitly handle showNotesToStudents - default to False if not provided
        show_notes_to_students = data.get('showNotesToStudents')
        if show_notes_to_students is None:
            show_notes_to_students = False
        else:
            # Convert to boolean: handle True, 'true', 'True', 1, etc.
            if isinstance(show_notes_to_students, str):
                show_notes_to_students = show_notes_to_students.lower() in ('true', '1', 'yes')
            else:
                show_notes_to_students = bool(show_notes_to_students)

        if not uid:
            return jsonify({'success': False, 'error': 'UID is required'}), 400

        if not scheduled_at:
            return jsonify({'success': False, 'error': 'Scheduled time is required'}), 400

        announcement = {
            'ownerUid': uid,
            'title': title or 'Upcoming prasadam',
            'description': description,
            'scheduledAt': scheduled_at,
            'notes': notes,
            'showNotesToStudents': show_notes_to_students,  # Always explicitly set as boolean
            'createdAt': firestore.SERVER_TIMESTAMP,
            'updatedAt': firestore.SERVER_TIMESTAMP,
        }

        doc_ref = db.collection('futureOfferings').document()
        doc_ref.set(announcement)
        
        # Debug: Verify the field was saved
        saved_doc = doc_ref.get()
        saved_data = saved_doc.to_dict()
        print(f"Saved document includes showNotesToStudents: {'showNotesToStudents' in saved_data}, value: {saved_data.get('showNotesToStudents')}")

        doc = doc_ref.get()
        payload = doc.to_dict() or {}
        payload['id'] = doc.id
        payload['createdAt'] = serialize_timestamp(payload.get('createdAt'))
        payload['updatedAt'] = serialize_timestamp(payload.get('updatedAt'))
        payload['scheduledAt'] = serialize_timestamp(payload.get('scheduledAt'))

        return jsonify({'success': True, 'announcement': payload}), 201
    except Exception as e:
        print(f"Error in create_future_offering: {str(e)}")
        traceback.print_exc()
        return jsonify({'success': False, 'error': 'Internal server error'}), 500


@app.route('/api/supply/future-offerings/<uid>', methods=['GET'])
def list_future_offerings(uid):
    """
    List future offerings scheduled by a supply owner.
    """
    try:
        if not uid:
            return jsonify({'success': False, 'error': 'UID is required'}), 400

        try:
            query = db.collection('futureOfferings')\
                .where('ownerUid', '==', uid)\
                .order_by('scheduledAt', direction=firestore.Query.ASCENDING)\
                .limit(50)
            docs = query.get()
        except Exception as index_error:
            # If order_by fails (likely missing index), try without ordering
            error_str = str(index_error)
            import re
            index_url_match = re.search(r'https://console\\.firebase\\.google\\.com[^\\s]+', error_str)
            if index_url_match:
                print(f"Info: Firestore index not found for futureOfferings (optional). Query will work without ordering. Create index: {index_url_match.group(0)}")
            else:
                print(f"Info: order_by failed in list_future_offerings, using query without ordering: {error_str[:100]}")
            try:
                query = db.collection('futureOfferings')\
                    .where('ownerUid', '==', uid)\
                    .limit(50)
                docs = query.get()
            except Exception as query_error:
                print(f"Error: Query failed even without order_by: {str(query_error)}")
                raise query_error
        
        announcements = []
        for doc in docs:
            data = doc.to_dict() or {}
            data['id'] = doc.id
            data['createdAt'] = serialize_timestamp(data.get('createdAt'))
            data['updatedAt'] = serialize_timestamp(data.get('updatedAt'))
            data['scheduledAt'] = serialize_timestamp(data.get('scheduledAt'))
            announcements.append(data)
        
        # Sort in memory if we couldn't use order_by
        if announcements:
            try:
                announcements.sort(key=lambda x: x.get('scheduledAt') or '')
            except Exception:
                pass  # Continue without sorting if sort fails
        
        return jsonify({'success': True, 'announcements': announcements, 'count': len(announcements)}), 200
    except Exception as e:
        print(f"Error in list_future_offerings: {str(e)}")
        traceback.print_exc()
        return jsonify({'success': False, 'error': 'Internal server error'}), 500


@app.route('/api/supply/future-offerings/<future_offering_id>', methods=['DELETE'])
def delete_future_offering(future_offering_id):
    """Delete a future offering announcement.

    Expected JSON body:
    {
        "uid": "owner uid"   # required for auth check
    }
    """
    try:
        data = request.get_json() or {}
        uid = (data.get('uid') or '').strip()
        if not uid:
            return jsonify({'success': False, 'error': 'UID is required'}), 400

        if not future_offering_id:
            return jsonify({'success': False, 'error': 'Future offering ID is required'}), 400

        future_ref = db.collection('futureOfferings').document(future_offering_id)
        doc = future_ref.get()
        if not doc.exists:
            return jsonify({'success': False, 'error': 'Future offering not found'}), 404

        future_data = doc.to_dict() or {}
        if future_data.get('ownerUid') != uid:
            return jsonify({'success': False, 'error': 'Unauthorized: Future offering does not belong to this owner'}), 403

        # Delete the future offering document
        future_ref.delete()

        return jsonify({'success': True, 'message': 'Future offering deleted successfully'}), 200
    except Exception as e:
        print(f"Error in delete_future_offering: {str(e)}")
        traceback.print_exc()
        return jsonify({'success': False, 'error': 'Internal server error'}), 500


@app.route('/api/supply/offerings/publish', methods=['POST'])
def publish_offering_from_future():
    """Create a live offering from a future offering.

    Expected JSON body:
    {
        "uid": "supply-owner-uid",
        "futureOfferingId": "future-offering-doc-id",
        "quantity": 50,
        "feeCents": 100,
        "launchFeeRefund": true
    }
    """
    try:
        data = request.get_json() or {}
        uid = (data.get('uid') or '').strip()
        future_offering_id = (data.get('futureOfferingId') or '').strip()
        quantity = int(data.get('quantity', 0))
        fee_cents = int(data.get('feeCents', 0))
        launch_fee_refund = bool(data.get('launchFeeRefund', True))

        if not uid or not future_offering_id:
            return jsonify({'success': False, 'error': 'UID and futureOfferingId are required'}), 400

        if quantity <= 0:
            return jsonify({'success': False, 'error': 'Quantity must be greater than zero'}), 400

        future_ref = db.collection('futureOfferings').document(future_offering_id)
        future_doc = future_ref.get()
        if not future_doc.exists:
            return jsonify({'success': False, 'error': 'Future offering not found'}), 404

        future_data = future_doc.to_dict() or {}
        owner_uid = future_data.get('ownerUid')
        if owner_uid != uid:
            return jsonify({'success': False, 'error': 'Unauthorized: Future offering does not belong to this owner'}), 403

        scheduled_at = future_data.get('scheduledAt')
        if scheduled_at is None:
            available_at = firestore.SERVER_TIMESTAMP
        else:
            # Normalize to Firestore Timestamp by going through datetime
            dt = parse_iso_datetime(serialize_timestamp(scheduled_at))
            available_at = dt if dt else firestore.SERVER_TIMESTAMP

        offering_data = {
            'ownerUid': uid,
            'title': future_data.get('title') or 'Prasadam offering',
            'description': future_data.get('description') or '',
            'availableAt': available_at,
            'status': 'available',
            'availableQuantity': quantity,
            'feeCents': fee_cents,
            'launchFeeRefund': launch_fee_refund,
            'createdAt': firestore.SERVER_TIMESTAMP,
            'updatedAt': firestore.SERVER_TIMESTAMP,
            'sourceFutureOfferingId': future_offering_id,
        }

        offering_ref = db.collection('offerings').document()
        offering_ref.set(offering_data)

        # Optionally mark the future offering as published for UI purposes
        future_ref.update({
            'publishedOfferingId': offering_ref.id,
            'publishedAt': firestore.SERVER_TIMESTAMP,
        })

        created_doc = offering_ref.get()
        payload = created_doc.to_dict() or {}
        payload['id'] = created_doc.id
        payload['createdAt'] = serialize_timestamp(payload.get('createdAt'))
        payload['updatedAt'] = serialize_timestamp(payload.get('updatedAt'))
        payload['availableAt'] = serialize_timestamp(payload.get('availableAt'))

        return jsonify({'success': True, 'offering': payload}), 201
    except Exception as e:
        print(f"Error in publish_offering_from_future: {str(e)}")
        traceback.print_exc()
        return jsonify({'success': False, 'error': 'Internal server error'}), 500


@app.route('/api/supply/offerings/<uid>', methods=['GET'])
def list_supply_offerings(uid):
    """List live offerings for a supply owner."""
    try:
        if not uid:
            return jsonify({'success': False, 'error': 'UID is required'}), 400

        try:
            query = db.collection('offerings')\
                .where('ownerUid', '==', uid)\
                .order_by('availableAt', direction=firestore.Query.DESCENDING)\
                .limit(100)
            docs = query.get()
        except Exception as index_error:
            error_str = str(index_error)
            import re
            index_url_match = re.search(r'https://console\\.firebase\\.google\\.com[^\\s]+', error_str)
            if index_url_match:
                print(f"Info: Firestore index not found for offerings (optional). Query will work without ordering. Create index: {index_url_match.group(0)}")
            else:
                print(f"Info: order_by failed in list_supply_offerings, using query without ordering: {error_str[:100]}")
            try:
                query = db.collection('offerings')\
                    .where('ownerUid', '==', uid)\
                    .limit(100)
                docs = query.get()
            except Exception as query_error:
                print(f"Error: Query failed even without order_by: {str(query_error)}")
                raise query_error

        offerings = []
        for doc in docs:
            data = doc.to_dict() or {}
            data['id'] = doc.id
            data['createdAt'] = serialize_timestamp(data.get('createdAt'))
            data['updatedAt'] = serialize_timestamp(data.get('updatedAt'))
            data['availableAt'] = serialize_timestamp(data.get('availableAt'))
            offerings.append(data)

        # Sort in memory if we couldn't use order_by
        if offerings:
            try:
                offerings.sort(key=lambda x: x.get('availableAt') or '', reverse=True)
            except Exception:
                pass

        return jsonify({'success': True, 'offerings': offerings, 'count': len(offerings)}), 200
    except Exception as e:
        print(f"Error in list_supply_offerings: {str(e)}")
        traceback.print_exc()
        return jsonify({'success': False, 'error': 'Internal server error'}), 500


@app.route('/api/supply/offerings/<offering_id>', methods=['PUT'])
def update_supply_offering(offering_id):
    """Update an existing live offering owned by a supply owner.

    Expected JSON body:
    {
        "uid": "owner uid",   # required for auth check
        "title": "...",       # optional
        "description": "...", # optional
        "availableAt": "ISO string", # optional
        "status": "available|sold-out|closed", # optional
        "availableQuantity": 10,              # optional
        "feeCents": 100,                      # optional
        "launchFeeRefund": true               # optional
    }
    """
    try:
        data = request.get_json() or {}
        uid = (data.get('uid') or '').strip()
        if not uid:
            return jsonify({'success': False, 'error': 'UID is required'}), 400

        if not offering_id:
            return jsonify({'success': False, 'error': 'Offering ID is required'}), 400

        offering_ref = db.collection('offerings').document(offering_id)
        doc = offering_ref.get()
        if not doc.exists:
            return jsonify({'success': False, 'error': 'Offering not found'}), 404

        offering_data = doc.to_dict() or {}
        if offering_data.get('ownerUid') != uid:
            return jsonify({'success': False, 'error': 'Unauthorized: Offering does not belong to this owner'}), 403

        updates = {}
        if 'title' in data and isinstance(data['title'], str):
            updates['title'] = data['title'].strip() or offering_data.get('title')
        if 'description' in data and isinstance(data['description'], str):
            updates['description'] = data['description'].strip()
        if 'status' in data and isinstance(data['status'], str):
            updates['status'] = data['status'].strip().lower()
        if 'availableQuantity' in data:
            try:
                qty = int(data['availableQuantity'])
                if qty >= 0:
                    updates['availableQuantity'] = qty
            except (TypeError, ValueError):
                pass
        if 'feeCents' in data:
            try:
                fee = int(data['feeCents'])
                if fee >= 0:
                    updates['feeCents'] = fee
            except (TypeError, ValueError):
                pass
        if 'launchFeeRefund' in data:
            updates['launchFeeRefund'] = bool(data['launchFeeRefund'])
        if 'availableAt' in data and data['availableAt']:
            dt = parse_iso_datetime(data['availableAt'])
            if dt:
                updates['availableAt'] = dt

        if not updates:
            return jsonify({'success': False, 'error': 'No valid fields to update'}), 400

        updates['updatedAt'] = firestore.SERVER_TIMESTAMP
        offering_ref.update(updates)

        updated_doc = offering_ref.get()
        payload = updated_doc.to_dict() or {}
        payload['id'] = updated_doc.id
        payload['createdAt'] = serialize_timestamp(payload.get('createdAt'))
        payload['updatedAt'] = serialize_timestamp(payload.get('updatedAt'))
        payload['availableAt'] = serialize_timestamp(payload.get('availableAt'))

        return jsonify({'success': True, 'offering': payload}), 200
    except Exception as e:
        print(f"Error in update_supply_offering: {str(e)}")
        traceback.print_exc()
        return jsonify({'success': False, 'error': 'Internal server error'}), 500


@app.route('/api/supply/offerings/<offering_id>', methods=['DELETE'])
def delete_supply_offering(offering_id):
    """Delete a live offering owned by a supply owner.

    Expected JSON body:
    {
        "uid": "owner uid"   # required for auth check
    }
    """
    try:
        data = request.get_json() or {}
        uid = (data.get('uid') or '').strip()
        if not uid:
            return jsonify({'success': False, 'error': 'UID is required'}), 400

        if not offering_id:
            return jsonify({'success': False, 'error': 'Offering ID is required'}), 400

        offering_ref = db.collection('offerings').document(offering_id)
        doc = offering_ref.get()
        if not doc.exists:
            return jsonify({'success': False, 'error': 'Offering not found'}), 404

        offering_data = doc.to_dict() or {}
        if offering_data.get('ownerUid') != uid:
            return jsonify({'success': False, 'error': 'Unauthorized: Offering does not belong to this owner'}), 403

        # Delete the offering document
        offering_ref.delete()

        return jsonify({'success': True, 'message': 'Offering deleted successfully'}), 200
    except Exception as e:
        print(f"Error in delete_supply_offering: {str(e)}")
        traceback.print_exc()
        return jsonify({'success': False, 'error': 'Internal server error'}), 500


@app.route('/api/supply/analytics/<uid>', methods=['GET'])
def supply_analytics(uid):
    """
    Provide aggregated metrics for a supply owner.
    """
    try:
        if not uid:
            return jsonify({'success': False, 'error': 'UID is required'}), 400

        try:
            order_query = db.collection('orders')\
                .where('ownerUid', '==', uid)\
                .order_by('createdAt', direction=firestore.Query.DESCENDING)\
                .limit(200)
            order_docs = order_query.get()
        except Exception as index_error:
            # If order_by fails (likely missing index), try without ordering
            error_str = str(index_error)
            import re
            index_url_match = re.search(r'https://console\.firebase\.google\.com[^\s]+', error_str)
            if index_url_match:
                print(f"Info: Firestore index not found for orders analytics (optional). Query will work without ordering. Create index: {index_url_match.group(0)}")
            else:
                print(f"Info: order_by failed in supply_analytics, using query without ordering: {error_str[:100]}")
            try:
                order_query = db.collection('orders')\
                    .where('ownerUid', '==', uid)\
                    .limit(200)
                order_docs = order_query.get()
            except Exception as query_error:
                print(f"Error: Query failed even without order_by: {str(query_error)}")
                raise query_error

        total_orders = 0
        pending_orders = 0
        collected_orders = 0
        refunded_orders = 0
        total_fees_cents = 0
        unique_students = set()

        orders_list = []
        for doc in order_docs:
            data = doc.to_dict() or {}
            orders_list.append(data)
        
        # Sort in memory if we couldn't use order_by
        if orders_list:
            try:
                orders_list.sort(key=lambda x: serialize_timestamp(x.get('createdAt')) or '', reverse=True)
            except Exception:
                pass  # Continue without sorting if sort fails
        
        for data in orders_list:
            total_orders += 1
            status = (data.get('status') or 'pending').lower()
            if status in ['pending', 'reserved']:
                pending_orders += 1
            if status in ['collected', 'completed']:
                collected_orders += 1
            if data.get('feeRefundEligible') and status in ['collected', 'completed']:
                refunded_orders += 1
            total_fees_cents += int(data.get('feeCents') or 0)
            if data.get('uid'):
                unique_students.add(data['uid'])

        offerings_query = db.collection('offerings')\
            .where('ownerUid', '==', uid)\
            .limit(100)
        offerings_docs = offerings_query.get()
        active_offerings = 0
        upcoming_offerings = 0

        now = datetime.now(timezone.utc)
        for doc in offerings_docs:
            data = doc.to_dict() or {}
            status = (data.get('status') or '').lower()
            if status in ['available', 'open']:
                active_offerings += 1
            available_at = data.get('availableAt')
            if available_at:
                dt = parse_iso_datetime(serialize_timestamp(available_at))
                if dt and dt > now:
                    upcoming_offerings += 1

        response = {
            'success': True,
            'metrics': {
                'totalOrders': total_orders,
                'pendingOrders': pending_orders,
                'collectedOrders': collected_orders,
                'refundedOrders': refunded_orders,
                'totalFeesCents': total_fees_cents,
                'uniqueStudents': len(unique_students),
                'activeOfferings': active_offerings,
                'upcomingOfferings': upcoming_offerings,
            }
        }
        return jsonify(response), 200
    except Exception as e:
        print(f"Error in supply_analytics: {str(e)}")
        traceback.print_exc()
        return jsonify({'success': False, 'error': 'Internal server error'}), 500


@app.route('/api/supply/orders/<uid>', methods=['GET'])
def supply_orders(uid):
    """
    List recent orders associated with a supply owner.
    """
    try:
        if not uid:
            return jsonify({'success': False, 'error': 'UID is required'}), 400

        limit = request.args.get('limit', 50, type=int)
        limit = max(1, min(limit, 200))

        try:
            query = db.collection('orders')\
                .where('ownerUid', '==', uid)\
                .order_by('createdAt', direction=firestore.Query.DESCENDING)\
                .limit(limit)
            docs = query.get()
        except Exception as index_error:
            # If order_by fails (likely missing index), try without ordering
            error_str = str(index_error)
            import re
            index_url_match = re.search(r'https://console\.firebase\.google\.com[^\s]+', error_str)
            if index_url_match:
                print(f"Info: Firestore index not found for supply orders (optional). Query will work without ordering. Create index: {index_url_match.group(0)}")
            else:
                print(f"Info: order_by failed in supply_orders, using query without ordering: {error_str[:100]}")
            try:
                query = db.collection('orders')\
                    .where('ownerUid', '==', uid)\
                    .limit(limit)
                docs = query.get()
            except Exception as query_error:
                print(f"Error: Query failed even without order_by: {str(query_error)}")
                raise query_error
        
        orders = []
        for doc in docs:
            data = doc.to_dict() or {}
            data['id'] = doc.id
            data['createdAt'] = serialize_timestamp(data.get('createdAt'))
            data['updatedAt'] = serialize_timestamp(data.get('updatedAt'))
            data['collectedAt'] = serialize_timestamp(data.get('collectedAt'))
            orders.append(data)
        
        # Sort in memory if we couldn't use order_by
        if orders:
            try:
                orders.sort(key=lambda x: x.get('createdAt') or '', reverse=True)
            except Exception:
                pass  # Continue without sorting if sort fails

        return jsonify({'success': True, 'orders': orders, 'count': len(orders)}), 200
    except Exception as e:
        print(f"Error in supply_orders: {str(e)}")
        traceback.print_exc()
        return jsonify({'success': False, 'error': 'Internal server error'}), 500


@app.route('/api/orders/validate', methods=['POST'])
def validate_order_qr():
    """
    Validate a student's QR code at pickup.
    """
    try:
        data = request.get_json() or {}
        owner_uid = (data.get('uid') or '').strip()
        qr_token = (data.get('qrToken') or '').strip()

        if not owner_uid or not qr_token:
            return jsonify({'success': False, 'error': 'UID and qrToken are required'}), 400

        query = db.collection('orders').where('qrToken', '==', qr_token).limit(1)
        docs = query.get()
        if not docs:
            return jsonify({'success': False, 'error': 'QR code not found'}), 404

        order_doc = docs[0]
        order_data = order_doc.to_dict() or {}
        order_owner = order_data.get('ownerUid')
        if order_owner and order_owner != owner_uid:
            return jsonify({'success': False, 'error': 'QR code does not belong to this supply owner'}), 403

        status = (order_data.get('status') or 'pending').lower()
        if status in ['collected', 'completed']:
            return jsonify({'success': False, 'error': 'Order already collected'}), 409

        updates = {
            'status': 'collected',
            'collectedAt': firestore.SERVER_TIMESTAMP,
            'updatedAt': firestore.SERVER_TIMESTAMP,
        }
        order_doc.reference.update(updates)

        updated_doc = order_doc.reference.get()
        payload = updated_doc.to_dict() or {}
        payload['id'] = updated_doc.id
        payload['createdAt'] = serialize_timestamp(payload.get('createdAt'))
        payload['updatedAt'] = serialize_timestamp(payload.get('updatedAt'))
        payload['collectedAt'] = serialize_timestamp(payload.get('collectedAt'))

        return jsonify({'success': True, 'order': payload}), 200
    except Exception as e:
        print(f"Error in validate_order_qr: {str(e)}")
        traceback.print_exc()
        return jsonify({'success': False, 'error': 'Internal server error'}), 500


@app.route('/api/orders/<order_id>/cancel', methods=['POST'])
def cancel_order(order_id):
    """
    Cancel a student order.
    Expected JSON body:
    {
        "uid": "firebase-auth-uid"
    }
    """
    try:
        data = request.get_json() or {}
        uid = (data.get('uid') or '').strip()
        
        if not uid:
            return jsonify({
                'success': False,
                'error': 'UID is required'
            }), 400
        
        if not order_id:
            return jsonify({
                'success': False,
                'error': 'Order ID is required'
            }), 400
        
        order_ref = db.collection('orders').document(order_id)
        order_doc = order_ref.get()
        
        if not order_doc.exists:
            return jsonify({
                'success': False,
                'error': 'Order not found'
            }), 404
        
        order_data = order_doc.to_dict() or {}
        order_uid = order_data.get('uid')
        
        # Verify the order belongs to the user
        if order_uid != uid:
            return jsonify({
                'success': False,
                'error': 'Unauthorized: Order does not belong to this user'
            }), 403
        
        status = (order_data.get('status') or 'pending').lower()
        
        # Check if order can be cancelled
        if status in ['collected', 'completed', 'cancelled', 'refunded']:
            return jsonify({
                'success': False,
                'error': f'Cannot cancel order with status: {status}'
            }), 400
        
        offering_id = order_data.get('offeringId')
        offering_ref = db.collection('offerings').document(offering_id) if offering_id else None
        
        # Update order status (simplified - no transaction for now)
        try:
            # Update order first
            order_ref.update({
                'status': 'cancelled',
                'cancelledAt': firestore.SERVER_TIMESTAMP,
                'updatedAt': firestore.SERVER_TIMESTAMP,
            })
            print(f"Order {order_id} marked as cancelled")
            
            # Restore quantity to offering if it exists (assume 1 unit per order)
            if offering_ref:
                try:
                    offering_doc = offering_ref.get()
                    if offering_doc.exists:
                        offering_data = offering_doc.to_dict() or {}
                        current_quantity = int(offering_data.get('availableQuantity', 0) or 0)
                        new_quantity = current_quantity + 1
                        
                        offering_updates = {
                            'availableQuantity': new_quantity,
                            'updatedAt': firestore.SERVER_TIMESTAMP,
                        }
                        
                        # If it was sold out, mark as available again
                        current_status = (offering_data.get('status') or '').lower()
                        if current_status == 'sold-out' and new_quantity > 0:
                            offering_updates['status'] = 'available'
                        
                        offering_ref.update(offering_updates)
                        print(f"Offering {offering_id} quantity restored: {current_quantity} -> {new_quantity}")
                    else:
                        print(f"Warning: Offering {offering_id} not found, skipping quantity restore")
                except Exception as offering_error:
                    error_msg = str(offering_error)
                    print(f"Error restoring offering quantity: {error_msg}")
                    traceback.print_exc()
                    # Continue even if offering update fails - order is already cancelled
                    # But log the error for debugging
        except Exception as update_error:
            error_msg = str(update_error)
            print(f"Error updating order: {error_msg}")
            traceback.print_exc()
            return jsonify({
                'success': False,
                'error': f'Failed to cancel order: {error_msg}'
            }), 500
        
        # Get updated order
        updated_doc = order_ref.get()
        updated_data = updated_doc.to_dict() or {}
        updated_data['id'] = updated_doc.id
        updated_data['createdAt'] = serialize_timestamp(updated_data.get('createdAt'))
        updated_data['updatedAt'] = serialize_timestamp(updated_data.get('updatedAt'))
        updated_data['cancelledAt'] = serialize_timestamp(updated_data.get('cancelledAt'))
        
        return jsonify({
            'success': True,
            'message': 'Order cancelled successfully',
            'order': updated_data
        }), 200
        
    except Exception as e:
        print(f"Error in cancel_order: {str(e)}")
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': 'Internal server error'
        }), 500


@app.route('/api/qrcodes', methods=['POST'])
def create_custom_qr():
    """
    Generate a reusable QR code for events or special cases.
    """
    try:
        data = request.get_json() or {}
        owner_uid = (data.get('uid') or '').strip()
        title = (data.get('title') or '').strip()
        purpose = (data.get('purpose') or '').strip()
        expires_at = parse_iso_datetime(data.get('expiresAt'))

        if not owner_uid:
            return jsonify({'success': False, 'error': 'UID is required'}), 400

        qr_token = str(uuid.uuid4())
        doc_data = {
            'ownerUid': owner_uid,
            'qrToken': qr_token,
            'title': title or 'Event access',
            'purpose': purpose or None,
            'expiresAt': expires_at,
            'createdAt': firestore.SERVER_TIMESTAMP,
        }

        qr_ref = db.collection('qrCodes').document(qr_token)
        qr_ref.set(doc_data)

        record = qr_ref.get().to_dict() or {}
        record['qrToken'] = qr_token
        record['expiresAt'] = serialize_timestamp(record.get('expiresAt'))
        record['createdAt'] = serialize_timestamp(record.get('createdAt'))

        return jsonify({'success': True, 'qrCode': record}), 201
    except Exception as e:
        print(f"Error in create_custom_qr: {str(e)}")
        traceback.print_exc()
        return jsonify({'success': False, 'error': 'Internal server error'}), 500


@app.route('/api/qrcodes/<uid>', methods=['GET'])
def list_custom_qr(uid):
    """
    List QR codes generated by a supply owner.
    """
    try:
        if not uid:
            return jsonify({'success': False, 'error': 'UID is required'}), 400

        try:
            docs = db.collection('qrCodes')\
                .where('ownerUid', '==', uid)\
                .order_by('createdAt', direction=firestore.Query.DESCENDING)\
                .limit(50)\
                .get()
        except Exception as index_error:
            # If order_by fails (likely missing index), try without ordering
            error_str = str(index_error)
            import re
            index_url_match = re.search(r'https://console\.firebase\.google\.com[^\s]+', error_str)
            if index_url_match:
                print(f"Info: Firestore index not found for qrCodes (optional). Query will work without ordering. Create index: {index_url_match.group(0)}")
            else:
                print(f"Info: order_by failed in list_custom_qr, using query without ordering: {error_str[:100]}")
            try:
                docs = db.collection('qrCodes')\
                    .where('ownerUid', '==', uid)\
                    .limit(50)\
                    .get()
            except Exception as query_error:
                print(f"Error: Query failed even without order_by: {str(query_error)}")
                raise query_error

        records = []
        for doc in docs:
            data = doc.to_dict() or {}
            data['id'] = doc.id
            data['qrToken'] = data.get('qrToken') or doc.id
            data['createdAt'] = serialize_timestamp(data.get('createdAt'))
            data['updatedAt'] = serialize_timestamp(data.get('updatedAt'))
            data['expiresAt'] = serialize_timestamp(data.get('expiresAt'))
            records.append(data)
        
        # Sort in memory if we couldn't use order_by
        if records:
            try:
                records.sort(key=lambda x: x.get('createdAt') or '', reverse=True)
            except Exception:
                pass  # Continue without sorting if sort fails

        return jsonify({'success': True, 'qrCodes': records, 'count': len(records)}), 200
    except Exception as e:
        print(f"Error in list_custom_qr: {str(e)}")
        traceback.print_exc()
        return jsonify({'success': False, 'error': 'Internal server error'}), 500


@app.route('/api/subscription', methods=['POST'])
def update_subscription():
    """
    Activate or cancel a student's subscription.
    Expected JSON body:
    {
        "uid": "firebase-auth-uid",
        "action": "activate" | "cancel",
        "waived": true/false (optional when activating)
    }
    """
    try:
        data = request.get_json() or {}
        uid = (data.get('uid') or '').strip()
        action = (data.get('action') or 'activate').strip().lower()
        waived = bool(data.get('waived')) if 'waived' in data else None

        if not uid:
            return jsonify({
                'success': False,
                'error': 'UID is required'
            }), 400

        if action not in ['activate', 'cancel']:
            return jsonify({
                'success': False,
                'error': 'Invalid action'
            }), 400

        user_ref = db.collection('users').document(uid)
        user_doc = user_ref.get()
        if not user_doc.exists:
            return jsonify({
                'success': False,
                'error': 'User not found'
            }), 404

        user_data = user_doc.to_dict() or {}
        subscription = user_data.get('subscription') or {}
        monthly_fee_cents = int(subscription.get('monthlyFeeCents', 100))

        now = datetime.now(timezone.utc)
        updated_subscription = dict(subscription)

        if action == 'activate':
            updated_subscription['active'] = True
            updated_subscription['activatedAt'] = updated_subscription.get('activatedAt') or now
            updated_subscription['renewsAt'] = now + timedelta(days=30)
            updated_subscription['monthlyFeeCents'] = monthly_fee_cents
            if waived is not None:
                updated_subscription['waived'] = waived
            else:
                updated_subscription['waived'] = subscription.get('waived', True)
        else:
            updated_subscription['active'] = False
            updated_subscription['renewsAt'] = None

        user_ref.update({
            'subscription': updated_subscription,
            'updatedAt': firestore.SERVER_TIMESTAMP,
        })

        updated_subscription['activatedAt'] = serialize_timestamp(updated_subscription.get('activatedAt'))
        updated_subscription['renewsAt'] = serialize_timestamp(updated_subscription.get('renewsAt'))

        return jsonify({
            'success': True,
            'subscription': updated_subscription
        }), 200

    except Exception as e:
        print(f"Error in update_subscription: {str(e)}")
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

