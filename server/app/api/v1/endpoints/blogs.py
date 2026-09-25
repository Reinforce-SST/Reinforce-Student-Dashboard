"""Blogs, Upvotes, and Comments API endpoints."""

from typing import Any, Dict, List, Optional
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, status
from google.cloud import firestore

from app.api.security import get_current_user
from app.utils import iso_str, now_iso, slugify
from app.services.firebase import db, upload_file_to_storage
from app.schemas.blogs import (
    BlogCreate,
    BlogDetail,
    BlogListResponse,
    BlogStats,
    BlogStatus,
    BlogSummary,
    BlogUpdate,
    CommentCreate,
    CommentResponse,
    CommentTreeResponse,
    UpvoteToggleResponse,
    calculate_reading_time,
)

router = APIRouter(prefix="/blogs", tags=["Blogs"])

BLOGS_COLLECTION = "blogs"
COMMENTS_SUBCOLLECTION = "comments"
UPVOTES_SUBCOLLECTION = "upvotes"


# ---------------------------------------------------------------------------
# Internal Helpers
# ---------------------------------------------------------------------------

def _to_blog_summary(doc_id: str, data: Dict[str, Any]) -> BlogSummary:
    stats_raw = data.get("stats") or {}
    stats = BlogStats(
        upvote_count=int(stats_raw.get("upvote_count", 0)),
        comment_count=int(stats_raw.get("comment_count", 0)),
        view_count=int(stats_raw.get("view_count", 0)),
    )

    return BlogSummary(
        id=doc_id,
        slug=data.get("slug") or doc_id,
        title=data.get("title") or "Untitled",
        summary=data.get("summary") or "",
        cover_image_url=data.get("cover_image_url"),
        author_uid=data.get("author_uid") or "",
        tags=data.get("tags") or [],
        reading_time_minutes=int(data.get("reading_time_minutes") or 1),
        status=data.get("status") or BlogStatus.DRAFT,
        created_at=iso_str(data.get("created_at")),
        published_at=iso_str(data.get("published_at")),
        stats=stats,
    )


def _to_blog_detail(doc_id: str, data: Dict[str, Any]) -> BlogDetail:
    summary = _to_blog_summary(doc_id, data)
    return BlogDetail(
        **summary.model_dump(),
        content=data.get("content") or "",
        updated_at=iso_str(data.get("updated_at")),
    )


def _find_blog_doc(id_or_slug: str):
    """Retrieve blog document by ID or slug."""
    # 1. Try direct lookup by document ID
    doc_ref = db.collection(BLOGS_COLLECTION).document(id_or_slug)
    doc = doc_ref.get()
    if doc.exists:
        return doc_ref, doc

    # 2. Try lookup by slug
    query = (
        db.collection(BLOGS_COLLECTION)
        .where("slug", "==", id_or_slug)
        .limit(1)
        .stream()
    )
    for match in query:
        return match.reference, match

    return None, None


# ---------------------------------------------------------------------------
# Blog Upload & Management Endpoints
# ---------------------------------------------------------------------------

@router.post("/upload", summary="Upload a markdown file asset to storage")
def upload_blog_markdown(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    if file.content_type not in ["text/markdown", "text/x-markdown", "application/octet-stream"]:
        if not file.filename or not file.filename.endswith(".md"):
            raise HTTPException(status_code=400, detail="Only .md files are allowed.")

    safe_filename = f"{uuid.uuid4()}.md"
    destination_path = f"blogs/{user['uid']}/{safe_filename}"

    public_url = upload_file_to_storage(
        file_obj=file.file,
        destination_path=destination_path,
        content_type="text/markdown",
    )
    return {"message": "Blog uploaded", "url": public_url}


@router.get("", response_model=BlogListResponse, summary="List published blogs")
def list_blogs(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(10, ge=1, le=50, description="Items per page"),
    tag: Optional[str] = Query(None, description="Filter by tag"),
    search: Optional[str] = Query(None, description="Search term in title or summary"),
    status_filter: BlogStatus = Query(BlogStatus.PUBLISHED, alias="status", description="Status filter"),
) -> BlogListResponse:
    """Fetch published blogs feed with pagination, tag filter, and search."""
    query = db.collection(BLOGS_COLLECTION).where("status", "==", status_filter.value)

    if tag:
        query = query.where("tags", "array_contains", tag.strip().lower())

    docs = query.stream()
    all_blogs: List[BlogSummary] = []

    for doc in docs:
        data = doc.to_dict() or {}
        summary = _to_blog_summary(doc.id, data)

        if search:
            s = search.strip().lower()
            title_match = s in summary.title.lower()
            summary_match = s in summary.summary.lower()
            tag_match = any(s in t.lower() for t in summary.tags)
            if not (title_match or summary_match or tag_match):
                continue

        all_blogs.append(summary)

    all_blogs.sort(key=lambda b: b.published_at or b.created_at or "", reverse=True)

    total = len(all_blogs)
    start = (page - 1) * page_size
    end = start + page_size
    items = all_blogs[start:end]
    has_more = end < total

    return BlogListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        has_more=has_more,
    )


@router.get("/{id_or_slug}", response_model=BlogDetail, summary="Get single blog content")
def get_blog(id_or_slug: str) -> BlogDetail:
    """Fetch blog details by document ID or slug and increment view count."""
    doc_ref, doc = _find_blog_doc(id_or_slug)
    if not doc or not doc.exists:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Blog not found")

    data = doc.to_dict() or {}

    # Atomically increment view count
    try:
        doc_ref.update({"stats.view_count": firestore.Increment(1)})
        data_stats = data.get("stats") or {}
        data_stats["view_count"] = int(data_stats.get("view_count", 0)) + 1
        data["stats"] = data_stats
    except Exception:
        pass

    return _to_blog_detail(doc.id, data)


@router.post("", response_model=BlogDetail, status_code=status.HTTP_201_CREATED, summary="Create a new blog post")
def create_blog(
    blog_in: BlogCreate,
    user: dict = Depends(get_current_user),
) -> BlogDetail:
    """Create a new blog post (draft or published)."""
    now = now_iso()

    base_slug = blog_in.slug or slugify(blog_in.title)
    slug = base_slug

    existing = list(db.collection(BLOGS_COLLECTION).where("slug", "==", slug).limit(1).stream())
    if existing:
        slug = f"{base_slug}-{uuid.uuid4().hex[:6]}"

    reading_time = calculate_reading_time(blog_in.content)
    published_at = now if blog_in.status == BlogStatus.PUBLISHED else None

    doc_ref = db.collection(BLOGS_COLLECTION).document()
    blog_doc = {
        "id": doc_ref.id,
        "slug": slug,
        "title": blog_in.title,
        "summary": blog_in.summary,
        "content": blog_in.content,
        "cover_image_url": blog_in.cover_image_url,
        "author_uid": user["uid"],
        "tags": [t.lower().strip() for t in blog_in.tags],
        "reading_time_minutes": reading_time,
        "status": blog_in.status.value,
        "created_at": now,
        "updated_at": now,
        "published_at": published_at,
        "stats": {
            "upvote_count": 0,
            "comment_count": 0,
            "view_count": 0,
        },
    }

    doc_ref.set(blog_doc)
    return _to_blog_detail(doc_ref.id, blog_doc)


@router.put("/{blog_id}", response_model=BlogDetail, summary="Edit an existing blog post")
def update_blog(
    blog_id: str,
    blog_in: BlogUpdate,
    user: dict = Depends(get_current_user),
) -> BlogDetail:
    """Edit an existing blog post. Only author can update."""
    doc_ref = db.collection(BLOGS_COLLECTION).document(blog_id)
    doc = doc_ref.get()

    if not doc.exists:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Blog not found")

    data = doc.to_dict() or {}
    if data.get("author_uid") != user["uid"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only edit your own blogs")

    now = now_iso()
    updates: Dict[str, Any] = {"updated_at": now}

    if blog_in.title is not None:
        updates["title"] = blog_in.title
    if blog_in.summary is not None:
        updates["summary"] = blog_in.summary
    if blog_in.cover_image_url is not None:
        updates["cover_image_url"] = blog_in.cover_image_url
    if blog_in.content is not None:
        updates["content"] = blog_in.content
        updates["reading_time_minutes"] = calculate_reading_time(blog_in.content)
    if blog_in.tags is not None:
        updates["tags"] = [t.lower().strip() for t in blog_in.tags]
    if blog_in.slug is not None:
        updates["slug"] = slugify(blog_in.slug)
    if blog_in.status is not None:
        updates["status"] = blog_in.status.value
        if blog_in.status == BlogStatus.PUBLISHED and not data.get("published_at"):
            updates["published_at"] = now

    doc_ref.update(updates)
    updated_doc = doc_ref.get()
    return _to_blog_detail(blog_id, updated_doc.to_dict() or {})


@router.delete("/{blog_id}", summary="Delete a blog post")
def delete_blog(
    blog_id: str,
    user: dict = Depends(get_current_user),
):
    """Delete a blog post. Only the author can delete."""
    doc_ref = db.collection(BLOGS_COLLECTION).document(blog_id)
    doc = doc_ref.get()

    if not doc.exists:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Blog not found")

    data = doc.to_dict() or {}
    if data.get("author_uid") != user["uid"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only delete your own blogs")

    doc_ref.delete()
    return {"message": "Blog deleted successfully", "id": blog_id}


# ---------------------------------------------------------------------------
# Upvote Endpoints
# ---------------------------------------------------------------------------

@router.post("/{blog_id}/upvote", response_model=UpvoteToggleResponse, summary="Toggle upvote on a blog")
def toggle_upvote(
    blog_id: str,
    user: dict = Depends(get_current_user),
) -> UpvoteToggleResponse:
    """Toggle upvote state for the calling user using Firestore transaction."""
    user_uid = user["uid"]
    blog_ref = db.collection(BLOGS_COLLECTION).document(blog_id)
    upvote_ref = blog_ref.collection(UPVOTES_SUBCOLLECTION).document(user_uid)

    transaction = db.transaction()

    @firestore.transactional
    def _toggle(txn: firestore.Transaction):
        blog_snap = blog_ref.get(transaction=txn)
        if not blog_snap.exists:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Blog not found")

        upvote_snap = upvote_ref.get(transaction=txn)
        blog_data = blog_snap.to_dict() or {}
        current_upvotes = int((blog_data.get("stats") or {}).get("upvote_count", 0))

        if upvote_snap.exists:
            txn.delete(upvote_ref)
            new_count = max(0, current_upvotes - 1)
            txn.update(blog_ref, {"stats.upvote_count": new_count})
            return False, new_count
        else:
            txn.set(upvote_ref, {
                "user_uid": user_uid,
                "created_at": now_iso(),
            })
            new_count = current_upvotes + 1
            txn.update(blog_ref, {"stats.upvote_count": new_count})
            return True, new_count

    upvoted, count = _toggle(transaction)
    return UpvoteToggleResponse(upvoted=upvoted, upvote_count=count)


# ---------------------------------------------------------------------------
# Comment Endpoints (1-Layer Hierarchy)
# ---------------------------------------------------------------------------

@router.get("/{blog_id}/comments", response_model=CommentTreeResponse, summary="Fetch comments tree for a blog")
def get_comments(blog_id: str) -> CommentTreeResponse:
    """Fetch all comments for a blog structured as a 1-layer reply tree."""
    blog_doc = db.collection(BLOGS_COLLECTION).document(blog_id).get()
    if not blog_doc.exists:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Blog not found")

    docs = (
        db.collection(BLOGS_COLLECTION)
        .document(blog_id)
        .collection(COMMENTS_SUBCOLLECTION)
        .order_by("created_at")
        .stream()
    )

    root_comments: Dict[str, CommentResponse] = {}
    child_replies: List[CommentResponse] = []
    total_count = 0

    for doc in docs:
        total_count += 1
        data = doc.to_dict() or {}

        comment = CommentResponse(
            id=doc.id,
            blog_id=blog_id,
            parent_id=data.get("parent_id"),
            reply_to_user=data.get("reply_to_user"),
            content=data.get("content") or "",
            author_uid=data.get("author_uid"),
            reply_count=int(data.get("reply_count", 0)),
            is_edited=bool(data.get("is_edited", False)),
            is_deleted=bool(data.get("is_deleted", False)),
            created_at=iso_str(data.get("created_at")),
            updated_at=iso_str(data.get("updated_at")),
            replies=[],
        )

        if not comment.parent_id:
            root_comments[comment.id] = comment
        else:
            child_replies.append(comment)

    for reply in child_replies:
        parent = root_comments.get(reply.parent_id or "")
        if parent:
            parent.replies.append(reply)

    return CommentTreeResponse(
        blog_id=blog_id,
        total_comments=total_count,
        comments=list(root_comments.values()),
    )


@router.post("/{blog_id}/comments", response_model=CommentResponse, status_code=status.HTTP_201_CREATED, summary="Add a comment or reply")
def create_comment(
    blog_id: str,
    comment_in: CommentCreate,
    user: dict = Depends(get_current_user),
) -> CommentResponse:
    """Post a top-level comment or reply (enforces 1-layer depth)."""
    blog_ref = db.collection(BLOGS_COLLECTION).document(blog_id)
    if not blog_ref.get().exists:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Blog not found")

    now = now_iso()
    target_parent_id: Optional[str] = None
    reply_to_user: Optional[str] = comment_in.reply_to_user

    if comment_in.parent_id:
        parent_doc_ref = blog_ref.collection(COMMENTS_SUBCOLLECTION).document(comment_in.parent_id)
        parent_doc = parent_doc_ref.get()
        if not parent_doc.exists:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Parent comment not found")

        parent_data = parent_doc.to_dict() or {}
        grandparent_id = parent_data.get("parent_id")

        if grandparent_id:
            target_parent_id = grandparent_id
        else:
            target_parent_id = comment_in.parent_id

        try:
            blog_ref.collection(COMMENTS_SUBCOLLECTION).document(target_parent_id).update({
                "reply_count": firestore.Increment(1)
            })
        except Exception:
            pass

    comment_ref = blog_ref.collection(COMMENTS_SUBCOLLECTION).document()
    comment_data = {
        "id": comment_ref.id,
        "blog_id": blog_id,
        "parent_id": target_parent_id,
        "reply_to_user": reply_to_user,
        "content": comment_in.content,
        "author_uid": user["uid"],
        "reply_count": 0,
        "is_edited": False,
        "is_deleted": False,
        "created_at": now,
        "updated_at": now,
    }

    comment_ref.set(comment_data)

    try:
        blog_ref.update({"stats.comment_count": firestore.Increment(1)})
    except Exception:
        pass

    return CommentResponse(
        id=comment_ref.id,
        blog_id=blog_id,
        parent_id=target_parent_id,
        reply_to_user=reply_to_user,
        content=comment_in.content,
        author_uid=user["uid"],
        reply_count=0,
        is_edited=False,
        is_deleted=False,
        created_at=now,
        updated_at=now,
        replies=[],
    )


@router.delete("/{blog_id}/comments/{comment_id}", summary="Soft delete a comment")
def delete_comment(
    blog_id: str,
    comment_id: str,
    user: dict = Depends(get_current_user),
):
    """Soft delete a comment. Only the author can delete."""
    blog_ref = db.collection(BLOGS_COLLECTION).document(blog_id)
    comment_ref = blog_ref.collection(COMMENTS_SUBCOLLECTION).document(comment_id)
    comment_doc = comment_ref.get()

    if not comment_doc.exists:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found")

    data = comment_doc.to_dict() or {}
    if data.get("author_uid") != user["uid"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only delete your own comments")

    now = now_iso()
    comment_ref.update({
        "is_deleted": True,
        "updated_at": now,
    })

    return {"message": "Comment deleted successfully", "id": comment_id}
