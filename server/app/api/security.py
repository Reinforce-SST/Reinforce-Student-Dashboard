from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from firebase_admin import auth

from app.services.firebase import ensure_app

security = HTTPBearer()

def get_current_user(
        cred: HTTPAuthorizationCredentials = Depends(security)
):
    # Firebase must be initialised before a token can be verified.
    ensure_app()

    if not cred:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, 
            detail="Invalid authentication credentials"
        )

    try:
        # Verifies the token and decodes the user payload
        decoded_token = auth.verify_id_token(cred.credentials)
        
        # Restrict login to SST student emails
        email = decoded_token.get("email", "")
        if not email.endswith("@sst.scaler.com"): # Update with exact SST domain if different
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, 
                detail="An SST student email is required for club access."
            )
            
        return decoded_token
        
    except auth.InvalidIdTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token"
        )


def require_admin(user: dict = Depends(get_current_user)) -> dict:
    """Admin access, from the Firebase custom claim `admin`.

    Fails closed: only the exact boolean True passes, so a missing claim, a
    false one or a truthy string is rejected. Provisioning the claim on an
    account is an environment setup step, not something this API grants.
    """
    if user.get("admin") is not True:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrator privileges are required.",
        )
    return user