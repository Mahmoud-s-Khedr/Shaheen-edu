# Shaheen Edu API reference

Implementation-backed API contract. Every endpoint below is self-contained: its authorization, parameter/body fields, and success response fields appear in the same section. Base URL is `/api/v1`; `/health` is unversioned. Unknown JSON fields are rejected. Errors use `{ statusCode, code, message: { ar, en }, error: { ar, en }, details?, correlationId }`; `details` contains field-level bilingual validation feedback.

## Health

### `GET /health`

**Authorization:** Public

**Request**

No path, query, or header input.

**Success response — HTTP 200**

```json
{
  "status": "ok",
  "timestamp": "ISO-8601 date-time"
}
```

## Authentication

### `POST /api/v1/auth/students/register`

**Authorization:** Public

**Request**

No path, query, or header input.

```json
{
  "fullName": "string",
  "nationalId": "string",
  "phone": "string",
  "parentPhone": "string",
  "governorate": "string",
  "academicGradeId": "string",
  "center?": "string",
  "password": "string"
}
```

**Success response — HTTP 201 (AuthTokenResponseDto)**

```json
{
  "accessToken": "string",
  "user": {
    "id": "string",
    "role": "SUPER_ADMIN | ADMIN | PARTNER | STUDENT",
    "loginIdentifier": "string"
  }
}
```

### `POST /api/v1/auth/students/login`

**Authorization:** Public

**Request**

No path, query, or header input.

```json
{
  "phone": "string",
  "password": "string"
}
```

**Success response — HTTP 201 (AuthTokenResponseDto)**

```json
{
  "accessToken": "string",
  "user": {
    "id": "string",
    "role": "SUPER_ADMIN | ADMIN | PARTNER | STUDENT",
    "loginIdentifier": "string"
  }
}
```

### `POST /api/v1/auth/admins/login`

**Authorization:** Public

**Request**

No path, query, or header input.

```json
{
  "email": "string",
  "password": "string"
}
```

**Success response — HTTP 201 (AuthTokenResponseDto)**

```json
{
  "accessToken": "string",
  "user": {
    "id": "string",
    "role": "SUPER_ADMIN | ADMIN | PARTNER | STUDENT",
    "loginIdentifier": "string"
  }
}
```

### `POST /api/v1/auth/partners/login`

**Authorization:** Public

**Request**

No path, query, or header input.

```json
{
  "email": "string",
  "password": "string"
}
```

**Success response — HTTP 201 (AuthTokenResponseDto)**

```json
{
  "accessToken": "string",
  "user": {
    "id": "string",
    "role": "SUPER_ADMIN | ADMIN | PARTNER | STUDENT",
    "loginIdentifier": "string"
  }
}
```

### `POST /api/v1/auth/parents/login`

**Authorization:** Public

**Request**

No path, query, or header input.

```json
{
  "nationalId": "string",
  "parentPhone": "string"
}
```

**Success response — HTTP 201 (ParentAccessTokenResponseDto)**

```json
{
  "accessToken": "string"
}
```

### `GET /api/v1/auth/parents/children`

**Authorization:** Parent bearer token

**Request**

- query `page` (optional)
- query `limit` (optional)

**Success response — HTTP 200 (PaginatedParentChildResponseDto)**

```json
{
  "data": "[[object Object]]",
  "meta": {
    "page": "number",
    "limit": "number",
    "total": "number",
    "totalPages": "number"
  }
}
```

### `POST /api/v1/auth/parents/select-child`

**Authorization:** Parent bearer token

**Request**

No path, query, or header input.

```json
{
  "studentUserId": "string"
}
```

**Success response — HTTP 201 (ParentAccessTokenResponseDto)**

```json
{
  "accessToken": "string"
}
```

### `GET /api/v1/auth/parents/selected-child`

**Authorization:** Parent selected-child bearer token

**Request**

No path, query, or header input.

**Success response — HTTP 200 (ParentChildDto)**

```json
{
  "userId": "string",
  "fullName": "string",
  "governorate": "string",
  "center": "string | null"
}
```

### `POST /api/v1/auth/refresh`

**Authorization:** Public

**Request**

No path, query, or header input.

**Success response — HTTP 201 (AuthTokenResponseDto)**

```json
{
  "accessToken": "string",
  "user": {
    "id": "string",
    "role": "SUPER_ADMIN | ADMIN | PARTNER | STUDENT",
    "loginIdentifier": "string"
  }
}
```

### `POST /api/v1/auth/logout`

**Authorization:** Bearer token

**Request**

No path, query, or header input.

**Success response — HTTP 201 (SuccessResponseDto)**

```json
{
  "success": "boolean"
}
```

### `POST /api/v1/auth/logout-all`

**Authorization:** Bearer token

**Request**

No path, query, or header input.

**Success response — HTTP 201 (SuccessResponseDto)**

```json
{
  "success": "boolean"
}
```

### `GET /api/v1/auth/me`

**Authorization:** Bearer token

**Request**

No path, query, or header input.

**Success response — HTTP 200 (CurrentUserDto)**

```json
{
  "id": "string",
  "role": "SUPER_ADMIN | ADMIN | PARTNER | STUDENT",
  "loginIdentifier": "string",
  "status": "ACTIVE | SUSPENDED | DISABLED",
  "createdAt": "ISO-8601 date-time",
  "lastLoginAt?": "ISO-8601 date-time"
}
```

### `POST /api/v1/auth/change-password`

**Authorization:** Bearer token

**Request**

No path, query, or header input.

```json
{
  "oldPassword": "string",
  "newPassword": "string"
}
```

**Success response — HTTP 201 (SuccessResponseDto)**

```json
{
  "success": "boolean"
}
```

## Identity

### `POST /api/v1/admin/admins`

**Authorization:** Bearer token; role must be `SUPER_ADMIN`

**Request**

No path, query, or header input.

```json
{
  "email": "string",
  "password": "string"
}
```

**Success response — HTTP 201 (AdminSummaryDto)**

```json
{
  "id": "string",
  "role": "SUPER_ADMIN | ADMIN | PARTNER | STUDENT",
  "loginIdentifier": "string",
  "status": "ACTIVE | SUSPENDED | DISABLED",
  "createdAt": "ISO-8601 date-time",
  "lastLoginAt?": "ISO-8601 date-time"
}
```

### `GET /api/v1/admin/admins`

**Authorization:** Bearer token; role must be `SUPER_ADMIN`

**Request**

- query `page` (optional)
- query `limit` (optional)

**Success response — HTTP 200 (PaginatedAdminResponseDto)**

```json
{
  "data": "[[object Object]]",
  "meta": {
    "page": "number",
    "limit": "number",
    "total": "number",
    "totalPages": "number"
  }
}
```

### `GET /api/v1/admin/admins/{id}`

**Authorization:** Bearer token; role must be `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 200 (AdminSummaryDto)**

```json
{
  "id": "string",
  "role": "SUPER_ADMIN | ADMIN | PARTNER | STUDENT",
  "loginIdentifier": "string",
  "status": "ACTIVE | SUSPENDED | DISABLED",
  "createdAt": "ISO-8601 date-time",
  "lastLoginAt?": "ISO-8601 date-time"
}
```

### `PATCH /api/v1/admin/admins/{id}`

**Authorization:** Bearer token; role must be `SUPER_ADMIN`

**Request**

- path `id` (required)

```json
{
  "email": "string"
}
```

**Success response — HTTP 200 (AdminSummaryDto)**

```json
{
  "id": "string",
  "role": "SUPER_ADMIN | ADMIN | PARTNER | STUDENT",
  "loginIdentifier": "string",
  "status": "ACTIVE | SUSPENDED | DISABLED",
  "createdAt": "ISO-8601 date-time",
  "lastLoginAt?": "ISO-8601 date-time"
}
```

### `POST /api/v1/admin/admins/{id}/suspend`

**Authorization:** Bearer token; role must be `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 201 (AdminSummaryDto)**

```json
{
  "id": "string",
  "role": "SUPER_ADMIN | ADMIN | PARTNER | STUDENT",
  "loginIdentifier": "string",
  "status": "ACTIVE | SUSPENDED | DISABLED",
  "createdAt": "ISO-8601 date-time",
  "lastLoginAt?": "ISO-8601 date-time"
}
```

### `POST /api/v1/admin/admins/{id}/reactivate`

**Authorization:** Bearer token; role must be `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 201 (AdminSummaryDto)**

```json
{
  "id": "string",
  "role": "SUPER_ADMIN | ADMIN | PARTNER | STUDENT",
  "loginIdentifier": "string",
  "status": "ACTIVE | SUSPENDED | DISABLED",
  "createdAt": "ISO-8601 date-time",
  "lastLoginAt?": "ISO-8601 date-time"
}
```

### `POST /api/v1/admin/partners`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

No path, query, or header input.

```json
{
  "email": "string",
  "password": "string",
  "partnerType": "CONTENT_PUBLISHER | REFERRAL_PARTNER",
  "displayName": "string",
  "legalName?": "string",
  "phone?": "string"
}
```

**Success response — HTTP 201 (PartnerSummaryDto)**

```json
{
  "id": "string",
  "status": "ACTIVE | SUSPENDED | DISABLED",
  "loginIdentifier": "string",
  "createdAt": "ISO-8601 date-time",
  "partnerType": "CONTENT_PUBLISHER | REFERRAL_PARTNER",
  "displayName": "string | null",
  "legalName": "string | null",
  "phone": "string | null"
}
```

### `GET /api/v1/admin/partners`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- query `page` (optional)
- query `limit` (optional)

**Success response — HTTP 200 (PaginatedPartnerResponseDto)**

```json
{
  "data": "[[object Object]]",
  "meta": {
    "page": "number",
    "limit": "number",
    "total": "number",
    "totalPages": "number"
  }
}
```

### `GET /api/v1/admin/partners/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 200 (PartnerSummaryDto)**

```json
{
  "id": "string",
  "status": "ACTIVE | SUSPENDED | DISABLED",
  "loginIdentifier": "string",
  "createdAt": "ISO-8601 date-time",
  "partnerType": "CONTENT_PUBLISHER | REFERRAL_PARTNER",
  "displayName": "string | null",
  "legalName": "string | null",
  "phone": "string | null"
}
```

### `PATCH /api/v1/admin/partners/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

```json
{
  "displayName?": "string",
  "legalName?": "string",
  "phone?": "string"
}
```

**Success response — HTTP 200 (PartnerSummaryDto)**

```json
{
  "id": "string",
  "status": "ACTIVE | SUSPENDED | DISABLED",
  "loginIdentifier": "string",
  "createdAt": "ISO-8601 date-time",
  "partnerType": "CONTENT_PUBLISHER | REFERRAL_PARTNER",
  "displayName": "string | null",
  "legalName": "string | null",
  "phone": "string | null"
}
```

### `POST /api/v1/admin/partners/{id}/suspend`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 201 (PartnerSummaryDto)**

```json
{
  "id": "string",
  "status": "ACTIVE | SUSPENDED | DISABLED",
  "loginIdentifier": "string",
  "createdAt": "ISO-8601 date-time",
  "partnerType": "CONTENT_PUBLISHER | REFERRAL_PARTNER",
  "displayName": "string | null",
  "legalName": "string | null",
  "phone": "string | null"
}
```

### `POST /api/v1/admin/partners/{id}/reactivate`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 201 (PartnerSummaryDto)**

```json
{
  "id": "string",
  "status": "ACTIVE | SUSPENDED | DISABLED",
  "loginIdentifier": "string",
  "createdAt": "ISO-8601 date-time",
  "partnerType": "CONTENT_PUBLISHER | REFERRAL_PARTNER",
  "displayName": "string | null",
  "legalName": "string | null",
  "phone": "string | null"
}
```

### `GET /api/v1/partners/me`

**Authorization:** Bearer token; role must be `PARTNER`

**Request**

No path, query, or header input.

**Success response — HTTP 200 (PartnerSummaryDto)**

```json
{
  "id": "string",
  "status": "ACTIVE | SUSPENDED | DISABLED",
  "loginIdentifier": "string",
  "createdAt": "ISO-8601 date-time",
  "partnerType": "CONTENT_PUBLISHER | REFERRAL_PARTNER",
  "displayName": "string | null",
  "legalName": "string | null",
  "phone": "string | null"
}
```

### `GET /api/v1/students/me`

**Authorization:** Bearer token; role must be `STUDENT`

**Request**

No path, query, or header input.

**Success response — HTTP 200 (StudentProfileDto)**

```json
{
  "id": "string",
  "status": "ACTIVE | SUSPENDED | DISABLED",
  "loginIdentifier": "string",
  "createdAt": "ISO-8601 date-time",
  "studentProfile": {
    "fullName?": "string",
    "governorate?": "string",
    "center?": "string",
    "nationalIdLast4?": "string",
    "academicGradeId?": "string"
  }
}
```

### `PATCH /api/v1/students/me`

**Authorization:** Bearer token; role must be `STUDENT`

**Request**

No path, query, or header input.

```json
{
  "fullName?": "string",
  "center?": "string",
  "academicGradeId?": "string"
}
```

**Success response — HTTP 200 (StudentProfileDto)**

```json
{
  "id": "string",
  "status": "ACTIVE | SUSPENDED | DISABLED",
  "loginIdentifier": "string",
  "createdAt": "ISO-8601 date-time",
  "studentProfile": {
    "fullName?": "string",
    "governorate?": "string",
    "center?": "string",
    "nationalIdLast4?": "string",
    "academicGradeId?": "string"
  }
}
```

## Academic hierarchy

### `POST /api/v1/admin/academic-grades`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

No path, query, or header input.

```json
{
  "title": "string",
  "slug?": "string",
  "description?": "string"
}
```

**Success response — HTTP 201 (AcademicGradeSummaryDto)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time",
  "archivedAt?": "ISO-8601 date-time"
}
```

### `GET /api/v1/admin/academic-grades`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- query `page` (optional)
- query `limit` (optional)
- query `status` (optional; DRAFT | PUBLISHED | ARCHIVED)

**Success response — HTTP 200 (PaginatedAcademicGradeResponseDto)**

```json
{
  "data": "[[object Object]]",
  "meta": {
    "page": "number",
    "limit": "number",
    "total": "number",
    "totalPages": "number"
  }
}
```

### `GET /api/v1/admin/academic-grades/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 200 (AcademicGradeSummaryDto)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time",
  "archivedAt?": "ISO-8601 date-time"
}
```

### `PATCH /api/v1/admin/academic-grades/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

```json
{
  "title?": "string",
  "slug?": "string",
  "description?": "string"
}
```

**Success response — HTTP 200 (AcademicGradeSummaryDto)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time",
  "archivedAt?": "ISO-8601 date-time"
}
```

### `DELETE /api/v1/admin/academic-grades/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 200**

No response body.

### `POST /api/v1/admin/academic-grades/reorder`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

No path, query, or header input.

```json
{
  "items": "[[object Object]]"
}
```

**Success response — HTTP 201**

No response body.

### `POST /api/v1/admin/academic-grades/{id}/publish`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 201 (AcademicGradeSummaryDto)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time",
  "archivedAt?": "ISO-8601 date-time"
}
```

### `POST /api/v1/admin/academic-grades/{id}/archive`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 201 (AcademicGradeSummaryDto)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time",
  "archivedAt?": "ISO-8601 date-time"
}
```

### `POST /api/v1/admin/academic-grades/{id}/restore`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 201 (AcademicGradeSummaryDto)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time",
  "archivedAt?": "ISO-8601 date-time"
}
```

### `GET /api/v1/academic-grades`

**Authorization:** Public

**Request**

- query `page` (optional)
- query `limit` (optional)

**Success response — HTTP 200 (PaginatedAcademicGradeResponseDto)**

```json
{
  "data": "[[object Object]]",
  "meta": {
    "page": "number",
    "limit": "number",
    "total": "number",
    "totalPages": "number"
  }
}
```

### `POST /api/v1/admin/subjects`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

No path, query, or header input.

```json
{
  "title": "string",
  "slug?": "string",
  "description?": "string",
  "academicGradeId": "string"
}
```

**Success response — HTTP 201 (SubjectSummaryDto)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time",
  "archivedAt?": "ISO-8601 date-time",
  "academicGradeId": "string"
}
```

### `GET /api/v1/admin/subjects`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- query `page` (optional)
- query `limit` (optional)
- query `academicGradeId` (optional)
- query `status` (optional; DRAFT | PUBLISHED | ARCHIVED)

**Success response — HTTP 200 (PaginatedSubjectResponseDto)**

```json
{
  "data": "[[object Object]]",
  "meta": {
    "page": "number",
    "limit": "number",
    "total": "number",
    "totalPages": "number"
  }
}
```

### `GET /api/v1/admin/subjects/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 200 (SubjectSummaryDto)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time",
  "archivedAt?": "ISO-8601 date-time",
  "academicGradeId": "string"
}
```

### `PATCH /api/v1/admin/subjects/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

```json
{
  "title?": "string",
  "slug?": "string",
  "description?": "string"
}
```

**Success response — HTTP 200 (SubjectSummaryDto)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time",
  "archivedAt?": "ISO-8601 date-time",
  "academicGradeId": "string"
}
```

### `DELETE /api/v1/admin/subjects/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 200**

No response body.

### `POST /api/v1/admin/subjects/reorder`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

No path, query, or header input.

```json
{
  "academicGradeId": "string",
  "items": "[[object Object]]"
}
```

**Success response — HTTP 201**

No response body.

### `POST /api/v1/admin/subjects/{id}/move`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

```json
{
  "newAcademicGradeId": "string",
  "sortOrder?": "number"
}
```

**Success response — HTTP 201 (SubjectSummaryDto)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time",
  "archivedAt?": "ISO-8601 date-time",
  "academicGradeId": "string"
}
```

### `POST /api/v1/admin/subjects/{id}/publish`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 201 (SubjectSummaryDto)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time",
  "archivedAt?": "ISO-8601 date-time",
  "academicGradeId": "string"
}
```

### `POST /api/v1/admin/subjects/{id}/archive`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 201 (SubjectSummaryDto)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time",
  "archivedAt?": "ISO-8601 date-time",
  "academicGradeId": "string"
}
```

### `POST /api/v1/admin/subjects/{id}/restore`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 201 (SubjectSummaryDto)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time",
  "archivedAt?": "ISO-8601 date-time",
  "academicGradeId": "string"
}
```

### `POST /api/v1/admin/courses`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

No path, query, or header input.

```json
{
  "title": "string",
  "slug?": "string",
  "description?": "string",
  "subjectId": "string",
  "accessType": "PUBLIC | FREE | PAID"
}
```

**Success response — HTTP 201 (CourseSummaryDto)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time",
  "archivedAt?": "ISO-8601 date-time",
  "subjectId": "string"
}
```

### `GET /api/v1/admin/courses`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- query `page` (optional)
- query `limit` (optional)
- query `subjectId` (optional)
- query `status` (optional; DRAFT | PUBLISHED | ARCHIVED)

**Success response — HTTP 200 (PaginatedCourseResponseDto)**

```json
{
  "data": "[[object Object]]",
  "meta": {
    "page": "number",
    "limit": "number",
    "total": "number",
    "totalPages": "number"
  }
}
```

### `GET /api/v1/admin/courses/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 200 (CourseSummaryDto)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time",
  "archivedAt?": "ISO-8601 date-time",
  "subjectId": "string"
}
```

### `PATCH /api/v1/admin/courses/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

```json
{
  "title?": "string",
  "slug?": "string",
  "description?": "string"
}
```

**Success response — HTTP 200 (CourseSummaryDto)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time",
  "archivedAt?": "ISO-8601 date-time",
  "subjectId": "string"
}
```

### `DELETE /api/v1/admin/courses/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 200**

No response body.

### `PATCH /api/v1/admin/courses/{id}/access`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

```json
{
  "accessType": "PUBLIC | FREE | PAID | INHERIT"
}
```

**Success response — HTTP 200 (CourseSummary)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time | null",
  "archivedAt?": "ISO-8601 date-time | null",
  "subjectId": "string"
}
```

### `POST /api/v1/admin/courses/reorder`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

No path, query, or header input.

```json
{
  "subjectId": "string",
  "items": "[[object Object]]"
}
```

**Success response — HTTP 201**

No response body.

### `POST /api/v1/admin/courses/{id}/move`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

```json
{
  "newSubjectId": "string",
  "sortOrder?": "number"
}
```

**Success response — HTTP 201 (CourseSummaryDto)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time",
  "archivedAt?": "ISO-8601 date-time",
  "subjectId": "string"
}
```

### `POST /api/v1/admin/courses/{id}/publish`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 201 (CourseSummaryDto)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time",
  "archivedAt?": "ISO-8601 date-time",
  "subjectId": "string"
}
```

### `POST /api/v1/admin/courses/{id}/archive`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 201 (CourseSummaryDto)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time",
  "archivedAt?": "ISO-8601 date-time",
  "subjectId": "string"
}
```

### `POST /api/v1/admin/courses/{id}/restore`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 201 (CourseSummaryDto)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time",
  "archivedAt?": "ISO-8601 date-time",
  "subjectId": "string"
}
```

### `POST /api/v1/admin/chapters`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

No path, query, or header input.

```json
{
  "title": "string",
  "slug?": "string",
  "description?": "string",
  "courseId": "string"
}
```

**Success response — HTTP 201 (ChapterSummaryDto)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time",
  "archivedAt?": "ISO-8601 date-time",
  "courseId": "string"
}
```

### `GET /api/v1/admin/chapters`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- query `page` (optional)
- query `limit` (optional)
- query `courseId` (optional)
- query `status` (optional; DRAFT | PUBLISHED | ARCHIVED)

**Success response — HTTP 200 (PaginatedChapterResponseDto)**

```json
{
  "data": "[[object Object]]",
  "meta": {
    "page": "number",
    "limit": "number",
    "total": "number",
    "totalPages": "number"
  }
}
```

### `GET /api/v1/admin/chapters/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 200 (ChapterSummaryDto)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time",
  "archivedAt?": "ISO-8601 date-time",
  "courseId": "string"
}
```

### `PATCH /api/v1/admin/chapters/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

```json
{
  "title?": "string",
  "slug?": "string",
  "description?": "string"
}
```

**Success response — HTTP 200 (ChapterSummaryDto)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time",
  "archivedAt?": "ISO-8601 date-time",
  "courseId": "string"
}
```

### `DELETE /api/v1/admin/chapters/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 200**

No response body.

### `PATCH /api/v1/admin/chapters/{id}/access`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

```json
{
  "accessType": "PUBLIC | FREE | PAID | INHERIT"
}
```

**Success response — HTTP 200 (ChapterSummary)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time | null",
  "archivedAt?": "ISO-8601 date-time | null",
  "courseId": "string"
}
```

### `POST /api/v1/admin/chapters/reorder`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

No path, query, or header input.

```json
{
  "courseId": "string",
  "items": "[[object Object]]"
}
```

**Success response — HTTP 201**

No response body.

### `POST /api/v1/admin/chapters/{id}/move`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

```json
{
  "newCourseId": "string",
  "sortOrder?": "number"
}
```

**Success response — HTTP 201 (ChapterSummaryDto)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time",
  "archivedAt?": "ISO-8601 date-time",
  "courseId": "string"
}
```

### `POST /api/v1/admin/chapters/{id}/publish`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 201 (ChapterSummaryDto)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time",
  "archivedAt?": "ISO-8601 date-time",
  "courseId": "string"
}
```

### `POST /api/v1/admin/chapters/{id}/archive`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 201 (ChapterSummaryDto)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time",
  "archivedAt?": "ISO-8601 date-time",
  "courseId": "string"
}
```

### `POST /api/v1/admin/chapters/{id}/restore`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 201 (ChapterSummaryDto)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time",
  "archivedAt?": "ISO-8601 date-time",
  "courseId": "string"
}
```

### `POST /api/v1/admin/lessons`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

No path, query, or header input.

```json
{
  "title": "string",
  "slug?": "string",
  "description?": "string",
  "chapterId": "string"
}
```

**Success response — HTTP 201 (LessonSummaryDto)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time",
  "archivedAt?": "ISO-8601 date-time",
  "chapterId": "string"
}
```

### `GET /api/v1/admin/lessons`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- query `page` (optional)
- query `limit` (optional)
- query `chapterId` (optional)
- query `status` (optional; DRAFT | PUBLISHED | ARCHIVED)

**Success response — HTTP 200 (PaginatedLessonResponseDto)**

```json
{
  "data": "[[object Object]]",
  "meta": {
    "page": "number",
    "limit": "number",
    "total": "number",
    "totalPages": "number"
  }
}
```

### `GET /api/v1/admin/lessons/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 200 (LessonSummaryDto)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time",
  "archivedAt?": "ISO-8601 date-time",
  "chapterId": "string"
}
```

### `PATCH /api/v1/admin/lessons/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

```json
{
  "title?": "string",
  "slug?": "string",
  "description?": "string"
}
```

**Success response — HTTP 200 (LessonSummaryDto)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time",
  "archivedAt?": "ISO-8601 date-time",
  "chapterId": "string"
}
```

### `DELETE /api/v1/admin/lessons/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 200**

No response body.

### `PATCH /api/v1/admin/lessons/{id}/access`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

```json
{
  "accessType": "PUBLIC | FREE | PAID | INHERIT"
}
```

**Success response — HTTP 200 (LessonSummary)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time | null",
  "archivedAt?": "ISO-8601 date-time | null",
  "chapterId": "string"
}
```

### `POST /api/v1/admin/lessons/reorder`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

No path, query, or header input.

```json
{
  "chapterId": "string",
  "items": "[[object Object]]"
}
```

**Success response — HTTP 201**

No response body.

### `POST /api/v1/admin/lessons/{id}/move`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

```json
{
  "newChapterId": "string",
  "sortOrder?": "number"
}
```

**Success response — HTTP 201 (LessonSummaryDto)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time",
  "archivedAt?": "ISO-8601 date-time",
  "chapterId": "string"
}
```

### `POST /api/v1/admin/lessons/{id}/publish`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 201 (LessonSummaryDto)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time",
  "archivedAt?": "ISO-8601 date-time",
  "chapterId": "string"
}
```

### `POST /api/v1/admin/lessons/{id}/archive`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 201 (LessonSummaryDto)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time",
  "archivedAt?": "ISO-8601 date-time",
  "chapterId": "string"
}
```

### `POST /api/v1/admin/lessons/{id}/restore`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 201 (LessonSummaryDto)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time",
  "archivedAt?": "ISO-8601 date-time",
  "chapterId": "string"
}
```

### `POST /api/v1/admin/sections`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

No path, query, or header input.

```json
{
  "title": "string",
  "slug?": "string",
  "description?": "string",
  "lessonId": "string"
}
```

**Success response — HTTP 201 (SectionSummaryDto)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time",
  "archivedAt?": "ISO-8601 date-time",
  "lessonId": "string"
}
```

### `GET /api/v1/admin/sections`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- query `page` (optional)
- query `limit` (optional)
- query `lessonId` (optional)
- query `status` (optional; DRAFT | PUBLISHED | ARCHIVED)

**Success response — HTTP 200 (PaginatedSectionResponseDto)**

```json
{
  "data": "[[object Object]]",
  "meta": {
    "page": "number",
    "limit": "number",
    "total": "number",
    "totalPages": "number"
  }
}
```

### `GET /api/v1/admin/sections/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 200 (SectionSummaryDto)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time",
  "archivedAt?": "ISO-8601 date-time",
  "lessonId": "string"
}
```

### `PATCH /api/v1/admin/sections/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

```json
{
  "title?": "string",
  "slug?": "string",
  "description?": "string"
}
```

**Success response — HTTP 200 (SectionSummaryDto)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time",
  "archivedAt?": "ISO-8601 date-time",
  "lessonId": "string"
}
```

### `DELETE /api/v1/admin/sections/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 200**

No response body.

### `PATCH /api/v1/admin/sections/{id}/access`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

```json
{
  "accessType": "PUBLIC | FREE | PAID | INHERIT"
}
```

**Success response — HTTP 200 (SectionSummary)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time | null",
  "archivedAt?": "ISO-8601 date-time | null",
  "lessonId": "string"
}
```

### `POST /api/v1/admin/sections/reorder`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

No path, query, or header input.

```json
{
  "lessonId": "string",
  "items": "[[object Object]]"
}
```

**Success response — HTTP 201**

No response body.

### `POST /api/v1/admin/sections/{id}/move`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

```json
{
  "newLessonId": "string",
  "sortOrder?": "number"
}
```

**Success response — HTTP 201 (SectionSummaryDto)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time",
  "archivedAt?": "ISO-8601 date-time",
  "lessonId": "string"
}
```

### `POST /api/v1/admin/sections/{id}/publish`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 201 (SectionSummaryDto)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time",
  "archivedAt?": "ISO-8601 date-time",
  "lessonId": "string"
}
```

### `POST /api/v1/admin/sections/{id}/archive`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 201 (SectionSummaryDto)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time",
  "archivedAt?": "ISO-8601 date-time",
  "lessonId": "string"
}
```

### `POST /api/v1/admin/sections/{id}/restore`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 201 (SectionSummaryDto)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time",
  "archivedAt?": "ISO-8601 date-time",
  "lessonId": "string"
}
```

## Content, assets, video, and entitlements

### `POST /api/v1/admin/content-items`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

No path, query, or header input.

```json
{
  "type": "TEXT | EXTERNAL_LINK | VIDEO | PDF | IMAGE | DOCUMENT | DOWNLOADABLE_FILE",
  "title": "string",
  "description?": "string",
  "textBody?": "string",
  "externalUrl?": "string",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "estimatedDuration?": "number",
  "placement": {
    "courseId?": "string",
    "chapterId?": "string",
    "lessonId?": "string",
    "sectionId?": "string"
  }
}
```

**Success response — HTTP 201 (ContentItemSummaryDto)**

```json
{
  "id": "string",
  "type": "TEXT | EXTERNAL_LINK | VIDEO | PDF | IMAGE | DOCUMENT | DOWNLOADABLE_FILE",
  "title": "string",
  "description?": "string | null",
  "textBody?": "string | null",
  "externalUrl?": "string | null",
  "accessType": "PUBLIC | FREE | PAID | INHERIT",
  "estimatedDuration?": "number | null",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "primaryAssetId?": "string | null",
  "placement": {
    "id": "string",
    "courseId?": "string | null",
    "chapterId?": "string | null",
    "lessonId?": "string | null",
    "sectionId?": "string | null",
    "sortOrder": "number"
  },
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time",
  "archivedAt?": "ISO-8601 date-time"
}
```

### `GET /api/v1/admin/content-items`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- query `page` (optional)
- query `limit` (optional)
- query `status` (optional; DRAFT | PUBLISHED | ARCHIVED)
- query `type` (optional; TEXT | EXTERNAL_LINK | VIDEO | PDF | IMAGE | DOCUMENT | DOWNLOADABLE_FILE)
- query `accessType` (optional; PUBLIC | FREE | PAID | INHERIT)
- query `courseId` (optional)
- query `chapterId` (optional)
- query `lessonId` (optional)
- query `sectionId` (optional)

**Success response — HTTP 200 (PaginatedContentItemResponseDto)**

```json
{
  "data": "[[object Object]]",
  "meta": {
    "page": "number",
    "limit": "number",
    "total": "number",
    "totalPages": "number"
  }
}
```

### `GET /api/v1/admin/content-items/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 200 (ContentItemSummaryDto)**

```json
{
  "id": "string",
  "type": "TEXT | EXTERNAL_LINK | VIDEO | PDF | IMAGE | DOCUMENT | DOWNLOADABLE_FILE",
  "title": "string",
  "description?": "string | null",
  "textBody?": "string | null",
  "externalUrl?": "string | null",
  "accessType": "PUBLIC | FREE | PAID | INHERIT",
  "estimatedDuration?": "number | null",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "primaryAssetId?": "string | null",
  "placement": {
    "id": "string",
    "courseId?": "string | null",
    "chapterId?": "string | null",
    "lessonId?": "string | null",
    "sectionId?": "string | null",
    "sortOrder": "number"
  },
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time",
  "archivedAt?": "ISO-8601 date-time"
}
```

### `PATCH /api/v1/admin/content-items/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

```json
{
  "type?": "TEXT | EXTERNAL_LINK | VIDEO | PDF | IMAGE | DOCUMENT | DOWNLOADABLE_FILE",
  "title?": "string",
  "description?": "string | null",
  "textBody?": "string | null",
  "externalUrl?": "string | null",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "estimatedDuration?": "number | null"
}
```

**Success response — HTTP 200 (ContentItemSummaryDto)**

```json
{
  "id": "string",
  "type": "TEXT | EXTERNAL_LINK | VIDEO | PDF | IMAGE | DOCUMENT | DOWNLOADABLE_FILE",
  "title": "string",
  "description?": "string | null",
  "textBody?": "string | null",
  "externalUrl?": "string | null",
  "accessType": "PUBLIC | FREE | PAID | INHERIT",
  "estimatedDuration?": "number | null",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "primaryAssetId?": "string | null",
  "placement": {
    "id": "string",
    "courseId?": "string | null",
    "chapterId?": "string | null",
    "lessonId?": "string | null",
    "sectionId?": "string | null",
    "sortOrder": "number"
  },
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time",
  "archivedAt?": "ISO-8601 date-time"
}
```

### `DELETE /api/v1/admin/content-items/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 200**

No response body.

### `PATCH /api/v1/admin/content-items/{id}/access`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

```json
{
  "accessType": "PUBLIC | FREE | PAID | INHERIT"
}
```

**Success response — HTTP 200 (ContentItemSummary)**

```json
{
  "id": "string",
  "type": "TEXT | EXTERNAL_LINK | VIDEO | PDF | IMAGE | DOCUMENT | DOWNLOADABLE_FILE",
  "title": "string",
  "description?": "string | null",
  "textBody?": "string | null",
  "externalUrl?": "string | null",
  "accessType": "PUBLIC | FREE | PAID | INHERIT",
  "estimatedDuration?": "number | null",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "primaryAssetId?": "string | null",
  "placement": {
    "id": "string",
    "courseId?": "string | null",
    "chapterId?": "string | null",
    "lessonId?": "string | null",
    "sectionId?": "string | null",
    "sortOrder": "number"
  },
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time | null",
  "archivedAt?": "ISO-8601 date-time | null"
}
```

### `POST /api/v1/admin/content-items/reorder`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

No path, query, or header input.

```json
{
  "placement": {
    "courseId?": "string",
    "chapterId?": "string",
    "lessonId?": "string",
    "sectionId?": "string"
  },
  "items": "[[object Object]]"
}
```

**Success response — HTTP 201 (ContentItemSummary)**

```json
{
  "id": "string",
  "type": "TEXT | EXTERNAL_LINK | VIDEO | PDF | IMAGE | DOCUMENT | DOWNLOADABLE_FILE",
  "title": "string",
  "description?": "string | null",
  "textBody?": "string | null",
  "externalUrl?": "string | null",
  "accessType": "PUBLIC | FREE | PAID | INHERIT",
  "estimatedDuration?": "number | null",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "primaryAssetId?": "string | null",
  "placement": {
    "id": "string",
    "courseId?": "string | null",
    "chapterId?": "string | null",
    "lessonId?": "string | null",
    "sectionId?": "string | null",
    "sortOrder": "number"
  },
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time | null",
  "archivedAt?": "ISO-8601 date-time | null"
}
```

### `POST /api/v1/admin/content-items/{id}/move`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

```json
{
  "placement": {
    "courseId?": "string",
    "chapterId?": "string",
    "lessonId?": "string",
    "sectionId?": "string"
  },
  "sortOrder?": "number"
}
```

**Success response — HTTP 201 (ContentItemSummaryDto)**

```json
{
  "id": "string",
  "type": "TEXT | EXTERNAL_LINK | VIDEO | PDF | IMAGE | DOCUMENT | DOWNLOADABLE_FILE",
  "title": "string",
  "description?": "string | null",
  "textBody?": "string | null",
  "externalUrl?": "string | null",
  "accessType": "PUBLIC | FREE | PAID | INHERIT",
  "estimatedDuration?": "number | null",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "primaryAssetId?": "string | null",
  "placement": {
    "id": "string",
    "courseId?": "string | null",
    "chapterId?": "string | null",
    "lessonId?": "string | null",
    "sectionId?": "string | null",
    "sortOrder": "number"
  },
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time",
  "archivedAt?": "ISO-8601 date-time"
}
```

### `POST /api/v1/admin/content-items/{id}/publish`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 201 (ContentItemSummary)**

```json
{
  "id": "string",
  "type": "TEXT | EXTERNAL_LINK | VIDEO | PDF | IMAGE | DOCUMENT | DOWNLOADABLE_FILE",
  "title": "string",
  "description?": "string | null",
  "textBody?": "string | null",
  "externalUrl?": "string | null",
  "accessType": "PUBLIC | FREE | PAID | INHERIT",
  "estimatedDuration?": "number | null",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "primaryAssetId?": "string | null",
  "placement": {
    "id": "string",
    "courseId?": "string | null",
    "chapterId?": "string | null",
    "lessonId?": "string | null",
    "sectionId?": "string | null",
    "sortOrder": "number"
  },
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time | null",
  "archivedAt?": "ISO-8601 date-time | null"
}
```

### `POST /api/v1/admin/content-items/{id}/archive`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 201 (ContentItemSummary)**

```json
{
  "id": "string",
  "type": "TEXT | EXTERNAL_LINK | VIDEO | PDF | IMAGE | DOCUMENT | DOWNLOADABLE_FILE",
  "title": "string",
  "description?": "string | null",
  "textBody?": "string | null",
  "externalUrl?": "string | null",
  "accessType": "PUBLIC | FREE | PAID | INHERIT",
  "estimatedDuration?": "number | null",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "primaryAssetId?": "string | null",
  "placement": {
    "id": "string",
    "courseId?": "string | null",
    "chapterId?": "string | null",
    "lessonId?": "string | null",
    "sectionId?": "string | null",
    "sortOrder": "number"
  },
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time | null",
  "archivedAt?": "ISO-8601 date-time | null"
}
```

### `POST /api/v1/admin/content-items/{id}/restore`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 201 (ContentItemSummary)**

```json
{
  "id": "string",
  "type": "TEXT | EXTERNAL_LINK | VIDEO | PDF | IMAGE | DOCUMENT | DOWNLOADABLE_FILE",
  "title": "string",
  "description?": "string | null",
  "textBody?": "string | null",
  "externalUrl?": "string | null",
  "accessType": "PUBLIC | FREE | PAID | INHERIT",
  "estimatedDuration?": "number | null",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "primaryAssetId?": "string | null",
  "placement": {
    "id": "string",
    "courseId?": "string | null",
    "chapterId?": "string | null",
    "lessonId?": "string | null",
    "sectionId?": "string | null",
    "sortOrder": "number"
  },
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time | null",
  "archivedAt?": "ISO-8601 date-time | null"
}
```

### `POST /api/v1/admin/content-items/{id}/primary-asset`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

```json
{
  "assetId": "string"
}
```

**Success response — HTTP 201 (ContentItemSummary)**

```json
{
  "id": "string",
  "type": "TEXT | EXTERNAL_LINK | VIDEO | PDF | IMAGE | DOCUMENT | DOWNLOADABLE_FILE",
  "title": "string",
  "description?": "string | null",
  "textBody?": "string | null",
  "externalUrl?": "string | null",
  "accessType": "PUBLIC | FREE | PAID | INHERIT",
  "estimatedDuration?": "number | null",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "primaryAssetId?": "string | null",
  "placement": {
    "id": "string",
    "courseId?": "string | null",
    "chapterId?": "string | null",
    "lessonId?": "string | null",
    "sectionId?": "string | null",
    "sortOrder": "number"
  },
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time | null",
  "archivedAt?": "ISO-8601 date-time | null"
}
```

### `POST /api/v1/admin/content-items/{id}/attachments`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

```json
{
  "assetId": "string"
}
```

**Success response — HTTP 201 (ContentItemSummary)**

```json
{
  "id": "string",
  "type": "TEXT | EXTERNAL_LINK | VIDEO | PDF | IMAGE | DOCUMENT | DOWNLOADABLE_FILE",
  "title": "string",
  "description?": "string | null",
  "textBody?": "string | null",
  "externalUrl?": "string | null",
  "accessType": "PUBLIC | FREE | PAID | INHERIT",
  "estimatedDuration?": "number | null",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "primaryAssetId?": "string | null",
  "placement": {
    "id": "string",
    "courseId?": "string | null",
    "chapterId?": "string | null",
    "lessonId?": "string | null",
    "sectionId?": "string | null",
    "sortOrder": "number"
  },
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time | null",
  "archivedAt?": "ISO-8601 date-time | null"
}
```

### `POST /api/v1/admin/content-items/{id}/attachments/reorder`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

```json
{
  "assetIds": [
    "string"
  ]
}
```

**Success response — HTTP 201**

No response body.

### `DELETE /api/v1/admin/content-items/{id}/attachments/{assetId}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)
- path `assetId` (required)

**Success response — HTTP 200**

No response body.

### `POST /api/v1/admin/assets/upload`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- query `kind` (required; COVER_IMAGE | IMAGE | PDF | DOCUMENT | DOWNLOADABLE_FILE)
- multipart field `file` (required; one file)

**Success response — HTTP 201 (AssetSummary)**

```json
{
  "id": "string",
  "provider": "BUNNY_STORAGE | BUNNY_STREAM",
  "kind": "AssetKind",
  "status": "PENDING_UPLOAD | UPLOADING | READY | FAILED | ARCHIVED",
  "filename": "string",
  "mimeType?": "string | null",
  "sizeBytes?": "number | null",
  "checksum?": "string | null",
  "createdAt": "ISO-8601 date-time",
  "readyAt?": "ISO-8601 date-time | null",
  "failedAt?": "ISO-8601 date-time | null",
  "archivedAt?": "ISO-8601 date-time | null"
}
```

### `GET /api/v1/admin/assets`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

No path, query, or header input.

**Success response — HTTP 200**

```json
{
  "data": [
    {
      "id": "string",
      "provider": "BUNNY_STORAGE | BUNNY_STREAM",
      "kind": "AssetKind",
      "status": "PENDING_UPLOAD | UPLOADING | READY | FAILED | ARCHIVED",
      "filename": "string",
      "mimeType?": "string | null",
      "sizeBytes?": "number | null",
      "checksum?": "string | null",
      "createdAt": "ISO-8601 date-time",
      "readyAt?": "ISO-8601 date-time | null",
      "failedAt?": "ISO-8601 date-time | null",
      "archivedAt?": "ISO-8601 date-time | null"
    }
  ]
}
```

### `GET /api/v1/admin/assets/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 200 (AssetSummary)**

```json
{
  "id": "string",
  "provider": "BUNNY_STORAGE | BUNNY_STREAM",
  "kind": "AssetKind",
  "status": "PENDING_UPLOAD | UPLOADING | READY | FAILED | ARCHIVED",
  "filename": "string",
  "mimeType?": "string | null",
  "sizeBytes?": "number | null",
  "checksum?": "string | null",
  "createdAt": "ISO-8601 date-time",
  "readyAt?": "ISO-8601 date-time | null",
  "failedAt?": "ISO-8601 date-time | null",
  "archivedAt?": "ISO-8601 date-time | null"
}
```

### `DELETE /api/v1/admin/assets/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 200**

```json
{
  "id": "string",
  "deleted": true
}
```

### `POST /api/v1/admin/assets/{id}/archive`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 201 (AssetSummary)**

```json
{
  "id": "string",
  "provider": "BUNNY_STORAGE | BUNNY_STREAM",
  "kind": "AssetKind",
  "status": "PENDING_UPLOAD | UPLOADING | READY | FAILED | ARCHIVED",
  "filename": "string",
  "mimeType?": "string | null",
  "sizeBytes?": "number | null",
  "checksum?": "string | null",
  "createdAt": "ISO-8601 date-time",
  "readyAt?": "ISO-8601 date-time | null",
  "failedAt?": "ISO-8601 date-time | null",
  "archivedAt?": "ISO-8601 date-time | null"
}
```

### `POST /api/v1/admin/assets/covers/{resource}/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `resource` (required; grades | subjects | courses | chapters | lessons | sections)
- path `id` (required)

```json
{
  "assetId": "string"
}
```

**Success response — HTTP 201 (AssetSummary)**

```json
{
  "id": "string",
  "provider": "BUNNY_STORAGE | BUNNY_STREAM",
  "kind": "AssetKind",
  "status": "PENDING_UPLOAD | UPLOADING | READY | FAILED | ARCHIVED",
  "filename": "string",
  "mimeType?": "string | null",
  "sizeBytes?": "number | null",
  "checksum?": "string | null",
  "createdAt": "ISO-8601 date-time",
  "readyAt?": "ISO-8601 date-time | null",
  "failedAt?": "ISO-8601 date-time | null",
  "archivedAt?": "ISO-8601 date-time | null"
}
```

### `DELETE /api/v1/admin/assets/covers/{resource}/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `resource` (required; grades | subjects | courses | chapters | lessons | sections)
- path `id` (required)

**Success response — HTTP 200**

```json
{
  "id": "string",
  "coverAssetId": null
}
```

### `POST /api/v1/admin/entitlements`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

No path, query, or header input.

```json
{
  "studentUserId": "string",
  "courseId?": "string",
  "chapterId?": "string",
  "source?": "ADMIN | PROMOTION | MIGRATION | PAYMENT",
  "startsAt?": "ISO-8601 date-time",
  "expiresAt?": "ISO-8601 date-time"
}
```

**Success response — HTTP 201**

```json
[
  "StudentEntitlement record[]"
]
```

### `GET /api/v1/admin/entitlements`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- query `studentUserId` (required)

**Success response — HTTP 200**

```json
[
  "StudentEntitlement record[]"
]
```

### `POST /api/v1/admin/entitlements/{id}/revoke`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 201**

```json
{
  "id": "string",
  "studentUserId": "string",
  "courseId?": "string | null",
  "chapterId?": "string | null",
  "source": "ADMIN | PROMOTION | MIGRATION | PAYMENT",
  "status": "ACTIVE | REVOKED",
  "startsAt": "ISO-8601 date-time",
  "expiresAt?": "ISO-8601 date-time | null",
  "revokedAt?": "ISO-8601 date-time | null",
  "createdAt": "ISO-8601 date-time"
}
```

### `GET /api/v1/student/content-items/{id}`

**Authorization:** Bearer token; role must be `STUDENT`

**Request**

- path `id` (required)

**Success response — HTTP 200 (DeliveryItem)**

```json
{
  "id": "string",
  "type": "ContentItemType",
  "title": "string",
  "description?": "string | null",
  "textBody?": "string | null",
  "externalUrl?": "string | null",
  "estimatedDuration?": "number | null",
  "placement": {
    "courseId?": "string | null",
    "chapterId?": "string | null",
    "lessonId?": "string | null",
    "sectionId?": "string | null",
    "sortOrder": "number"
  },
  "primaryAsset?": {
    "id": "string",
    "kind": "AssetKind",
    "filename": "string",
    "mimeType": "string",
    "sizeBytes": "number"
  },
  "attachments": [
    "AssetSummary plus sortOrder"
  ]
}
```

### `GET /api/v1/catalog/content-items/{id}`

**Authorization:** Public

**Request**

- path `id` (required)

**Success response — HTTP 200 (DeliveryItem)**

```json
{
  "id": "string",
  "type": "ContentItemType",
  "title": "string",
  "description?": "string | null",
  "textBody?": "string | null",
  "externalUrl?": "string | null",
  "estimatedDuration?": "number | null",
  "placement": {
    "courseId?": "string | null",
    "chapterId?": "string | null",
    "lessonId?": "string | null",
    "sectionId?": "string | null",
    "sortOrder": "number"
  },
  "primaryAsset?": {
    "id": "string",
    "kind": "AssetKind",
    "filename": "string",
    "mimeType": "string",
    "sizeBytes": "number"
  },
  "attachments": [
    "AssetSummary plus sortOrder"
  ]
}
```

### `GET /api/v1/catalog/content-items/{contentItemId}/assets/{assetId}/access`

**Authorization:** Public

**Request**

- path `contentItemId` (required)
- path `assetId` (required)

**Success response — HTTP 200**

```json
{
  "url": "string",
  "expiresAt": "ISO-8601 date-time"
}
```

### `GET /api/v1/student/content-items/{contentItemId}/assets/{assetId}/access`

**Authorization:** Bearer token; role must be `STUDENT`

**Request**

- path `contentItemId` (required)
- path `assetId` (required)

**Success response — HTTP 200**

```json
{
  "url": "string",
  "expiresAt": "ISO-8601 date-time"
}
```

### `POST /api/v1/admin/video-assets`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

No path, query, or header input.

```json
{
  "title": "string",
  "filename?": "string"
}
```

**Success response — HTTP 201**

```json
{
  "id": "string",
  "provider": "BUNNY_STREAM",
  "kind": "VIDEO",
  "status": "AssetStatus",
  "filename": "string",
  "createdAt": "ISO-8601 date-time",
  "readyAt?": "ISO-8601 date-time | null",
  "failedAt?": "ISO-8601 date-time | null",
  "video": {
    "processingStatus": "CREATED | UPLOADING | PROCESSING | READY | FAILED",
    "processingProgress": "number",
    "durationSeconds?": "number | null",
    "thumbnailUrl?": "string | null",
    "attempt": "number"
  }
}
```

### `GET /api/v1/admin/video-assets/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 200**

```json
{
  "id": "string",
  "provider": "BUNNY_STREAM",
  "kind": "VIDEO",
  "status": "AssetStatus",
  "filename": "string",
  "createdAt": "ISO-8601 date-time",
  "readyAt?": "ISO-8601 date-time | null",
  "failedAt?": "ISO-8601 date-time | null",
  "video": {
    "processingStatus": "CREATED | UPLOADING | PROCESSING | READY | FAILED",
    "processingProgress": "number",
    "durationSeconds?": "number | null",
    "thumbnailUrl?": "string | null",
    "attempt": "number"
  }
}
```

### `DELETE /api/v1/admin/video-assets/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 200**

```json
{
  "id": "string",
  "deleted": true
}
```

### `POST /api/v1/admin/video-assets/{id}/upload-authorization`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 201**

```json
{
  "endpoint": "string",
  "videoId": "string",
  "libraryId": "string",
  "expires": "unix timestamp",
  "signature": "string"
}
```

### `POST /api/v1/admin/video-assets/{id}/retry`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 201**

```json
{
  "id": "string",
  "provider": "BUNNY_STREAM",
  "kind": "VIDEO",
  "status": "AssetStatus",
  "filename": "string",
  "createdAt": "ISO-8601 date-time",
  "readyAt?": "ISO-8601 date-time | null",
  "failedAt?": "ISO-8601 date-time | null",
  "video": {
    "processingStatus": "CREATED | UPLOADING | PROCESSING | READY | FAILED",
    "processingProgress": "number",
    "durationSeconds?": "number | null",
    "thumbnailUrl?": "string | null",
    "attempt": "number"
  }
}
```

### `POST /api/v1/admin/video-assets/{id}/archive`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 201**

```json
{
  "id": "string",
  "provider": "BUNNY_STREAM",
  "kind": "VIDEO",
  "status": "AssetStatus",
  "filename": "string",
  "createdAt": "ISO-8601 date-time",
  "readyAt?": "ISO-8601 date-time | null",
  "failedAt?": "ISO-8601 date-time | null",
  "video": {
    "processingStatus": "CREATED | UPLOADING | PROCESSING | READY | FAILED",
    "processingProgress": "number",
    "durationSeconds?": "number | null",
    "thumbnailUrl?": "string | null",
    "attempt": "number"
  }
}
```

### `POST /api/v1/integrations/bunny-stream/webhook`

**Authorization:** Signed Bunny webhook (not bearer authentication)

**Request**

- headers `x-bunnystream-signature`, `x-bunnystream-signature-version` (= v1), and `x-bunnystream-signature-algorithm` (= hmac-sha256), all required

```json
{
  "VideoGuid": "string",
  "Status": "number",
  "EncodeProgress?": "number",
  "Length?": "number",
  "ThumbnailFileName?": "string"
}
```

**Success response — HTTP 201**

```json
{
  "received": true,
  "duplicate?": true
}
```

## Catalog

### `GET /api/v1/catalog/subjects`

**Authorization:** Public

**Request**

- query `page` (optional)
- query `limit` (optional)
- query `academicGradeId` (optional)

**Success response — HTTP 200 (SubjectSummary)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time | null",
  "archivedAt?": "ISO-8601 date-time | null",
  "academicGradeId": "string"
}
```

### `GET /api/v1/catalog/courses`

**Authorization:** Public

**Request**

- query `page` (optional)
- query `limit` (optional)
- query `subjectId` (optional)

**Success response — HTTP 200 (CourseSummary)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time | null",
  "archivedAt?": "ISO-8601 date-time | null",
  "subjectId": "string"
}
```

### `GET /api/v1/catalog/courses/{id}`

**Authorization:** Public

**Request**

- path `id` (required)

**Success response — HTTP 200 (CourseSummary)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time | null",
  "archivedAt?": "ISO-8601 date-time | null",
  "subjectId": "string"
}
```

### `GET /api/v1/catalog/courses/{id}/outline`

**Authorization:** Public

**Request**

- path `id` (required)

**Success response — HTTP 200 (CourseSummary)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time | null",
  "archivedAt?": "ISO-8601 date-time | null",
  "subjectId": "string"
}
```

### `GET /api/v1/student/catalog`

**Authorization:** Bearer token; role must be `STUDENT`

**Request**

No path, query, or header input.

**Success response — HTTP 200**

```json
{
  "academicGrade": {
    "id": "string",
    "title": { "ar": "string", "en": "string | null" },
    "slug": "string",
    "description": { "ar": "string | null", "en": "string | null" },
    "sortOrder": "number"
  },
  "summary": { "subjects": "number", "courses": "number", "chapters": "number" }
}
```

### `GET /api/v1/student/catalog/subjects`

**Authorization:** Bearer token; role must be `STUDENT`

**Request**

- query `page` (optional; one-based, default `1`)
- query `limit` (optional; `1..100`, default `20`)

**Success response — HTTP 200**

```json
{
  "data": [{ "id": "string", "title": "string", "slug": "string", "description": "string | null", "sortOrder": "number" }],
  "meta": { "page": "number", "limit": "number", "total": "number", "totalPages": "number" }
}
```

### `GET /api/v1/student/catalog/subjects/{subjectId}/courses`

**Authorization:** Bearer token; role must be `STUDENT`

**Request**

- path `subjectId` (required)
- query `page` (optional; one-based, default `1`)
- query `limit` (optional; `1..100`, default `20`)

**Success response — HTTP 200**

```json
{
  "data": [{
    "id": "string",
    "title": "string",
    "slug": "string",
    "description": "string | null",
    "sortOrder": "number",
    "access": {
      "state": "ENTITLED | FREE | PUBLIC | PURCHASABLE | LOCKED",
      "entitlementId?": "string",
      "expiresAt?": "ISO-8601 date-time | null",
      "price?": { "amountMinor": "number", "currency": "EGP" }
    },
    "isLocked": "boolean"
  }],
  "meta": { "page": "number", "limit": "number", "total": "number", "totalPages": "number" }
}
```

### `GET /api/v1/student/catalog/courses/{courseId}`

**Authorization:** Bearer token; role must be `STUDENT`

**Request**

- path `courseId` (required)

**Success response — HTTP 200**

Returns the grade-scoped course, its subject, and published chapters. The course
and every chapter use the `access` and `isLocked` fields shown in the preceding
course-list response.

### `GET /api/v1/student/catalog/chapters/{chapterId}`

**Authorization:** Bearer token; role must be `STUDENT`

**Request**

- path `chapterId` (required)

**Success response — HTTP 200**

Returns the grade-scoped chapter, course, published lessons/sections, and
content preview metadata. Every hierarchy node and content item includes its
effective `access` object and `isLocked` flag. Content previews include `id`,
`type`, `title`, `description`, `estimatedDuration`, and `sortOrder`; they do
not expose protected item bodies or asset URLs.

### `GET /api/v1/student/library`

**Authorization:** Bearer token; role must be `STUDENT`

**Request**

No path, query, or header input.

**Success response — HTTP 200**

```json
{
  "data": [{
    "entitlementId": "string",
    "targetType": "COURSE | CHAPTER",
    "target": { "id": "string", "title": "string", "slug": "string", "description": "string | null", "sortOrder": "number" },
    "course": { "id": "string", "title": "string", "slug": "string", "description": "string | null", "sortOrder": "number" },
    "subject": { "id": "string", "title": "string", "slug": "string", "description": "string | null", "sortOrder": "number" },
    "academicGrade": { "id": "string", "title": { "ar": "string", "en": "string | null" }, "slug": "string", "description": { "ar": "string | null", "en": "string | null" }, "sortOrder": "number" },
    "startsAt": "ISO-8601 date-time",
    "expiresAt": "ISO-8601 date-time | null"
  }]
}
```

### `GET /api/v1/student/entitlements`

**Authorization:** Bearer token; role must be `STUDENT`

**Request**

- query `page` (optional; one-based, default `1`)
- query `limit` (optional; `1..100`, default `20`)

**Success response — HTTP 200**

```json
{
  "data": [{
    "id": "string",
    "courseId": "string | null",
    "chapterId": "string | null",
    "targetType": "COURSE | CHAPTER",
    "targetId": "string",
    "source": "ADMIN | PROMOTION | MIGRATION | PAYMENT",
    "status": "ACTIVE",
    "startsAt": "ISO-8601 date-time",
    "expiresAt": "ISO-8601 date-time | null",
    "createdAt": "ISO-8601 date-time"
  }],
  "meta": { "page": "number", "limit": "number", "total": "number", "totalPages": "number" }
}
```

## Publisher agreements and pricing

### `POST /api/v1/admin/publisher-agreements`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

No path, query, or header input.

```json
{
  "publisherUserId": "string",
  "revenueShareBps": "integer 0..10000",
  "startsAt": "ISO-8601 date-time",
  "endsAt?": "ISO-8601 date-time",
  "isPrimary?": "boolean",
  "courseId?": "string (exactly one target ID)",
  "chapterId?": "string (exactly one target ID)",
  "lessonId?": "string (exactly one target ID)"
}
```

**Success response — HTTP 201**

```json
{
  "id": "string",
  "publisherUserId": "string",
  "courseId?": "string | null",
  "chapterId?": "string | null",
  "lessonId?": "string | null",
  "revenueShareBps": "number",
  "startsAt": "ISO date-time",
  "endsAt?": "ISO date-time | null",
  "isPrimary": "boolean",
  "status": "DRAFT | ACTIVE | ENDED",
  "createdAt": "ISO date-time"
}
```

### `GET /api/v1/admin/publisher-agreements`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- query `history` (required)

**Success response — HTTP 200**

```json
[
  "PublisherAgreement records with publisher"
]
```

### `PATCH /api/v1/admin/publisher-agreements/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

```json
{
  "publisherUserId?": "string",
  "revenueShareBps?": "integer 0..10000",
  "startsAt?": "ISO-8601 date-time",
  "endsAt?": "ISO-8601 date-time",
  "isPrimary?": "boolean"
}
```

**Success response — HTTP 200**

```json
{
  "id": "string",
  "publisherUserId": "string",
  "courseId?": "string | null",
  "chapterId?": "string | null",
  "lessonId?": "string | null",
  "revenueShareBps": "number",
  "startsAt": "ISO date-time",
  "endsAt?": "ISO date-time | null",
  "isPrimary": "boolean",
  "status": "DRAFT | ACTIVE | ENDED",
  "createdAt": "ISO date-time"
}
```

### `POST /api/v1/admin/publisher-agreements/{id}/activate`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 201**

```json
{
  "id": "string",
  "publisherUserId": "string",
  "courseId?": "string | null",
  "chapterId?": "string | null",
  "lessonId?": "string | null",
  "revenueShareBps": "number",
  "startsAt": "ISO date-time",
  "endsAt?": "ISO date-time | null",
  "isPrimary": "boolean",
  "status": "DRAFT | ACTIVE | ENDED",
  "createdAt": "ISO date-time"
}
```

### `POST /api/v1/admin/publisher-agreements/{id}/end`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

```json
{
  "endsAt?": "ISO-8601 date-time (defaults to now)"
}
```

**Success response — HTTP 201**

```json
{
  "id": "string",
  "publisherUserId": "string",
  "courseId?": "string | null",
  "chapterId?": "string | null",
  "lessonId?": "string | null",
  "revenueShareBps": "number",
  "startsAt": "ISO date-time",
  "endsAt?": "ISO date-time | null",
  "isPrimary": "boolean",
  "status": "DRAFT | ACTIVE | ENDED",
  "createdAt": "ISO date-time"
}
```

### `GET /api/v1/admin/publisher-agreements/effective`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- query `at` (required)

**Success response — HTTP 200**

```json
{
  "agreement": "PublisherAgreement | null",
  "resolvedFrom": "{courseId? | chapterId? | lessonId?} | null"
}
```

### `POST /api/v1/admin/publisher-agreements/earnings-statements`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

No path, query, or header input.

```json
{
  "periodStartsAt": "ISO-8601 date-time",
  "periodEndsAt": "ISO-8601 date-time",
  "grossRevenueMinor": "integer >= 0",
  "currency": "string (must be EGP)",
  "courseId?": "string (exactly one target ID)",
  "chapterId?": "string (exactly one target ID)",
  "lessonId?": "string (exactly one target ID)"
}
```

**Success response — HTTP 201**

```json
{
  "id": "string",
  "agreementId": "string",
  "periodStartsAt": "ISO date-time",
  "periodEndsAt": "ISO date-time",
  "grossRevenueMinor": "number",
  "publisherEarningsMinor": "number",
  "currency": "EGP",
  "revenueShareBps": "number",
  "createdAt": "ISO date-time"
}
```

### `GET /api/v1/admin/publisher-agreements/earnings-statements`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

No path, query, or header input.

**Success response — HTTP 200**

```json
[
  "PublisherEarningsStatement records with agreement.publisher"
]
```

### `POST /api/v1/admin/pricing/course/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

```json
{
  "isPurchasable": "boolean",
  "priceMinor?": "integer >= 0; required when isPurchasable is true",
  "currency?": "string EGP; required when isPurchasable is true"
}
```

**Success response — HTTP 201**

```json
{
  "priceMinor?": "number | null",
  "currency?": "string | null",
  "isPurchasable?": "boolean | null",
  "resolvedFrom": "{courseId? | chapterId? | lessonId?}"
}
```

### `POST /api/v1/admin/pricing/chapter/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

```json
{
  "isPurchasable": "boolean",
  "priceMinor?": "integer >= 0; required when isPurchasable is true",
  "currency?": "string EGP; required when isPurchasable is true"
}
```

**Success response — HTTP 201**

```json
{
  "priceMinor?": "number | null",
  "currency?": "string | null",
  "isPurchasable?": "boolean | null",
  "resolvedFrom": "{courseId? | chapterId? | lessonId?}"
}
```

### `POST /api/v1/admin/pricing/lesson/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

```json
{
  "isPurchasable": "boolean",
  "priceMinor?": "integer >= 0; required when isPurchasable is true",
  "currency?": "string EGP; required when isPurchasable is true"
}
```

**Success response — HTTP 201**

```json
{
  "priceMinor?": "number | null",
  "currency?": "string | null",
  "isPurchasable?": "boolean | null",
  "resolvedFrom": "{courseId? | chapterId? | lessonId?}"
}
```

### `GET /api/v1/admin/pricing/effective`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

No path, query, or header input.

**Success response — HTTP 200**

```json
{
  "priceMinor?": "number | null",
  "currency?": "string | null",
  "isPurchasable?": "boolean | null",
  "resolvedFrom": "{courseId? | chapterId? | lessonId?}"
}
```

## Question banks and questions

### `POST /api/v1/admin/question-banks/sources`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

No path, query, or header input.

```json
{
  "type": "PLATFORM | CONTENT_PUBLISHER | EXTERNAL_BOOK | PREVIOUS_EXAM | MINISTRY_MODEL",
  "title": "string",
  "note?": "string",
  "publisherUserId?": "string"
}
```

**Success response — HTTP 201**

```json
{
  "id": "string",
  "type": "QuestionSourceType",
  "title": "string",
  "note?": "string | null",
  "publisherUserId?": "string | null",
  "status": "ContentStatus",
  "createdAt": "ISO date-time",
  "updatedAt": "ISO date-time"
}
```

### `GET /api/v1/admin/question-banks/sources`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- query `page` (optional)
- query `limit` (optional)
- query `status` (optional; DRAFT | PUBLISHED | ARCHIVED)
- query `type` (optional; PLATFORM | CONTENT_PUBLISHER | EXTERNAL_BOOK | PREVIOUS_EXAM | MINISTRY_MODEL)

**Success response — HTTP 200**

```json
{
  "data": [
    "QuestionSource records"
  ],
  "meta": {
    "page": "number",
    "limit": "number",
    "total": "number",
    "totalPages": "number"
  }
}
```

### `GET /api/v1/admin/question-banks/sources/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 200**

```json
{
  "id": "string",
  "type": "QuestionSourceType",
  "title": "string",
  "note?": "string | null",
  "publisherUserId?": "string | null",
  "status": "ContentStatus",
  "createdAt": "ISO date-time",
  "updatedAt": "ISO date-time"
}
```

### `PATCH /api/v1/admin/question-banks/sources/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

```json
{
  "type?": "PLATFORM | CONTENT_PUBLISHER | EXTERNAL_BOOK | PREVIOUS_EXAM | MINISTRY_MODEL",
  "title?": "string",
  "note?": "string | null",
  "publisherUserId?": "string | null"
}
```

**Success response — HTTP 200**

```json
{
  "id": "string",
  "type": "QuestionSourceType",
  "title": "string",
  "note?": "string | null",
  "publisherUserId?": "string | null",
  "status": "ContentStatus",
  "createdAt": "ISO date-time",
  "updatedAt": "ISO date-time"
}
```

### `DELETE /api/v1/admin/question-banks/sources/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 200**

```json
{
  "id": "string",
  "deleted": true
}
```

### `POST /api/v1/admin/question-banks/sources/{id}/publish`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 201**

```json
{
  "id": "string",
  "type": "QuestionSourceType",
  "title": "string",
  "note?": "string | null",
  "publisherUserId?": "string | null",
  "status": "ContentStatus",
  "createdAt": "ISO date-time",
  "updatedAt": "ISO date-time"
}
```

### `POST /api/v1/admin/question-banks/sources/{id}/archive`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 201**

```json
{
  "id": "string",
  "type": "QuestionSourceType",
  "title": "string",
  "note?": "string | null",
  "publisherUserId?": "string | null",
  "status": "ContentStatus",
  "createdAt": "ISO date-time",
  "updatedAt": "ISO date-time"
}
```

### `POST /api/v1/admin/question-banks/sources/{id}/restore`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 201**

```json
{
  "id": "string",
  "type": "QuestionSourceType",
  "title": "string",
  "note?": "string | null",
  "publisherUserId?": "string | null",
  "status": "ContentStatus",
  "createdAt": "ISO date-time",
  "updatedAt": "ISO date-time"
}
```

### `POST /api/v1/admin/question-banks`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

No path, query, or header input.

```json
{
  "title": "string",
  "description?": "string"
}
```

**Success response — HTTP 201**

```json
{
  "id": "string",
  "title": "string",
  "description?": "string | null",
  "status": "ContentStatus",
  "createdAt": "ISO date-time",
  "updatedAt": "ISO date-time"
}
```

### `GET /api/v1/admin/question-banks`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- query `page` (optional)
- query `limit` (optional)
- query `status` (optional; DRAFT | PUBLISHED | ARCHIVED)

**Success response — HTTP 200**

```json
{
  "data": [
    "QuestionBank records"
  ],
  "meta": {
    "page": "number",
    "limit": "number",
    "total": "number",
    "totalPages": "number"
  }
}
```

### `GET /api/v1/admin/question-banks/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 200**

```json
{
  "id": "string",
  "title": "string",
  "description?": "string | null",
  "status": "ContentStatus",
  "createdAt": "ISO date-time",
  "updatedAt": "ISO date-time"
}
```

### `PATCH /api/v1/admin/question-banks/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

```json
{
  "title?": "string",
  "description?": "string | null"
}
```

**Success response — HTTP 200**

```json
{
  "id": "string",
  "title": "string",
  "description?": "string | null",
  "status": "ContentStatus",
  "createdAt": "ISO date-time",
  "updatedAt": "ISO date-time"
}
```

### `DELETE /api/v1/admin/question-banks/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 200**

```json
{
  "id": "string",
  "deleted": true
}
```

### `POST /api/v1/admin/question-banks/{id}/publish`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 201**

```json
{
  "id": "string",
  "title": "string",
  "description?": "string | null",
  "status": "ContentStatus",
  "createdAt": "ISO date-time",
  "updatedAt": "ISO date-time"
}
```

### `POST /api/v1/admin/question-banks/{id}/archive`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 201**

```json
{
  "id": "string",
  "title": "string",
  "description?": "string | null",
  "status": "ContentStatus",
  "createdAt": "ISO date-time",
  "updatedAt": "ISO date-time"
}
```

### `POST /api/v1/admin/question-banks/{id}/restore`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 201**

```json
{
  "id": "string",
  "title": "string",
  "description?": "string | null",
  "status": "ContentStatus",
  "createdAt": "ISO date-time",
  "updatedAt": "ISO date-time"
}
```

### `POST /api/v1/admin/questions`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

No path, query, or header input.

```json
{
  "bankId": "string",
  "sourceId": "string",
  "courseId": "string",
  "type?": "SINGLE_CHOICE | MULTIPLE_CHOICE",
  "placements": "[[object Object]]",
  "body": "string",
  "explanation?": "string"
}
```

**Success response — HTTP 201**

```json
{
  "id": "string",
  "bankId": "string",
  "sourceId": "string",
  "courseId": "string",
  "type": "SINGLE_CHOICE | MULTIPLE_CHOICE",
  "body": "string",
  "explanation?": "string | null",
  "status": "DRAFT | IN_REVIEW | PUBLISHED | REJECTED | ARCHIVED",
  "placements": [
    "QuestionPlacement"
  ],
  "options": [
    "QuestionOption"
  ],
  "assets": [
    "QuestionAsset"
  ],
  "videoLink": "QuestionVideoLink | null"
}
```

### `GET /api/v1/admin/questions`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- query `page` (optional)
- query `limit` (optional)
- query `status` (optional; DRAFT | IN_REVIEW | PUBLISHED | REJECTED | ARCHIVED)
- query `bankId` (optional)
- query `sourceId` (optional)
- query `chapterId` (optional)
- query `lessonId` (optional)
- query `sectionId` (optional)
- query `courseId` (optional)
- query `subjectId` (optional)
- query `academicGradeId` (optional)

**Success response — HTTP 200**

```json
{
  "data": [
    "Question records with placements, options, assets, and videoLink"
  ],
  "meta": {
    "page": "number",
    "limit": "number",
    "total": "number",
    "totalPages": "number"
  }
}
```

### `GET /api/v1/admin/questions/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 200**

```json
{
  "id": "string",
  "bankId": "string",
  "sourceId": "string",
  "courseId": "string",
  "type": "SINGLE_CHOICE | MULTIPLE_CHOICE",
  "body": "string",
  "explanation?": "string | null",
  "status": "DRAFT | IN_REVIEW | PUBLISHED | REJECTED | ARCHIVED",
  "placements": [
    "QuestionPlacement"
  ],
  "options": [
    "QuestionOption"
  ],
  "assets": [
    "QuestionAsset"
  ],
  "videoLink": "QuestionVideoLink | null"
}
```

### `PATCH /api/v1/admin/questions/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

```json
{
  "bankId?": "string",
  "sourceId?": "string",
  "courseId?": "string",
  "type?": "SINGLE_CHOICE | MULTIPLE_CHOICE",
  "placements?": "[[object Object]]",
  "body?": "string",
  "explanation?": "string | null"
}
```

**Success response — HTTP 200**

```json
{
  "id": "string",
  "bankId": "string",
  "sourceId": "string",
  "courseId": "string",
  "type": "SINGLE_CHOICE | MULTIPLE_CHOICE",
  "body": "string",
  "explanation?": "string | null",
  "status": "DRAFT | IN_REVIEW | PUBLISHED | REJECTED | ARCHIVED",
  "placements": [
    "QuestionPlacement"
  ],
  "options": [
    "QuestionOption"
  ],
  "assets": [
    "QuestionAsset"
  ],
  "videoLink": "QuestionVideoLink | null"
}
```

### `DELETE /api/v1/admin/questions/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 200**

```json
{
  "id": "string",
  "deleted": true
}
```

### `POST /api/v1/admin/questions/{id}/submit`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 201**

```json
{
  "id": "string",
  "bankId": "string",
  "sourceId": "string",
  "courseId": "string",
  "type": "SINGLE_CHOICE | MULTIPLE_CHOICE",
  "body": "string",
  "explanation?": "string | null",
  "status": "DRAFT | IN_REVIEW | PUBLISHED | REJECTED | ARCHIVED",
  "placements": [
    "QuestionPlacement"
  ],
  "options": [
    "QuestionOption"
  ],
  "assets": [
    "QuestionAsset"
  ],
  "videoLink": "QuestionVideoLink | null"
}
```

### `POST /api/v1/admin/questions/{id}/publish`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 201**

```json
{
  "id": "string",
  "bankId": "string",
  "sourceId": "string",
  "courseId": "string",
  "type": "SINGLE_CHOICE | MULTIPLE_CHOICE",
  "body": "string",
  "explanation?": "string | null",
  "status": "DRAFT | IN_REVIEW | PUBLISHED | REJECTED | ARCHIVED",
  "placements": [
    "QuestionPlacement"
  ],
  "options": [
    "QuestionOption"
  ],
  "assets": [
    "QuestionAsset"
  ],
  "videoLink": "QuestionVideoLink | null"
}
```

### `POST /api/v1/admin/questions/{id}/reject`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

```json
{
  "reviewNote": "string"
}
```

**Success response — HTTP 201**

```json
{
  "id": "string",
  "bankId": "string",
  "sourceId": "string",
  "courseId": "string",
  "type": "SINGLE_CHOICE | MULTIPLE_CHOICE",
  "body": "string",
  "explanation?": "string | null",
  "status": "DRAFT | IN_REVIEW | PUBLISHED | REJECTED | ARCHIVED",
  "placements": [
    "QuestionPlacement"
  ],
  "options": [
    "QuestionOption"
  ],
  "assets": [
    "QuestionAsset"
  ],
  "videoLink": "QuestionVideoLink | null"
}
```

### `POST /api/v1/admin/questions/{id}/archive`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 201**

```json
{
  "id": "string",
  "bankId": "string",
  "sourceId": "string",
  "courseId": "string",
  "type": "SINGLE_CHOICE | MULTIPLE_CHOICE",
  "body": "string",
  "explanation?": "string | null",
  "status": "DRAFT | IN_REVIEW | PUBLISHED | REJECTED | ARCHIVED",
  "placements": [
    "QuestionPlacement"
  ],
  "options": [
    "QuestionOption"
  ],
  "assets": [
    "QuestionAsset"
  ],
  "videoLink": "QuestionVideoLink | null"
}
```

### `POST /api/v1/admin/questions/{id}/options`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

```json
{
  "body": "string",
  "isCorrect?": "boolean"
}
```

**Success response — HTTP 201**

```json
{
  "id": "string",
  "bankId": "string",
  "sourceId": "string",
  "courseId": "string",
  "type": "SINGLE_CHOICE | MULTIPLE_CHOICE",
  "body": "string",
  "explanation?": "string | null",
  "status": "DRAFT | IN_REVIEW | PUBLISHED | REJECTED | ARCHIVED",
  "placements": [
    "QuestionPlacement"
  ],
  "options": [
    "QuestionOption"
  ],
  "assets": [
    "QuestionAsset"
  ],
  "videoLink": "QuestionVideoLink | null"
}
```

### `PATCH /api/v1/admin/questions/{id}/options/{optionId}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)
- path `optionId` (required)

```json
{
  "body?": "string",
  "isCorrect?": "boolean"
}
```

**Success response — HTTP 200**

```json
{
  "id": "string",
  "bankId": "string",
  "sourceId": "string",
  "courseId": "string",
  "type": "SINGLE_CHOICE | MULTIPLE_CHOICE",
  "body": "string",
  "explanation?": "string | null",
  "status": "DRAFT | IN_REVIEW | PUBLISHED | REJECTED | ARCHIVED",
  "placements": [
    "QuestionPlacement"
  ],
  "options": [
    "QuestionOption"
  ],
  "assets": [
    "QuestionAsset"
  ],
  "videoLink": "QuestionVideoLink | null"
}
```

### `DELETE /api/v1/admin/questions/{id}/options/{optionId}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)
- path `optionId` (required)

**Success response — HTTP 200**

```json
{
  "id": "string",
  "bankId": "string",
  "sourceId": "string",
  "courseId": "string",
  "type": "SINGLE_CHOICE | MULTIPLE_CHOICE",
  "body": "string",
  "explanation?": "string | null",
  "status": "DRAFT | IN_REVIEW | PUBLISHED | REJECTED | ARCHIVED",
  "placements": [
    "QuestionPlacement"
  ],
  "options": [
    "QuestionOption"
  ],
  "assets": [
    "QuestionAsset"
  ],
  "videoLink": "QuestionVideoLink | null"
}
```

### `POST /api/v1/admin/questions/{id}/options/reorder`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

```json
{
  "optionIds": "[string]"
}
```

**Success response — HTTP 201**

```json
{
  "id": "string",
  "bankId": "string",
  "sourceId": "string",
  "courseId": "string",
  "type": "SINGLE_CHOICE | MULTIPLE_CHOICE",
  "body": "string",
  "explanation?": "string | null",
  "status": "DRAFT | IN_REVIEW | PUBLISHED | REJECTED | ARCHIVED",
  "placements": [
    "QuestionPlacement"
  ],
  "options": [
    "QuestionOption"
  ],
  "assets": [
    "QuestionAsset"
  ],
  "videoLink": "QuestionVideoLink | null"
}
```

### `POST /api/v1/admin/questions/{id}/assets`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

```json
{
  "assetId": "string"
}
```

**Success response — HTTP 201**

```json
{
  "id": "string",
  "bankId": "string",
  "sourceId": "string",
  "courseId": "string",
  "type": "SINGLE_CHOICE | MULTIPLE_CHOICE",
  "body": "string",
  "explanation?": "string | null",
  "status": "DRAFT | IN_REVIEW | PUBLISHED | REJECTED | ARCHIVED",
  "placements": [
    "QuestionPlacement"
  ],
  "options": [
    "QuestionOption"
  ],
  "assets": [
    "QuestionAsset"
  ],
  "videoLink": "QuestionVideoLink | null"
}
```

### `DELETE /api/v1/admin/questions/{id}/assets/{assetId}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)
- path `assetId` (required)

**Success response — HTTP 200**

```json
{
  "id": "string",
  "bankId": "string",
  "sourceId": "string",
  "courseId": "string",
  "type": "SINGLE_CHOICE | MULTIPLE_CHOICE",
  "body": "string",
  "explanation?": "string | null",
  "status": "DRAFT | IN_REVIEW | PUBLISHED | REJECTED | ARCHIVED",
  "placements": [
    "QuestionPlacement"
  ],
  "options": [
    "QuestionOption"
  ],
  "assets": [
    "QuestionAsset"
  ],
  "videoLink": "QuestionVideoLink | null"
}
```

### `POST /api/v1/admin/questions/{id}/assets/reorder`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

```json
{
  "assetIds": "[string]"
}
```

**Success response — HTTP 201**

```json
{
  "id": "string",
  "bankId": "string",
  "sourceId": "string",
  "courseId": "string",
  "type": "SINGLE_CHOICE | MULTIPLE_CHOICE",
  "body": "string",
  "explanation?": "string | null",
  "status": "DRAFT | IN_REVIEW | PUBLISHED | REJECTED | ARCHIVED",
  "placements": [
    "QuestionPlacement"
  ],
  "options": [
    "QuestionOption"
  ],
  "assets": [
    "QuestionAsset"
  ],
  "videoLink": "QuestionVideoLink | null"
}
```

### `POST /api/v1/admin/questions/{id}/video-link`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

```json
{
  "videoAssetId": "string",
  "timestampSeconds": "number"
}
```

**Success response — HTTP 201**

```json
{
  "id": "string",
  "bankId": "string",
  "sourceId": "string",
  "courseId": "string",
  "type": "SINGLE_CHOICE | MULTIPLE_CHOICE",
  "body": "string",
  "explanation?": "string | null",
  "status": "DRAFT | IN_REVIEW | PUBLISHED | REJECTED | ARCHIVED",
  "placements": [
    "QuestionPlacement"
  ],
  "options": [
    "QuestionOption"
  ],
  "assets": [
    "QuestionAsset"
  ],
  "videoLink": "QuestionVideoLink | null"
}
```

### `DELETE /api/v1/admin/questions/{id}/video-link`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 200**

```json
{
  "id": "string",
  "bankId": "string",
  "sourceId": "string",
  "courseId": "string",
  "type": "SINGLE_CHOICE | MULTIPLE_CHOICE",
  "body": "string",
  "explanation?": "string | null",
  "status": "DRAFT | IN_REVIEW | PUBLISHED | REJECTED | ARCHIVED",
  "placements": [
    "QuestionPlacement"
  ],
  "options": [
    "QuestionOption"
  ],
  "assets": [
    "QuestionAsset"
  ],
  "videoLink": "QuestionVideoLink | null"
}
```

## Geography

### `GET /api/v1/geography/governorates`

**Authorization:** Public

**Request**

No path, query, or header input.

**Success response — HTTP 200**

Returns the governorates and centers available for student registration, using
the localized `name` shape (`{ "ar": "string", "en": "string | null" }`).

### `GET /api/v1/admin/geography/governorates`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

No path, query, or header input.

**Success response — HTTP 200**

```json
[
  "{id, name, centers:[{id, name, governorateId}]}"
]
```

### `POST /api/v1/admin/geography/governorates`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

No path, query, or header input.

```json
{
  "name": "string"
}
```

**Success response — HTTP 201**

```json
[
  "{id, name, centers:[{id, name, governorateId}]}"
]
```

### `POST /api/v1/admin/geography/governorates/{governorateId}/centers`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `governorateId` (required)

```json
{
  "name": "string"
}
```

**Success response — HTTP 201**

```json
{
  "id": "string",
  "name": "string",
  "governorateId": "string"
}
```

### `DELETE /api/v1/admin/geography/centers/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 200**

```json
{
  "id": "string",
  "deleted": true
}
```

### `DELETE /api/v1/admin/geography/governorates/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 200**

```json
{
  "id": "string",
  "deleted": true
}
```
