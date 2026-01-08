"""
AWS Lambda handler for Prasadam Connect API
Converted from Flask to AWS Lambda
"""
import json
import os
import uuid
from datetime import datetime, timezone, timedelta
import firebase_admin
from firebase_admin import credentials, firestore
import re
import boto3
import ipaddress

# Initialize Firebase Admin SDK (only once - Lambda reuses containers)
if not firebase_admin._apps:
    cred = None
    
    # Try to load credentials from AWS Secrets Manager
    try:
        secret_name = os.getenv('FIREBASE_SECRET_NAME', 'firebase/service-account-key')
        region_name = os.getenv('AWS_REGION', 'us-east-1')
        
        session = boto3.session.Session()
        client = session.client(
            service_name='secretsmanager',
            region_name=region_name
        )
        
        response = client.get_secret_value(SecretId=secret_name)
        secret_string = response['SecretString']
        
        # If secret is stored as JSON string
        if isinstance(secret_string, str):
            try:
                secret_dict = json.loads(secret_string)
            except:
                secret_dict = secret_string
        else:
            secret_dict = secret_string
        
        cred = credentials.Certificate(secret_dict)
    except Exception as e:
        # Fallback to Application Default Credentials
        try:
            cred = credentials.ApplicationDefault()
        except Exception as e2:
            print(f"Error loading Firebase credentials: {e}, {e2}")
            raise Exception(
                "Firebase credentials not configured. "
                "Set up AWS Secrets Manager with firebase/service-account-key"
            )
    
    firebase_admin.initialize_app(cred)

db = firestore.client()


def cors_headers():
    """Return CORS headers for Lambda responses."""
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Requested-With',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
        'Access-Control-Max-Age': '3600'
    }


def lambda_response(body, status_code=200, headers=None):
    """Helper to create Lambda response format."""
    response_headers = cors_headers()
    if headers:
        response_headers.update(headers)
    
    return {
        'statusCode': status_code,
        'headers': response_headers,
        'body': json.dumps(body) if isinstance(body, dict) else body
    }


def serialize_timestamp(value):
    """Convert Firestore timestamp/datetime to ISO 8601 string."""
    if value is None:
        return None
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc).isoformat()
    if hasattr(value, "timestamp"):
        return datetime.fromtimestamp(value.timestamp(), tz=timezone.utc).isoformat()
    return value


def parse_iso_datetime(value, assume_utc=True):
    """Parse an ISO-8601 datetime string into a timezone-aware datetime."""
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


def validate_ip_address(ip_str):
    """Validate if a string is a valid IPv4 or IPv6 address."""
    try:
        ipaddress.ip_address(ip_str.strip())
        return True
    except (ValueError, AttributeError):
        return False


def get_client_ip_address(event):
    """Extract client IP from Lambda event (API Gateway)."""
    # API Gateway provides source IP in requestContext
    source_ip = event.get('requestContext', {}).get('identity', {}).get('sourceIp')
    if source_ip and validate_ip_address(source_ip):
        return source_ip
    
    # Fallback to X-Forwarded-For header
    headers = event.get('headers', {})
    x_forwarded_for = headers.get('X-Forwarded-For') or headers.get('x-forwarded-for')
    if x_forwarded_for:
        ips = [ip.strip() for ip in x_forwarded_for.split(',')]
        if ips:
            first_ip = ips[0].strip()
            if validate_ip_address(first_ip):
                return first_ip
    
    return 'unknown'


# Lambda Handler - Main entry point
def handler(event, context):
    """
    Main Lambda handler that routes requests.
    
    Event structure from API Gateway:
    {
        "httpMethod": "GET|POST|PUT|DELETE",
        "path": "/api/user/123",
        "pathParameters": {...},
        "queryStringParameters": {...},
        "body": "{\"key\":\"value\"}",
        "headers": {...}
    }
    """
    try:
        # Handle CORS preflight
        if event.get('httpMethod') == 'OPTIONS':
            return lambda_response('', 204)
        
        method = event.get('httpMethod', 'GET')
        path = event.get('path', '')
        path_params = event.get('pathParameters') or {}
        query_params = event.get('queryStringParameters') or {}
        
        # Parse body if present
        body = {}
        if event.get('body'):
            try:
                body = json.loads(event['body'])
            except:
                body = {}
        
        # Route to appropriate handler
        if path == '/health' or path == '/api/health':
            return health_check(event, context)
        elif path == '/api/register' and method == 'POST':
            return register_user(event, context, body)
        elif path == '/api/check-user' and method == 'POST':
            return check_user(event, context, body)
    elif path == '/api/login-history' and method == 'POST':
        return record_login(event, context, body)
    elif '/api/login-history/' in path and method == 'GET':
        uid = path_params.get('uid') or path.split('/')[-1]
        return get_login_history(event, context, uid, query_params)
    elif '/api/user/' in path and method == 'GET':
        uid = path_params.get('uid') or path.split('/')[-1]
        return get_user_profile(event, context, uid)
    elif '/api/user/' in path and method == 'PUT':
        uid = path_params.get('uid') or path.split('/')[-1]
        return update_user_profile(event, context, uid, body)
    elif path == '/api/create-user-with-login' and method == 'POST':
        return create_user_with_login(event, context, body)
    elif path == '/api/offerings' and method == 'GET':
        return list_offerings(event, context, query_params)
    elif path == '/api/orders' and method == 'POST':
        return create_order(event, context, body)
    elif '/api/orders/' in path and method == 'GET' and '/cancel' not in path:
        uid = path_params.get('uid') or path.split('/')[-1]
        return list_orders_for_user(event, context, uid)
    elif '/api/orders/' in path and '/cancel' in path and method == 'POST':
        order_id = path_params.get('order_id') or path.split('/')[-2]
        return cancel_order(event, context, order_id, body)
    elif path == '/api/orders/validate' and method == 'POST':
        return validate_order_qr(event, context, body)
    elif path == '/api/subscription' and method == 'POST':
        return update_subscription(event, context, body)
    elif path == '/api/unregister' and method == 'POST':
        return unregister_user(event, context, body)
    # Supply owner routes
    elif path == '/api/supply/batches' and method == 'POST':
        return create_supply_batch(event, context, body)
    elif '/api/supply/batches/' in path and method == 'GET':
        uid = path_params.get('uid') or path.split('/')[-1]
        return list_supply_batches(event, context, uid)
    elif path == '/api/supply/future-offerings' and method == 'POST':
        return create_future_offering(event, context, body)
    elif '/api/supply/future-offerings/' in path and method == 'GET':
        uid = path_params.get('uid') or path.split('/')[-1]
        return list_future_offerings(event, context, uid)
    elif '/api/supply/future-offerings/' in path and method == 'DELETE':
        future_offering_id = path_params.get('future_offering_id') or path.split('/')[-1]
        return delete_future_offering(event, context, future_offering_id, body)
    elif path == '/api/supply/offerings/publish' and method == 'POST':
        return publish_offering_from_future(event, context, body)
    elif '/api/supply/offerings/' in path and method == 'GET':
        uid = path_params.get('uid') or path.split('/')[-1]
        return list_supply_offerings(event, context, uid)
    elif '/api/supply/offerings/' in path and method == 'PUT':
        offering_id = path_params.get('offering_id') or path.split('/')[-1]
        return update_supply_offering(event, context, offering_id, body)
    elif '/api/supply/offerings/' in path and method == 'DELETE':
        offering_id = path_params.get('offering_id') or path.split('/')[-1]
        return delete_supply_offering(event, context, offering_id, body)
    elif '/api/supply/analytics/' in path and method == 'GET':
        uid = path_params.get('uid') or path.split('/')[-1]
        return supply_analytics(event, context, uid)
    elif '/api/supply/orders/' in path and method == 'GET':
        uid = path_params.get('uid') or path.split('/')[-1]
        return supply_orders(event, context, uid, query_params)
    elif path == '/api/qrcodes' and method == 'POST':
        return create_custom_qr(event, context, body)
    elif '/api/qrcodes/' in path and method == 'GET':
        uid = path_params.get('uid') or path.split('/')[-1]
        return list_custom_qr(event, context, uid)
    else:
        return lambda_response({'error': 'Not found', 'path': path, 'method': method}, 404)
    except Exception as e:
        # Ensure CORS headers are always included, even on unhandled exceptions
        print(f"Unhandled error in handler: {str(e)}")
        import traceback
        traceback.print_exc()
        return lambda_response({
            'success': False,
            'error': 'Internal server error',
            'message': str(e)
        }, 500)


def health_check(event, context):
    """Health check endpoint"""
    return lambda_response({
        'status': 'healthy',
        'service': 'prasadam-connect-api',
        'runtime': 'aws-lambda'
    })


def create_user_with_login(event, context, data):
    """POST /api/create-user-with-login"""
    try:
        # Validate required fields
        required_fields = ['uid', 'name', 'email', 'phoneNumber', 'address']
        for field in required_fields:
            if not data.get(field):
                return lambda_response({
                    'success': False,
                    'error': f'Missing required field: {field}'
                }, 400)
        
        uid = data['uid']
        name = data['name'].strip()
        email = data['email'].strip().lower()
        phone_number = data['phoneNumber'].strip()
        address = data['address'].strip()
        
        # Use Firestore transaction
        @firestore.transactional
        def create_user_transaction(transaction):
            user_ref = db.collection('users').document(uid)
            login_ref = db.collection('loginHistory').document()
            
            # Check if user already exists
            if user_ref.get().exists:
                raise ValueError('User already exists')
            
            # Create user document
            user_data = {
                'uid': uid,
                'name': name,
                'email': email,
                'phoneNumber': phone_number,
                'address': address,
                'role': 'student',
                'createdAt': firestore.SERVER_TIMESTAMP,
                'updatedAt': firestore.SERVER_TIMESTAMP,
            }
            transaction.set(user_ref, user_data)
            
            # Record login history
            ip_address = event.get('requestContext', {}).get('identity', {}).get('sourceIp', 'unknown')
            login_data = {
                'uid': uid,
                'loginTime': firestore.SERVER_TIMESTAMP,
                'ipAddress': ip_address,
            }
            transaction.set(login_ref, login_data)
            
            return user_data
        
        transaction = db.transaction()
        user_data = create_user_transaction(transaction)
        
        return lambda_response({
            'success': True,
            'user': user_data
        }, 201)
        
    except ValueError as e:
        return lambda_response({
            'success': False,
            'error': str(e)
        }, 400)
    except Exception as e:
        return lambda_response({
            'success': False,
            'error': str(e)
        }, 500)


def get_user_profile(event, context, uid):
    """GET /api/user/<uid>"""
    try:
        user_ref = db.collection('users').document(uid)
        doc = user_ref.get()
        
        if not doc.exists:
            return lambda_response({
                'success': False,
                'error': 'User not found'
            }, 404)
        
        user_data = doc.to_dict()
        user_data['createdAt'] = serialize_timestamp(user_data.get('createdAt'))
        user_data['updatedAt'] = serialize_timestamp(user_data.get('updatedAt'))
        
        return lambda_response({
            'success': True,
            'user': user_data
        })
    except Exception as e:
        return lambda_response({
            'success': False,
            'error': str(e)
        }, 500)


def update_user_profile(event, context, uid, data):
    """PUT /api/user/<uid>"""
    try:
        user_ref = db.collection('users').document(uid)
        doc = user_ref.get()
        
        if not doc.exists:
            return lambda_response({
                'success': False,
                'error': 'User not found'
            }, 404)
        
        # Update allowed fields
        update_data = {
            'updatedAt': firestore.SERVER_TIMESTAMP,
        }
        
        if 'name' in data:
            update_data['name'] = data['name'].strip()
        if 'email' in data:
            update_data['email'] = data['email'].strip().lower()
        if 'address' in data:
            update_data['address'] = data['address'].strip()
        
        user_ref.update(update_data)
        updated_doc = user_ref.get()
        user_data = updated_doc.to_dict()
        user_data['createdAt'] = serialize_timestamp(user_data.get('createdAt'))
        user_data['updatedAt'] = serialize_timestamp(user_data.get('updatedAt'))
        
        return lambda_response({
            'success': True,
            'user': user_data
        })
    except Exception as e:
        return lambda_response({
            'success': False,
            'error': str(e)
        }, 500)

# ========== Additional Route Handlers ==========

def register_user(event, context, data):
    """POST /api/register"""
    try:
        required_fields = ['uid', 'name', 'email', 'phoneNumber', 'address']
        for field in required_fields:
            if not data.get(field):
                return lambda_response({
                    'success': False,
                    'error': f'Missing required field: {field}'
                }, 400)
        
        uid = data['uid']
        name = data['name'].strip()
        email = data['email'].strip().lower()
        phone_number = data['phoneNumber'].strip()
        address = data['address'].strip()
        
        if not validate_email(email):
            return lambda_response({
                'success': False,
                'error': 'Invalid email format'
            }, 400)
        
        if not validate_phone(phone_number):
            return lambda_response({
                'success': False,
                'error': 'Invalid phone number format. Must be in E.164 format (e.g., +1234567890)'
            }, 400)
        
        user_ref = db.collection('users').document(uid)
        user_doc = user_ref.get()
        
        if user_doc.exists:
            return lambda_response({
                'success': False,
                'error': 'User already registered'
            }, 409)
        
        phone_query = db.collection('users').where('phoneNumber', '==', phone_number).limit(1)
        phone_docs = phone_query.get()
        if phone_docs:
            return lambda_response({
                'success': False,
                'error': 'Phone number already registered'
            }, 409)
        
        email_query = db.collection('users').where('email', '==', email).limit(1)
        email_docs = email_query.get()
        if email_docs:
            return lambda_response({
                'success': False,
                'error': 'Email already registered'
            }, 409)
        
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
        
        return lambda_response({
            'success': True,
            'message': 'User registered successfully',
            'user': {
                'uid': uid,
                'name': name,
                'email': email,
                'phoneNumber': phone_number,
            }
        }, 201)
        
    except Exception as e:
        print(f"Error in register_user: {str(e)}")
        return lambda_response({
            'success': False,
            'error': 'Internal server error'
        }, 500)


def check_user(event, context, data):
    """POST /api/check-user"""
    try:
        phone_number = data.get('phoneNumber')
        
        if not phone_number:
            return lambda_response({
                'success': False,
                'error': 'Phone number is required'
            }, 400)
        
        if not validate_phone(phone_number):
            return lambda_response({
                'success': False,
                'error': 'Invalid phone number format'
            }, 400)
        
        query = db.collection('users').where('phoneNumber', '==', phone_number).limit(1)
        docs = query.get()
        
        return lambda_response({
            'success': True,
            'exists': len(docs) > 0
        })
        
    except Exception as e:
        print(f"Error in check_user: {str(e)}")
        return lambda_response({
            'success': False,
            'error': 'Internal server error'
        }, 500)


def record_login(event, context, data):
    """POST /api/login-history"""
    try:
        uid = data.get('uid')
        phone_number = data.get('phoneNumber')
        
        if not uid or not phone_number:
            return lambda_response({
                'success': False,
                'error': 'UID and phone number are required'
            }, 400)
        
        if not validate_phone(phone_number):
            return lambda_response({
                'success': False,
                'error': 'Invalid phone number format'
            }, 400)
        
        user_ref = db.collection('users').document(uid)
        user_doc = user_ref.get()
        
        if not user_doc.exists:
            return lambda_response({
                'success': False,
                'error': 'User does not exist'
            }, 404)
        
        user_data = user_doc.to_dict()
        if user_data.get('phoneNumber') != phone_number:
            return lambda_response({
                'success': False,
                'error': 'Phone number does not match registered user'
            }, 400)
        
        user_agent = event.get('headers', {}).get('User-Agent') or event.get('headers', {}).get('user-agent', 'unknown')
        ip_address = get_client_ip_address(event)
        
        login_data = {
            'uid': uid,
            'phoneNumber': phone_number,
            'timestamp': firestore.SERVER_TIMESTAMP,
            'userAgent': user_agent,
            'ipAddress': ip_address,
        }
        
        db.collection('loginHistory').add(login_data)
        
        return lambda_response({
            'success': True,
            'message': 'Login recorded successfully'
        }, 201)
        
    except Exception as e:
        print(f"Error in record_login: {str(e)}")
        return lambda_response({
            'success': False,
            'error': 'Internal server error'
        }, 500)


def get_login_history(event, context, uid, query_params):
    """GET /api/login-history/<uid>"""
    try:
        if not uid:
            return lambda_response({
                'success': False,
                'error': 'UID is required'
            }, 400)
        
        limit = int(query_params.get('limit', 50))
        limit = min(limit, 100)
        
        try:
            query = db.collection('loginHistory')\
                      .where('uid', '==', uid)\
                      .order_by('timestamp', direction=firestore.Query.DESCENDING)\
                      .limit(limit)
            docs = query.get()
        except Exception:
            query = db.collection('loginHistory')\
                      .where('uid', '==', uid)\
                      .limit(limit)
            docs = query.get()
        
        history = []
        for doc in docs:
            data = doc.to_dict()
            data['id'] = doc.id
            if 'timestamp' in data and data['timestamp']:
                if hasattr(data['timestamp'], 'timestamp'):
                    data['timestamp'] = data['timestamp'].timestamp()
            history.append(data)
        
        return lambda_response({
            'success': True,
            'history': history,
            'count': len(history)
        })
        
    except Exception as e:
        print(f"Error in get_login_history: {str(e)}")
        return lambda_response({
            'success': False,
            'error': 'Internal server error'
        }, 500)


def list_offerings(event, context, query_params):
    """GET /api/offerings"""
    try:
        status = query_params.get('status')
        query = db.collection('offerings')
        if status:
            query = query.where('status', '==', status.lower())
        
        try:
            query = query.order_by('availableAt', direction=firestore.Query.DESCENDING)
        except Exception:
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
        
        return lambda_response({
            'success': True,
            'offerings': offerings,
            'count': len(offerings),
        })
    except Exception as e:
        print(f"Error in list_offerings: {str(e)}")
        return lambda_response({
            'success': False,
            'error': 'Internal server error'
        }, 500)


def create_order(event, context, data):
    """POST /api/orders"""
    try:
        uid = (data.get('uid') or '').strip()
        offering_id = (data.get('offeringId') or '').strip()
        
        if not uid or not offering_id:
            return lambda_response({
                'success': False,
                'error': 'UID and offeringId are required'
            }, 400)
        
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
            return lambda_response({
                'success': False,
                'error': str(ve)
            }, 400)
        
        order_doc = order_ref.get()
        order_payload = order_doc.to_dict() or {}
        order_payload['id'] = order_doc.id
        order_payload['createdAt'] = serialize_timestamp(order_payload.get('createdAt'))
        order_payload['updatedAt'] = serialize_timestamp(order_payload.get('updatedAt'))
        
        return lambda_response({
            'success': True,
            'order': order_payload
        }, 201)
        
    except Exception as e:
        print(f"Error in create_order: {str(e)}")
        return lambda_response({
            'success': False,
            'error': 'Internal server error'
        }, 500)


def list_orders_for_user(event, context, uid):
    """GET /api/orders/<uid>"""
    try:
        if not uid:
            return lambda_response({
                'success': False,
                'error': 'UID is required'
            }, 400)
        
        docs = []
        try:
            query = db.collection('orders')\
                .where('uid', '==', uid)\
                .order_by('createdAt', direction=firestore.Query.DESCENDING)\
                .limit(50)
            docs = query.get()
        except Exception as index_error:
            try:
                query = db.collection('orders')\
                    .where('uid', '==', uid)\
                    .limit(50)
                docs = query.get()
            except Exception as query_error:
                print(f"Error: Query failed: {str(query_error)}")
                raise query_error
        
        orders = []
        for doc in docs:
            try:
                data = doc.to_dict()
                if data:
                    data['id'] = doc.id
                    data['createdAt'] = serialize_timestamp(data.get('createdAt'))
                    data['updatedAt'] = serialize_timestamp(data.get('updatedAt'))
                    orders.append(data)
            except Exception as doc_error:
                print(f"Warning: Error processing order document {doc.id}: {str(doc_error)}")
                continue
        
        if orders:
            try:
                orders.sort(key=lambda x: x.get('createdAt') or '', reverse=True)
            except Exception:
                pass
        
        return lambda_response({
            'success': True,
            'orders': orders,
            'count': len(orders)
        })
    except Exception as e:
        print(f"Error in list_orders_for_user: {str(e)}")
        return lambda_response({
            'success': False,
            'error': 'Internal server error'
        }, 500)


def cancel_order(event, context, order_id, data):
    """POST /api/orders/<order_id>/cancel"""
    try:
        uid = (data.get('uid') or '').strip()
        
        if not uid:
            return lambda_response({
                'success': False,
                'error': 'UID is required'
            }, 400)
        
        if not order_id:
            return lambda_response({
                'success': False,
                'error': 'Order ID is required'
            }, 400)
        
        order_ref = db.collection('orders').document(order_id)
        order_doc = order_ref.get()
        
        if not order_doc.exists:
            return lambda_response({
                'success': False,
                'error': 'Order not found'
            }, 404)
        
        order_data = order_doc.to_dict() or {}
        order_uid = order_data.get('uid')
        
        if order_uid != uid:
            return lambda_response({
                'success': False,
                'error': 'Unauthorized: Order does not belong to this user'
            }, 403)
        
        status = (order_data.get('status') or 'pending').lower()
        
        if status in ['collected', 'completed', 'cancelled', 'refunded']:
            return lambda_response({
                'success': False,
                'error': f'Cannot cancel order with status: {status}'
            }, 400)
        
        offering_id = order_data.get('offeringId')
        offering_ref = db.collection('offerings').document(offering_id) if offering_id else None
        
        try:
            order_ref.update({
                'status': 'cancelled',
                'cancelledAt': firestore.SERVER_TIMESTAMP,
                'updatedAt': firestore.SERVER_TIMESTAMP,
            })
            
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
                        
                        current_status = (offering_data.get('status') or '').lower()
                        if current_status == 'sold-out' and new_quantity > 0:
                            offering_updates['status'] = 'available'
                        
                        offering_ref.update(offering_updates)
                except Exception as offering_error:
                    print(f"Error restoring offering quantity: {str(offering_error)}")
        except Exception as update_error:
            print(f"Error updating order: {str(update_error)}")
            return lambda_response({
                'success': False,
                'error': f'Failed to cancel order: {str(update_error)}'
            }, 500)
        
        updated_doc = order_ref.get()
        updated_data = updated_doc.to_dict() or {}
        updated_data['id'] = updated_doc.id
        updated_data['createdAt'] = serialize_timestamp(updated_data.get('createdAt'))
        updated_data['updatedAt'] = serialize_timestamp(updated_data.get('updatedAt'))
        updated_data['cancelledAt'] = serialize_timestamp(updated_data.get('cancelledAt'))
        
        return lambda_response({
            'success': True,
            'message': 'Order cancelled successfully',
            'order': updated_data
        })
        
    except Exception as e:
        print(f"Error in cancel_order: {str(e)}")
        return lambda_response({
            'success': False,
            'error': 'Internal server error'
        }, 500)


def validate_order_qr(event, context, data):
    """POST /api/orders/validate"""
    try:
        owner_uid = (data.get('uid') or '').strip()
        qr_token = (data.get('qrToken') or '').strip()
        
        if not owner_uid or not qr_token:
            return lambda_response({
                'success': False,
                'error': 'UID and qrToken are required'
            }, 400)
        
        query = db.collection('orders').where('qrToken', '==', qr_token).limit(1)
        docs = query.get()
        if not docs:
            return lambda_response({
                'success': False,
                'error': 'QR code not found'
            }, 404)
        
        order_doc = docs[0]
        order_data = order_doc.to_dict() or {}
        order_owner = order_data.get('ownerUid')
        if order_owner and order_owner != owner_uid:
            return lambda_response({
                'success': False,
                'error': 'QR code does not belong to this supply owner'
            }, 403)
        
        status = (order_data.get('status') or 'pending').lower()
        if status in ['collected', 'completed']:
            return lambda_response({
                'success': False,
                'error': 'Order already collected'
            }, 409)
        
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
        
        return lambda_response({
            'success': True,
            'order': payload
        })
    except Exception as e:
        print(f"Error in validate_order_qr: {str(e)}")
        return lambda_response({
            'success': False,
            'error': 'Internal server error'
        }, 500)


def update_subscription(event, context, data):
    """POST /api/subscription"""
    try:
        uid = (data.get('uid') or '').strip()
        action = (data.get('action') or 'activate').strip().lower()
        waived = bool(data.get('waived')) if 'waived' in data else None
        
        if not uid:
            return lambda_response({
                'success': False,
                'error': 'UID is required'
            }, 400)
        
        if action not in ['activate', 'cancel']:
            return lambda_response({
                'success': False,
                'error': 'Invalid action'
            }, 400)
        
        user_ref = db.collection('users').document(uid)
        user_doc = user_ref.get()
        if not user_doc.exists:
            return lambda_response({
                'success': False,
                'error': 'User not found'
            }, 404)
        
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
        
        return lambda_response({
            'success': True,
            'subscription': updated_subscription
        })
        
    except Exception as e:
        print(f"Error in update_subscription: {str(e)}")
        return lambda_response({
            'success': False,
            'error': 'Internal server error'
        }, 500)


def unregister_user(event, context, data):
    """POST /api/unregister"""
    try:
        uid = data.get('uid')
        
        if not uid:
            return lambda_response({
                'success': False,
                'error': 'UID is required'
            }, 400)
        
        user_ref = db.collection('users').document(uid)
        user_doc = user_ref.get()
        
        if not user_doc.exists:
            return lambda_response({
                'success': False,
                'error': 'User not found'
            }, 404)
        
        user_ref.delete()
        
        return lambda_response({
            'success': True,
            'message': 'User unregistered successfully'
        })
        
    except Exception as e:
        print(f"Error in unregister_user: {str(e)}")
        return lambda_response({
            'success': False,
            'error': 'Internal server error'
        }, 500)


# ========== Supply Owner Routes ==========

def create_supply_batch(event, context, data):
    """POST /api/supply/batches"""
    try:
        uid = (data.get('uid') or '').strip()
        title = (data.get('title') or '').strip()
        quantity = int(data.get('quantity', 0))
        expiration_at = parse_iso_datetime(data.get('expirationAt'))
        notes = (data.get('notes') or '').strip() or None
        
        if not uid:
            return lambda_response({'success': False, 'error': 'UID is required'}, 400)
        
        if quantity <= 0:
            return lambda_response({'success': False, 'error': 'Quantity must be greater than zero'}, 400)
        
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
        
        return lambda_response({'success': True, 'batch': payload}, 201)
    except Exception as e:
        print(f"Error in create_supply_batch: {str(e)}")
        return lambda_response({'success': False, 'error': 'Internal server error'}, 500)


def list_supply_batches(event, context, uid):
    """GET /api/supply/batches/<uid>"""
    try:
        if not uid:
            return lambda_response({'success': False, 'error': 'UID is required'}, 400)
        
        try:
            query = db.collection('supplyBatches')\
                .where('ownerUid', '==', uid)\
                .order_by('createdAt', direction=firestore.Query.DESCENDING)\
                .limit(100)
            docs = query.get()
        except Exception:
            query = db.collection('supplyBatches')\
                .where('ownerUid', '==', uid)\
                .limit(100)
            docs = query.get()
        
        batches = []
        for doc in docs:
            data = doc.to_dict() or {}
            data['id'] = doc.id
            data['createdAt'] = serialize_timestamp(data.get('createdAt'))
            data['updatedAt'] = serialize_timestamp(data.get('updatedAt'))
            data['expirationAt'] = serialize_timestamp(data.get('expirationAt'))
            batches.append(data)
        
        if batches:
            try:
                batches.sort(key=lambda x: x.get('createdAt') or '', reverse=True)
            except Exception:
                pass
        
        return lambda_response({'success': True, 'batches': batches, 'count': len(batches)})
    except Exception as e:
        print(f"Error in list_supply_batches: {str(e)}")
        return lambda_response({'success': False, 'error': 'Internal server error'}, 500)


def create_future_offering(event, context, data):
    """POST /api/supply/future-offerings"""
    try:
        uid = (data.get('uid') or '').strip()
        title = (data.get('title') or '').strip()
        description = (data.get('description') or '').strip()
        scheduled_at = parse_iso_datetime(data.get('scheduledAt'))
        notes = (data.get('notes') or '').strip() or None
        show_notes_to_students = data.get('showNotesToStudents')
        if show_notes_to_students is None:
            show_notes_to_students = False
        else:
            if isinstance(show_notes_to_students, str):
                show_notes_to_students = show_notes_to_students.lower() in ('true', '1', 'yes')
            else:
                show_notes_to_students = bool(show_notes_to_students)
        
        if not uid:
            return lambda_response({'success': False, 'error': 'UID is required'}, 400)
        
        if not scheduled_at:
            return lambda_response({'success': False, 'error': 'Scheduled time is required'}, 400)
        
        announcement = {
            'ownerUid': uid,
            'title': title or 'Upcoming prasadam',
            'description': description,
            'scheduledAt': scheduled_at,
            'notes': notes,
            'showNotesToStudents': show_notes_to_students,
            'createdAt': firestore.SERVER_TIMESTAMP,
            'updatedAt': firestore.SERVER_TIMESTAMP,
        }
        
        doc_ref = db.collection('futureOfferings').document()
        doc_ref.set(announcement)
        
        doc = doc_ref.get()
        payload = doc.to_dict() or {}
        payload['id'] = doc.id
        payload['createdAt'] = serialize_timestamp(payload.get('createdAt'))
        payload['updatedAt'] = serialize_timestamp(payload.get('updatedAt'))
        payload['scheduledAt'] = serialize_timestamp(payload.get('scheduledAt'))
        
        return lambda_response({'success': True, 'announcement': payload}, 201)
    except Exception as e:
        print(f"Error in create_future_offering: {str(e)}")
        return lambda_response({'success': False, 'error': 'Internal server error'}, 500)


def list_future_offerings(event, context, uid):
    """GET /api/supply/future-offerings/<uid>"""
    try:
        if not uid:
            return lambda_response({'success': False, 'error': 'UID is required'}, 400)
        
        try:
            query = db.collection('futureOfferings')\
                .where('ownerUid', '==', uid)\
                .order_by('scheduledAt', direction=firestore.Query.ASCENDING)\
                .limit(50)
            docs = query.get()
        except Exception:
            query = db.collection('futureOfferings')\
                .where('ownerUid', '==', uid)\
                .limit(50)
            docs = query.get()
        
        announcements = []
        for doc in docs:
            data = doc.to_dict() or {}
            data['id'] = doc.id
            data['createdAt'] = serialize_timestamp(data.get('createdAt'))
            data['updatedAt'] = serialize_timestamp(data.get('updatedAt'))
            data['scheduledAt'] = serialize_timestamp(data.get('scheduledAt'))
            announcements.append(data)
        
        if announcements:
            try:
                announcements.sort(key=lambda x: x.get('scheduledAt') or '')
            except Exception:
                pass
        
        return lambda_response({'success': True, 'announcements': announcements, 'count': len(announcements)})
    except Exception as e:
        print(f"Error in list_future_offerings: {str(e)}")
        return lambda_response({'success': False, 'error': 'Internal server error'}, 500)


def delete_future_offering(event, context, future_offering_id, data):
    """DELETE /api/supply/future-offerings/<future_offering_id>"""
    try:
        uid = (data.get('uid') or '').strip()
        if not uid:
            return lambda_response({'success': False, 'error': 'UID is required'}, 400)
        
        if not future_offering_id:
            return lambda_response({'success': False, 'error': 'Future offering ID is required'}, 400)
        
        future_ref = db.collection('futureOfferings').document(future_offering_id)
        doc = future_ref.get()
        if not doc.exists:
            return lambda_response({'success': False, 'error': 'Future offering not found'}, 404)
        
        future_data = doc.to_dict() or {}
        if future_data.get('ownerUid') != uid:
            return lambda_response({'success': False, 'error': 'Unauthorized: Future offering does not belong to this owner'}, 403)
        
        future_ref.delete()
        
        return lambda_response({'success': True, 'message': 'Future offering deleted successfully'})
    except Exception as e:
        print(f"Error in delete_future_offering: {str(e)}")
        return lambda_response({'success': False, 'error': 'Internal server error'}, 500)


def publish_offering_from_future(event, context, data):
    """POST /api/supply/offerings/publish"""
    try:
        uid = (data.get('uid') or '').strip()
        future_offering_id = (data.get('futureOfferingId') or '').strip()
        quantity = int(data.get('quantity', 0))
        fee_cents = int(data.get('feeCents', 0))
        launch_fee_refund = bool(data.get('launchFeeRefund', True))
        
        if not uid or not future_offering_id:
            return lambda_response({'success': False, 'error': 'UID and futureOfferingId are required'}, 400)
        
        if quantity <= 0:
            return lambda_response({'success': False, 'error': 'Quantity must be greater than zero'}, 400)
        
        future_ref = db.collection('futureOfferings').document(future_offering_id)
        future_doc = future_ref.get()
        if not future_doc.exists:
            return lambda_response({'success': False, 'error': 'Future offering not found'}, 404)
        
        future_data = future_doc.to_dict() or {}
        owner_uid = future_data.get('ownerUid')
        if owner_uid != uid:
            return lambda_response({'success': False, 'error': 'Unauthorized: Future offering does not belong to this owner'}, 403)
        
        scheduled_at = future_data.get('scheduledAt')
        if scheduled_at is None:
            available_at = firestore.SERVER_TIMESTAMP
        else:
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
        
        return lambda_response({'success': True, 'offering': payload}, 201)
    except Exception as e:
        print(f"Error in publish_offering_from_future: {str(e)}")
        return lambda_response({'success': False, 'error': 'Internal server error'}, 500)


def list_supply_offerings(event, context, uid):
    """GET /api/supply/offerings/<uid>"""
    try:
        if not uid:
            return lambda_response({'success': False, 'error': 'UID is required'}, 400)
        
        try:
            query = db.collection('offerings')\
                .where('ownerUid', '==', uid)\
                .order_by('availableAt', direction=firestore.Query.DESCENDING)\
                .limit(100)
            docs = query.get()
        except Exception:
            query = db.collection('offerings')\
                .where('ownerUid', '==', uid)\
                .limit(100)
            docs = query.get()
        
        offerings = []
        for doc in docs:
            data = doc.to_dict() or {}
            data['id'] = doc.id
            data['createdAt'] = serialize_timestamp(data.get('createdAt'))
            data['updatedAt'] = serialize_timestamp(data.get('updatedAt'))
            data['availableAt'] = serialize_timestamp(data.get('availableAt'))
            offerings.append(data)
        
        if offerings:
            try:
                offerings.sort(key=lambda x: x.get('availableAt') or '', reverse=True)
            except Exception:
                pass
        
        return lambda_response({'success': True, 'offerings': offerings, 'count': len(offerings)})
    except Exception as e:
        print(f"Error in list_supply_offerings: {str(e)}")
        return lambda_response({'success': False, 'error': 'Internal server error'}, 500)


def update_supply_offering(event, context, offering_id, data):
    """PUT /api/supply/offerings/<offering_id>"""
    try:
        uid = (data.get('uid') or '').strip()
        if not uid:
            return lambda_response({'success': False, 'error': 'UID is required'}, 400)
        
        if not offering_id:
            return lambda_response({'success': False, 'error': 'Offering ID is required'}, 400)
        
        offering_ref = db.collection('offerings').document(offering_id)
        doc = offering_ref.get()
        if not doc.exists:
            return lambda_response({'success': False, 'error': 'Offering not found'}, 404)
        
        offering_data = doc.to_dict() or {}
        if offering_data.get('ownerUid') != uid:
            return lambda_response({'success': False, 'error': 'Unauthorized: Offering does not belong to this owner'}, 403)
        
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
            return lambda_response({'success': False, 'error': 'No valid fields to update'}, 400)
        
        updates['updatedAt'] = firestore.SERVER_TIMESTAMP
        offering_ref.update(updates)
        
        updated_doc = offering_ref.get()
        payload = updated_doc.to_dict() or {}
        payload['id'] = updated_doc.id
        payload['createdAt'] = serialize_timestamp(payload.get('createdAt'))
        payload['updatedAt'] = serialize_timestamp(payload.get('updatedAt'))
        payload['availableAt'] = serialize_timestamp(payload.get('availableAt'))
        
        return lambda_response({'success': True, 'offering': payload})
    except Exception as e:
        print(f"Error in update_supply_offering: {str(e)}")
        return lambda_response({'success': False, 'error': 'Internal server error'}, 500)


def delete_supply_offering(event, context, offering_id, data):
    """DELETE /api/supply/offerings/<offering_id>"""
    try:
        uid = (data.get('uid') or '').strip()
        if not uid:
            return lambda_response({'success': False, 'error': 'UID is required'}, 400)
        
        if not offering_id:
            return lambda_response({'success': False, 'error': 'Offering ID is required'}, 400)
        
        offering_ref = db.collection('offerings').document(offering_id)
        doc = offering_ref.get()
        if not doc.exists:
            return lambda_response({'success': False, 'error': 'Offering not found'}, 404)
        
        offering_data = doc.to_dict() or {}
        if offering_data.get('ownerUid') != uid:
            return lambda_response({'success': False, 'error': 'Unauthorized: Offering does not belong to this owner'}, 403)
        
        offering_ref.delete()
        
        return lambda_response({'success': True, 'message': 'Offering deleted successfully'})
    except Exception as e:
        print(f"Error in delete_supply_offering: {str(e)}")
        return lambda_response({'success': False, 'error': 'Internal server error'}, 500)


def supply_analytics(event, context, uid):
    """GET /api/supply/analytics/<uid>"""
    try:
        if not uid:
            return lambda_response({'success': False, 'error': 'UID is required'}, 400)
        
        try:
            order_query = db.collection('orders')\
                .where('ownerUid', '==', uid)\
                .order_by('createdAt', direction=firestore.Query.DESCENDING)\
                .limit(200)
            order_docs = order_query.get()
        except Exception:
            order_query = db.collection('orders')\
                .where('ownerUid', '==', uid)\
                .limit(200)
            order_docs = order_query.get()
        
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
        
        if orders_list:
            try:
                orders_list.sort(key=lambda x: serialize_timestamp(x.get('createdAt')) or '', reverse=True)
            except Exception:
                pass
        
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
        return lambda_response(response)
    except Exception as e:
        print(f"Error in supply_analytics: {str(e)}")
        return lambda_response({'success': False, 'error': 'Internal server error'}, 500)


def supply_orders(event, context, uid, query_params):
    """GET /api/supply/orders/<uid>"""
    try:
        if not uid:
            return lambda_response({'success': False, 'error': 'UID is required'}, 400)
        
        limit = int(query_params.get('limit', 50))
        limit = max(1, min(limit, 200))
        
        try:
            query = db.collection('orders')\
                .where('ownerUid', '==', uid)\
                .order_by('createdAt', direction=firestore.Query.DESCENDING)\
                .limit(limit)
            docs = query.get()
        except Exception:
            query = db.collection('orders')\
                .where('ownerUid', '==', uid)\
                .limit(limit)
            docs = query.get()
        
        orders = []
        for doc in docs:
            data = doc.to_dict() or {}
            data['id'] = doc.id
            data['createdAt'] = serialize_timestamp(data.get('createdAt'))
            data['updatedAt'] = serialize_timestamp(data.get('updatedAt'))
            data['collectedAt'] = serialize_timestamp(data.get('collectedAt'))
            orders.append(data)
        
        if orders:
            try:
                orders.sort(key=lambda x: x.get('createdAt') or '', reverse=True)
            except Exception:
                pass
        
        return lambda_response({'success': True, 'orders': orders, 'count': len(orders)})
    except Exception as e:
        print(f"Error in supply_orders: {str(e)}")
        return lambda_response({'success': False, 'error': 'Internal server error'}, 500)


def create_custom_qr(event, context, data):
    """POST /api/qrcodes"""
    try:
        owner_uid = (data.get('uid') or '').strip()
        title = (data.get('title') or '').strip()
        purpose = (data.get('purpose') or '').strip()
        expires_at = parse_iso_datetime(data.get('expiresAt'))
        
        if not owner_uid:
            return lambda_response({'success': False, 'error': 'UID is required'}, 400)
        
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
        
        return lambda_response({'success': True, 'qrCode': record}, 201)
    except Exception as e:
        print(f"Error in create_custom_qr: {str(e)}")
        return lambda_response({'success': False, 'error': 'Internal server error'}, 500)


def list_custom_qr(event, context, uid):
    """GET /api/qrcodes/<uid>"""
    try:
        if not uid:
            return lambda_response({'success': False, 'error': 'UID is required'}, 400)
        
        try:
            docs = db.collection('qrCodes')\
                .where('ownerUid', '==', uid)\
                .order_by('createdAt', direction=firestore.Query.DESCENDING)\
                .limit(50)\
                .get()
        except Exception:
            docs = db.collection('qrCodes')\
                .where('ownerUid', '==', uid)\
                .limit(50)\
                .get()
        
        qr_codes = []
        for doc in docs:
            data = doc.to_dict() or {}
            data['id'] = doc.id
            data['qrToken'] = data.get('qrToken', doc.id)
            data['createdAt'] = serialize_timestamp(data.get('createdAt'))
            data['expiresAt'] = serialize_timestamp(data.get('expiresAt'))
            qr_codes.append(data)
        
        return lambda_response({'success': True, 'qrCodes': qr_codes, 'count': len(qr_codes)})
    except Exception as e:
        print(f"Error in list_custom_qr: {str(e)}")
        return lambda_response({'success': False, 'error': 'Internal server error'}, 500)
