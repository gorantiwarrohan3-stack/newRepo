import uuid
from datetime import datetime, timedelta, timezone

import firebase_admin
from firebase_admin import credentials, firestore


# Update this path if your service account file lives elsewhere
SERVICE_ACCOUNT_PATH = "serviceAccountKey.json"

# Demo IDs used across the seed data
STUDENT_UID = "studentDemo001"
SUPPLY_OWNER_UID = "supplyOwnerDemo001"


def iso_ts(days=0, hours=0):
    return datetime.now(timezone.utc) + timedelta(days=days, hours=hours)


def main():
    cred = credentials.Certificate(SERVICE_ACCOUNT_PATH)
    firebase_admin.initialize_app(cred)
    db = firestore.client()

    # --- USERS ---
    db.collection("users").document(STUDENT_UID).set({
        "uid": STUDENT_UID,
        "name": "Arjun Sharma",
        "email": "arjun.student@example.com",
        "phoneNumber": "+11234567890",
        "address": "Dormitory A",
        "role": "student",
        "subscription": {
            "active": True,
            "waived": True,
            "monthlyFeeCents": 100,
            "activatedAt": iso_ts(-15),
            "renewsAt": iso_ts(15),
        },
        "createdAt": firestore.SERVER_TIMESTAMP,
        "updatedAt": firestore.SERVER_TIMESTAMP,
    })

    db.collection("users").document(SUPPLY_OWNER_UID).set({
        "uid": SUPPLY_OWNER_UID,
        "name": "Temple Kitchen",
        "email": "kitchen@example.com",
        "phoneNumber": "+11234567891",
        "address": "Temple Complex",
        "role": "supplyOwner",
        "createdAt": firestore.SERVER_TIMESTAMP,
        "updatedAt": firestore.SERVER_TIMESTAMP,
    })

    # --- OFFERINGS ---
    offering_ref = db.collection("offerings").document()
    offering_ref.set({
        "title": "Masala Dosa",
        "description": "Fresh dosa with coconut chutney",
        "status": "available",
        "availableQuantity": 40,
        "feeCents": 100,
        "launchFeeRefund": True,
        "availableAt": iso_ts(hours=-1),
        "ownerUid": SUPPLY_OWNER_UID,
        "createdAt": firestore.SERVER_TIMESTAMP,
        "updatedAt": firestore.SERVER_TIMESTAMP,
    })

    # --- SUPPLY BATCHES ---
    db.collection("supplyBatches").add({
        "ownerUid": SUPPLY_OWNER_UID,
        "title": "Saturday Morning Batch",
        "quantity": 120,
        "remainingQuantity": 88,
        "expirationAt": iso_ts(hours=6),
        "notes": "Stored in walk-in fridge, volunteers on shift",
        "status": "active",
        "createdAt": firestore.SERVER_TIMESTAMP,
        "updatedAt": firestore.SERVER_TIMESTAMP,
    })

    # --- FUTURE OFFERINGS ---
    db.collection("futureOfferings").add({
        "ownerUid": SUPPLY_OWNER_UID,
        "title": "Navaratri Special",
        "description": "Sweet pongal served after evening aarti",
        "scheduledAt": iso_ts(days=3, hours=2),
        "notes": "Need four extra volunteers",
        "createdAt": firestore.SERVER_TIMESTAMP,
        "updatedAt": firestore.SERVER_TIMESTAMP,
    })

    # --- QR CODES ---
    custom_qr_token = str(uuid.uuid4())
    db.collection("qrCodes").document(custom_qr_token).set({
        "ownerUid": SUPPLY_OWNER_UID,
        "qrToken": custom_qr_token,
        "title": "Club Meeting Access",
        "purpose": "Weekly satsang entry",
        "createdAt": firestore.SERVER_TIMESTAMP,
        "expiresAt": iso_ts(days=7),
    })

    # --- ORDERS (sample history) ---
    order_id = str(uuid.uuid4())
    db.collection("orders").document(order_id).set({
        "orderId": order_id,
        "uid": STUDENT_UID,
        "offeringId": offering_ref.id,
        "offeringTitle": "Masala Dosa",
        "ownerUid": SUPPLY_OWNER_UID,
        "status": "pending",
        "feeCents": 100,
        "feeRefundEligible": True,
        "subscriptionWaived": True,
        "qrToken": str(uuid.uuid4()),
        "createdAt": firestore.SERVER_TIMESTAMP,
        "updatedAt": firestore.SERVER_TIMESTAMP,
    })

    print("Firestore seeded successfully.")


if __name__ == "__main__":
    main()
