"""Invitations API endpoints for SPGs and Event Teams.

Enforces that joining an SPG or Event Team requires an explicit invitation from
the group lead, which the invitee can accept or decline.
"""

from datetime import datetime, timezone
import secrets
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.api.security import get_current_user
from app.services.firebase import db
from app.utils import get_user_uid, is_admin_user, now_iso
from app.schemas.invitations import (
    CreateInvitationRequest,
    InvitationResponse,
    InvitationStatus,
    InvitationType,
)

router = APIRouter(prefix="/invitations", tags=["invitations"])

INVITATIONS_COLLECTION = "invitations"
SPGS_COLLECTION = "spgs"
EVENTS_COLLECTION = "events"
REGISTRATIONS_SUBCOLLECTION = "registrations"
USERS_COLLECTION = "users"


def _doc_to_invitation(doc_dict: Dict[str, Any]) -> InvitationResponse:
    return InvitationResponse(
        id=doc_dict.get("id") or "",
        type=doc_dict.get("type") or "spg",
        target_id=doc_dict.get("target_id") or "",
        target_name=doc_dict.get("target_name") or "",
        event_id=doc_dict.get("event_id"),
        spg_id=doc_dict.get("spg_id"),
        team_name=doc_dict.get("team_name"),
        inviter_uid=doc_dict.get("inviter_uid") or "",
        inviter_name=doc_dict.get("inviter_name") or "Team Lead",
        inviter_email=doc_dict.get("inviter_email"),
        invitee_uid=doc_dict.get("invitee_uid") or "",
        invitee_name=doc_dict.get("invitee_name") or "Student",
        invitee_email=doc_dict.get("invitee_email"),
        status=doc_dict.get("status") or "pending",
        role=doc_dict.get("role") or "member",
        created_at=doc_dict.get("created_at") or now_iso(),
        updated_at=doc_dict.get("updated_at") or now_iso(),
        expires_at=doc_dict.get("expires_at"),
    )


@router.post("", response_model=InvitationResponse, status_code=status.HTTP_201_CREATED)
def create_invitation(
    payload: CreateInvitationRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Invite a student to an SPG or Event Team."""
    inviter_uid = get_user_uid(current_user)
    if inviter_uid == payload.invitee_uid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot invite yourself.",
        )

    # 1. Fetch inviter info
    inviter_doc = db.collection(USERS_COLLECTION).document(inviter_uid).get()
    inviter_data = inviter_doc.to_dict() or {}
    inviter_name = (
        inviter_data.get("full_name")
        or current_user.get("name")
        or inviter_data.get("email")
        or "Teammate"
    )
    inviter_email = inviter_data.get("email") or current_user.get("email")

    # 2. Fetch invitee info
    invitee_doc = db.collection(USERS_COLLECTION).document(payload.invitee_uid).get()
    if not invitee_doc.exists:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User {payload.invitee_uid} not found.",
        )
    invitee_data = invitee_doc.to_dict() or {}
    invitee_name = invitee_data.get("full_name") or invitee_data.get("email") or "Student"
    invitee_email = invitee_data.get("email")

    target_name = ""
    event_id: Optional[str] = payload.event_id
    spg_id: Optional[str] = payload.spg_id
    team_name: Optional[str] = payload.team_name

    # 3. Validate target and permissions based on invitation type
    if payload.type == InvitationType.SPG:
        spg_doc = db.collection(SPGS_COLLECTION).document(payload.target_id).get()
        if not spg_doc.exists:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"SPG {payload.target_id} not found.",
            )
        spg_data = spg_doc.to_dict() or {}
        # Only lead, active member, or admin can invite
        is_lead = spg_data.get("lead_id") == inviter_uid
        is_member = inviter_uid in (spg_data.get("member_ids") or [])
        if not (is_lead or is_member or is_admin_user(current_user)):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only SPG leads or active members can invite new participants.",
            )
        if payload.invitee_uid in (spg_data.get("member_ids") or []):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User is already a member of this SPG.",
            )
        target_name = spg_data.get("name") or "Special Project Group"
        spg_id = payload.target_id
        team_name = spg_data.get("name")

    elif payload.type in (InvitationType.EVENT_TEAM, InvitationType.EVENT_SPG):
        event_ref = db.collection(EVENTS_COLLECTION).document(payload.target_id)
        event_doc = event_ref.get()
        if not event_doc.exists:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Event {payload.target_id} not found.",
            )
        event_data = event_doc.to_dict() or {}
        target_name = event_data.get("title") or "Event"
        event_id = payload.target_id

        # Find inviter's registration for this event
        regs_ref = event_ref.collection(REGISTRATIONS_SUBCOLLECTION)
        user_regs = list(regs_ref.where("user_id", "==", inviter_uid).stream())
        active_leads = [
            r for r in user_regs if (r.to_dict() or {}).get("status") in ("registered", "waitlisted")
        ]
        if not active_leads and not is_admin_user(current_user):
            # Check if user is a member of any active team registration
            team_regs = list(regs_ref.where("member_uids", "array_contains", inviter_uid).stream())
            active_team = [
                r for r in team_regs if (r.to_dict() or {}).get("status") in ("registered", "waitlisted")
            ]
            if not active_team:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="You do not have an active team registration for this event.",
                )
            reg_doc = active_team[0]
        else:
            reg_doc = active_leads[0] if active_leads else None

        if not reg_doc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No registered team found where you are lead.",
            )

        reg_data = reg_doc.to_dict() or {}
        team_name = reg_data.get("team_name") or team_name or "Team"
        spg_id = reg_data.get("spg_id") or spg_id
        member_uids = reg_data.get("member_uids") or [inviter_uid]

        # Check max team capacity
        max_size = (event_data.get("participation") or {}).get("max_team_size") or 4
        if len(member_uids) >= max_size:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Team is already at maximum capacity ({max_size} members).",
            )

        if payload.invitee_uid in member_uids:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User is already a member of this team.",
            )

        # Check if invitee is already registered for this event
        invitee_regs = list(regs_ref.where("user_id", "==", payload.invitee_uid).stream())
        active_invitee = [
            r for r in invitee_regs if (r.to_dict() or {}).get("status") in ("registered", "waitlisted")
        ]
        if active_invitee:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This student is already registered for this event.",
            )

    # 4. Check for duplicate pending invitation
    existing = list(
        db.collection(INVITATIONS_COLLECTION)
        .where("target_id", "==", payload.target_id)
        .where("invitee_uid", "==", payload.invitee_uid)
        .where("status", "==", InvitationStatus.PENDING.value)
        .stream()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A pending invitation has already been sent to this student.",
        )

    # 5. Create invitation document
    inv_id = f"inv_{secrets.token_hex(6)}"
    now = now_iso()
    inv_data = {
        "id": inv_id,
        "type": payload.type.value,
        "target_id": payload.target_id,
        "target_name": target_name,
        "event_id": event_id,
        "spg_id": spg_id,
        "team_name": team_name,
        "inviter_uid": inviter_uid,
        "inviter_name": inviter_name,
        "inviter_email": inviter_email,
        "invitee_uid": payload.invitee_uid,
        "invitee_name": invitee_name,
        "invitee_email": invitee_email,
        "status": InvitationStatus.PENDING.value,
        "role": "member",
        "created_at": now,
        "updated_at": now,
    }

    db.collection(INVITATIONS_COLLECTION).document(inv_id).set(inv_data)
    return _doc_to_invitation(inv_data)


@router.get("/me", response_model=List[InvitationResponse])
def get_my_invitations(
    status: Optional[str] = "pending",
    type: Optional[str] = None,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Retrieve incoming invitations for the logged-in user."""
    user_uid = get_user_uid(current_user)
    query = db.collection(INVITATIONS_COLLECTION).where("invitee_uid", "==", user_uid)

    if status and status != "all":
        query = query.where("status", "==", status)
    if type:
        query = query.where("type", "==", type)

    docs = [d.to_dict() or {} for d in query.stream()]
    docs.sort(key=lambda d: d.get("created_at") or "", reverse=True)
    return [_doc_to_invitation(d) for d in docs]


@router.get("/target/{target_id}", response_model=List[InvitationResponse])
def get_target_invitations(
    target_id: str,
    status: Optional[str] = None,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Retrieve all invitations associated with a specific SPG or Event."""
    query = db.collection(INVITATIONS_COLLECTION).where("target_id", "==", target_id)
    if status and status != "all":
        query = query.where("status", "==", status)

    docs = [d.to_dict() or {} for d in query.stream()]
    docs.sort(key=lambda d: d.get("created_at") or "", reverse=True)
    return [_doc_to_invitation(d) for d in docs]


@router.post("/{id}/accept", response_model=InvitationResponse)
def accept_invitation(
    id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Accept a pending invitation to join an SPG or Event Team."""
    user_uid = get_user_uid(current_user)
    inv_ref = db.collection(INVITATIONS_COLLECTION).document(id)
    inv_snap = inv_ref.get()

    if not inv_snap.exists:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invitation not found.",
        )

    inv_data = inv_snap.to_dict() or {}
    if inv_data.get("invitee_uid") != user_uid and not is_admin_user(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to accept this invitation.",
        )

    if inv_data.get("status") != InvitationStatus.PENDING.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invitation has already been {inv_data.get('status')}.",
        )

    inv_type = inv_data.get("type")
    target_id = inv_data.get("target_id")
    now = now_iso()

    # 1. For SPGs: add to SPG member_ids
    if inv_type == InvitationType.SPG.value or inv_data.get("spg_id"):
        spg_doc_id = inv_data.get("spg_id") or target_id
        spg_ref = db.collection(SPGS_COLLECTION).document(spg_doc_id)
        spg_snap = spg_ref.get()
        if spg_snap.exists:
            spg_d = spg_snap.to_dict() or {}
            current_members = set(spg_d.get("member_ids") or [])
            current_members.add(user_uid)
            spg_ref.update({
                "member_ids": list(current_members),
                "updated_at": now,
            })

    # 2. For Event Teams: add to registration.member_uids
    if inv_type in (InvitationType.EVENT_TEAM.value, InvitationType.EVENT_SPG.value):
        event_id = inv_data.get("event_id") or target_id
        event_ref = db.collection(EVENTS_COLLECTION).document(event_id)
        regs_ref = event_ref.collection(REGISTRATIONS_SUBCOLLECTION)

        # Locate team registration by inviter or team name
        inviter_uid = inv_data.get("inviter_uid")
        target_reg = None

        if inviter_uid:
            lead_regs = list(regs_ref.where("user_id", "==", inviter_uid).stream())
            active_lead_regs = [r for r in lead_regs if (r.to_dict() or {}).get("status") in ("registered", "waitlisted")]
            if active_lead_regs:
                target_reg = active_lead_regs[0]

        if not target_reg and inv_data.get("team_name"):
            team_regs = list(regs_ref.where("team_name", "==", inv_data.get("team_name")).stream())
            active_team_regs = [r for r in team_regs if (r.to_dict() or {}).get("status") in ("registered", "waitlisted")]
            if active_team_regs:
                target_reg = active_team_regs[0]

        if target_reg:
            reg_d = target_reg.to_dict() or {}
            members = set(reg_d.get("member_uids") or [])
            members.add(user_uid)
            target_reg.reference.update({
                "member_uids": list(members),
                "updated_at": now,
            })

    # 3. Update invitation status
    inv_ref.update({
        "status": InvitationStatus.ACCEPTED.value,
        "updated_at": now,
    })

    inv_data["status"] = InvitationStatus.ACCEPTED.value
    inv_data["updated_at"] = now
    return _doc_to_invitation(inv_data)


@router.post("/{id}/decline", response_model=InvitationResponse)
def decline_invitation(
    id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Decline a pending invitation."""
    user_uid = get_user_uid(current_user)
    inv_ref = db.collection(INVITATIONS_COLLECTION).document(id)
    inv_snap = inv_ref.get()

    if not inv_snap.exists:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invitation not found.",
        )

    inv_data = inv_snap.to_dict() or {}
    if inv_data.get("invitee_uid") != user_uid and not is_admin_user(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to decline this invitation.",
        )

    now = now_iso()
    inv_ref.update({
        "status": InvitationStatus.DECLINED.value,
        "updated_at": now,
    })

    inv_data["status"] = InvitationStatus.DECLINED.value
    inv_data["updated_at"] = now
    return _doc_to_invitation(inv_data)


@router.delete("/{id}")
def cancel_invitation(
    id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Cancel or revoke an outgoing invitation (lead or admin)."""
    user_uid = get_user_uid(current_user)
    inv_ref = db.collection(INVITATIONS_COLLECTION).document(id)
    inv_snap = inv_ref.get()

    if not inv_snap.exists:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invitation not found.",
        )

    inv_data = inv_snap.to_dict() or {}
    if inv_data.get("inviter_uid") != user_uid and not is_admin_user(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the inviter can cancel this invitation.",
        )

    now = now_iso()
    inv_ref.update({
        "status": InvitationStatus.CANCELLED.value,
        "updated_at": now,
    })

    return {"status": "cancelled", "id": id}
