from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from firebase_admin import auth
# Ensure firebase is initialized before auth is called
import app.firebase

security = HTTPBearer()

def get_current_user(
        cred: HTTPAuthorizationCredentials = Depends(security)
):
    if not cred:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, 
            detail="Invalid authentication credentials"
        )

    try:
        # Verifies the token and decodes the user payload
        decoded_token = auth.verify_id_token(cred.credentials)
        
        # Restrict login to SST student emails
        email = decoded_token.get("email", "").lower().strip()
        if not email.endswith("@sst.scaler.com") or decoded_token.get("email_verified") is not True:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, 
                detail="A verified SST student email is required for club access."
            )
            
        return decoded_token
        
    except auth.InvalidIdTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, 
            detail="Invalid or expired token"
        )