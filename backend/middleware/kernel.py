import jwt
from fastapi import HTTPException, Depends, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import os
from typing import Dict, Any
from db import get_connection

# Standard Bearer token authentication scheme for FastAPI
security = HTTPBearer()

# In a real environment, this is injected securely via the .env file. this is a bas layout environement 
# We default to a mock secret for local hackathon development if not provided.
JWT_SECRET = os.getenv("JWT_SECRET", "super-secret-enterprise-key-do-not-share")
JWT_ALGORITHM = "HS256"

def decode_token(credentials: HTTPAuthorizationCredentials = Security(security)) -> Dict[str, Any]:
    """
    Decodes the JWT Bearer token passed in the Authorization header.
    Validates the signature and extracts the payload.
    """
    token = credentials.credentials
    try:
        # Decode the payload. In production, this verifies against Supabase Auth signatures.
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired. Please log in again.")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token. Access denied.")

def get_current_user_tenant(payload: dict = Depends(decode_token)) -> Dict[str, Any]:
    """
    Security Kernel: Extracts the Identity, Role, and Tenant (ABAC) from the validated JWT.
    This replaces our previous mock function and implements true role allocation.
    """
    # Extract identity fields required by the architecture ERD
    user_id = payload.get("sub") # UUID
    company_id = payload.get("company_id") # Tenant for ABAC
    role_profile = payload.get("role_profile") # Role for RBAC (e.g. 'employee', 'admin')

    # Security check: Ensure the JWT actually contains the necessary enterprise fields.
    if not user_id or not company_id or not role_profile:
        raise HTTPException(status_code=403, detail="Incomplete security context in token.")

    connection = get_connection()
    account = connection.execute(
        "SELECT company_id, role FROM users WHERE id = ?",
        (user_id,),
    ).fetchone()
    connection.close()
    if not account or account["company_id"] != company_id or account["role"] != role_profile:
        raise HTTPException(status_code=401, detail="Security context no longer matches the account.")

    return {
        "uid": user_id,
        "sub": user_id,
        "company_id": company_id,
        "role": role_profile,
    }

def verify_abac_tenant(user: dict = Depends(get_current_user_tenant)) -> Dict[str, Any]:
    """
    Attribute-Based Access Control (ABAC): 
    Enforces that the user belongs to a valid corporate tenant before allowing spatial queries.
    """
    if not user.get("company_id"):
        raise HTTPException(status_code=403, detail="ABAC Violation: Tenant context missing.")
    return user

def require_admin_role(user: dict = Depends(get_current_user_tenant)) -> Dict[str, Any]:
    """
    Role-Based Access Control (RBAC):
    Restricts access strictly to users with the 'admin' role profile.
    """
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="RBAC Violation: Admin clearance required.")
    return user
