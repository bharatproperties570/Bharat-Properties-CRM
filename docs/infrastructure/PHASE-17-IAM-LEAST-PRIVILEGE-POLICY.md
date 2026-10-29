# Phase 17 — AWS Infrastructure Hardening: Least-Privilege IAM Role & KMS Policy Specification

## 1. Executive Summary & Verified Baseline

This specification defines the least-privilege AWS Identity and Access Management (IAM) role, instance profile, and Key Management Service (KMS) encryption standard for Bharat Properties CRM.

### Verified Target Environment
- **AWS Account ID**: `397633117324`
- **Primary AWS Region**: `eu-north-1` (Stockholm)
- **EC2 Production Host**: `i-01a6c602f0547c9ee` (`13.48.10.13`)
- **Instance Profile Status**: Verified via IMDSv2 (`169.254.169.254/latest/meta-data/iam/info` -> `404 Not Found`). **No IAM role is currently attached.**
- **Credential Objective**: Transition application workloads (Phase 11 S3 Document Storage and Phase 17 Offsite Encrypted Backups) to temporary IAM instance credentials, eliminating long-lived static AWS access keys.

---

## 2. Proposed IAM Architecture

```
+-------------------------------------------------------------+
|                     AWS Account 397633117324                |
|                                                             |
|   +-----------------------------------------------------+   |
|   | EC2 Instance i-01a6c602f0547c9ee (eu-north-1b)       |   |
|   |  - Instance Profile: BharatPropertiesCRMProfile     |   |
|   |  - Role: BharatPropertiesCRMInstanceRole            |   |
|   +--------------------------+--------------------------+   |
|                              | (Temporary STS Tokens)       |
|                              v                              |
|   +-----------------------------------------------------+   |
|   | Permissions Policy: BharatPropertiesCRMAppPolicy    |   |
|   |  1. S3 Documents Bucket (SSE-KMS enforced)          |   |
|   |  2. S3 Encrypted Backups Bucket                     |   |
|   |  3. KMS Customer-Managed Key (CMK)                  |   |
|   |  4. Explicit Deny on non-TLS & unencrypted objects  |   |
|   +-----------------------------------------------------+   |
+-------------------------------------------------------------+
```

---

## 3. Trust Relationship (AssumeRolePolicyDocument)

Save as `trust-policy.json`:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "ec2.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
```

---

## 4. Least-Privilege Application Policy (`BharatPropertiesCRMAppPolicy`)

Save as `app-policy.json`:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowDocumentBucketAccess",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:AbortMultipartUpload",
        "s3:ListBucketMultipartUploads"
      ],
      "Resource": [
        "arn:aws:s3:::bharat-crm-documents-eu-north-1/*"
      ]
    },
    {
      "Sid": "AllowDocumentBucketListing",
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket",
        "s3:GetBucketLocation"
      ],
      "Resource": "arn:aws:s3:::bharat-crm-documents-eu-north-1"
    },
    {
      "Sid": "AllowBackupBucketArchiveUpload",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::bharat-crm-backups-eu-north-1",
        "arn:aws:s3:::bharat-crm-backups-eu-north-1/*"
      ]
    },
    {
      "Sid": "AllowKmsKeyUsageForS3",
      "Effect": "Allow",
      "Action": [
        "kms:Encrypt",
        "kms:Decrypt",
        "kms:ReEncrypt*",
        "kms:GenerateDataKey*",
        "kms:DescribeKey"
      ],
      "Resource": "arn:aws:kms:eu-north-1:397633117324:key/*",
      "Condition": {
        "StringEquals": {
          "kms:ViaService": "s3.eu-north-1.amazonaws.com"
        }
      }
    },
    {
      "Sid": "EnforceTlsOnly",
      "Effect": "Deny",
      "Action": "s3:*",
      "Resource": [
        "arn:aws:s3:::bharat-crm-documents-eu-north-1/*",
        "arn:aws:s3:::bharat-crm-documents-eu-north-1",
        "arn:aws:s3:::bharat-crm-backups-eu-north-1/*",
        "arn:aws:s3:::bharat-crm-backups-eu-north-1"
      ],
      "Condition": {
        "Bool": {
          "aws:SecureTransport": "false"
        }
      }
    },
    {
      "Sid": "EnforceServerSideEncryption",
      "Effect": "Deny",
      "Action": "s3:PutObject",
      "Resource": [
        "arn:aws:s3:::bharat-crm-documents-eu-north-1/*",
        "arn:aws:s3:::bharat-crm-backups-eu-north-1/*"
      ],
      "Condition": {
        "Null": {
          "s3:x-amz-server-side-encryption": "true"
        }
      }
    }
  ]
}
```

---

## 5. KMS Customer Managed Key (CMK) Annual Rotation Procedure

Enterprise security requires customer managed keys used for backup and document encryption to have automated annual rotation enabled.

### Verification Command
```bash
aws kms get-key-rotation-status \
    --region eu-north-1 \
    --key-id <KMS_KEY_ID_OR_ALIAS>
```
Expected output:
```json
{
  "KeyRotationEnabled": true
}
```

### Activation Command (If Not Enabled)
```bash
aws kms enable-key-rotation \
    --region eu-north-1 \
    --key-id <KMS_KEY_ID_OR_ALIAS>
```

---

## 6. Step-by-Step Operator Runbook: Attaching Instance Profile to EC2

When an AWS administrator is ready to provision this access:

### Step 1: Create IAM Role
```bash
aws iam create-role \
    --role-name BharatPropertiesCRMInstanceRole \
    --assume-role-policy-document file://trust-policy.json \
    --description "Instance role for Bharat Properties CRM EC2 instance"
```

### Step 2: Attach Application Policy
```bash
aws iam put-role-policy \
    --role-name BharatPropertiesCRMInstanceRole \
    --policy-name BharatPropertiesCRMAppPolicy \
    --policy-document file://app-policy.json
```

### Step 3: Create Instance Profile & Add Role
```bash
aws iam create-instance-profile \
    --instance-profile-name BharatPropertiesCRMInstanceProfile

aws iam add-role-to-instance-profile \
    --instance-profile-name BharatPropertiesCRMInstanceProfile \
    --role-name BharatPropertiesCRMInstanceRole
```

### Step 4: Associate Profile with EC2 Instance
```bash
aws ec2 associate-iam-instance-profile \
    --region eu-north-1 \
    --instance-id i-01a6c602f0547c9ee \
    --iam-instance-profile Name=BharatPropertiesCRMInstanceProfile
```

### Step 5: Verify on EC2 via IMDSv2
```bash
TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 60")
curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/iam/info
```
Upon success, the response will contain `InstanceProfileArn` with `BharatPropertiesCRMInstanceProfile`.
