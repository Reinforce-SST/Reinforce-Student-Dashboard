# Admin roles and the first admin

The API authorizes admin requests only when the verified Firebase ID token has
the boolean custom claim `admin: true`. The Firestore `users/{uid}.is_admin`
field is display metadata; setting it alone cannot authorize event creation.

On a server with the API's Firebase credentials, bootstrap the first verified
college account once:

```bash
cd server
python -m scripts.grant_admin admin@sst.scaler.com
python -m scripts.grant_admin admin@sst.scaler.com --apply
```

Use the actual account email. The member must sign out and back in to receive a
fresh ID token. After that, they can use **Admin → Member Directory** to grant
or remove other Admin roles. The API preserves unrelated custom claims when
changing the Admin claim. Beginner, Advanced, Core, and custom role labels never
grant API admin access.

Event and profile image uploads also require a provisioned Firebase Storage
bucket and `FIREBASE_STORAGE_BUCKET` configured on the API host. If storage is
unavailable, uploads return 503 and do not save an unusable image URL.
The API's Nginx server block must allow the 5 MB image limit, for example
`client_max_body_size 6m;` followed by `nginx -t` and a reload. A live 2 MB
upload probe on September 28 returned Nginx 413 before reaching the API, so
this proxy change is required for the feature to work in production.
