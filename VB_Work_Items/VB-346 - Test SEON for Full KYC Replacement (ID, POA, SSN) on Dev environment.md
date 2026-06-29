# VB-346: Test SEON for Full KYC Replacement (ID, POA, SSN) on Dev environment

## Properties
- State: On HOLD
- Priority: high
- Identifier: VB-346
- Assignees: user://2e1d872b-594c-816d-ba9c-00022ce0a130
- Updated on: 2026-06-10T13:19:34.624Z
- Notion URL: https://app.notion.com/p/35d509790d9a800582c7f80ea2baea4c

## Description
**Description:**
Replace the current Veriff iframe flow with SEON in the DEV environment to validate full user-facing KYC behavior.
In this setup, users who enter the KYC flow on DEV will go through the **SEON verification iframe instead of Veriff**, covering:
• ID verification
• Proof of Address (POA)
• Social Security Number (SSN) verification (where applicable)
The purpose is to validate that SEON behaves as full replacement of Veriff 
  • The KYC screen should open SEON iframe instead of Veriff
  • The user experience remains consistent as it's now
  • Backend receives and processes SEON results correctly
  • No additional changes are required in the frontend logic besides provider switch

This is a functional replacement test on DEV to confirm SEON can replicate Veriff behavior in the full KYC journey before production rollout.

**Context:**
[https://docs.seon.io/knowledge-base/idv/document-verification#overview](https://docs.seon.io/knowledge-base/idv/document-verification#overview)

**Analytic Events:**
N/A

**Acceptance Criteria
  • I**n DEV environment, KYC flow uses SEON iframe instead of Veriff iframe
  • Users entering KYC are redirected to SEON verification flow for:
      ◦ ID
      ◦ POA
      ◦ SSN (if applicable)
  • UI behavior remains consistent with existing Veriff flow:
  • No changes required in user-facing KYC steps beyond provider swap
  • SEON responses are correctly received and stored in backend
  • Existing Veriff integration remains untouched and disabled only in DEV
  • Flow completes successfully end-to-end for test users in DEV environment**
**

**Additional Information:**
  • 

**ICE Score:** 72

## Page Content
### Verified in Dev (#1)
#### Results
- ℹ️ To verify the ticket, Tomasz created a minimal UI page to cover the KYC verification flow. To access it, use [https://dev.vegasbonanza.com/seon-test](https://dev.vegasbonanza.com/seon-test).
- ℹ️ Since this is currently mostly a mock implementation without the corresponding UI, it's not possible to perform end-to-end testing.
- ℹ️ Instead, we checked the main flow and integration with SEON.
- 🟢 The user can start POI and POA verifications.
- 🟢 Once the flow starts, the user is redirected to a hosted page to complete the verification request on the SEON side.
- 🟢 Once POI is successfully verified, the corresponding updates are reflected and visible in Payload (e.g., the user profile "Kyc Id Verified" is checked (True), and personal data such as name, surname, and DOB are populated from the KYC flow).
- ℹ️ I wasn't able to fully test the POA flow because my documents are in Armenian, which may be why my POA verification was rejected.
- 🟢 🟠 However, Olga was able to provide the required document in English, and the status is In Review. In the Payload KYC verification logs, we can see all the extracted data from the POA verification request, which means it was delivered to our side but wasn't stored on the user profile page because the verification is In Review and not yet approved.
#### Attachments
![](https://prod-files-secure.s3.us-west-2.amazonaws.com/c3f50979-0d9a-8148-b189-0003ff3b26d1/b8ac2b30-e13c-4a56-83a2-dfafc3053412/Screenshot_2026-06-10_at_14.44.17.png)
![](https://prod-files-secure.s3.us-west-2.amazonaws.com/c3f50979-0d9a-8148-b189-0003ff3b26d1/507f63c6-c77f-4457-8533-920bc35895b2/Screenshot_2026-06-10_at_14.44.53.png)
![](https://prod-files-secure.s3.us-west-2.amazonaws.com/c3f50979-0d9a-8148-b189-0003ff3b26d1/340d335b-54d8-47c4-9438-2c4733a9dfef/Screenshot_2026-06-10_at_14.45.10.png)
![](https://prod-files-secure.s3.us-west-2.amazonaws.com/c3f50979-0d9a-8148-b189-0003ff3b26d1/f742f2c4-e374-4464-b668-419283c35100/Screenshot_2026-06-10_at_14.45.53.png)
![](https://prod-files-secure.s3.us-west-2.amazonaws.com/c3f50979-0d9a-8148-b189-0003ff3b26d1/92d98514-5971-4d8d-b9b4-9688f2ed843e/Screenshot_2026-06-10_at_14.46.00.png)
![](https://prod-files-secure.s3.us-west-2.amazonaws.com/c3f50979-0d9a-8148-b189-0003ff3b26d1/c243c3bd-a3b4-47a8-8285-a69c0dec7a92/Screenshot_2026-06-10_at_14.46.21.png)
![](https://prod-files-secure.s3.us-west-2.amazonaws.com/c3f50979-0d9a-8148-b189-0003ff3b26d1/e812d6f7-8c45-46f9-b915-c31ae7901bb7/Screenshot_2026-06-10_at_14.47.49.png)
![](https://prod-files-secure.s3.us-west-2.amazonaws.com/c3f50979-0d9a-8148-b189-0003ff3b26d1/7c3f652f-e4cc-409e-b6f6-5ce53740020c/Screenshot_2026-06-10_at_14.48.48.png)
![](https://prod-files-secure.s3.us-west-2.amazonaws.com/c3f50979-0d9a-8148-b189-0003ff3b26d1/7d2bc45f-b383-4338-94ce-181311178d2c/Screenshot_2026-06-10_at_15.12.30.png)
![](https://prod-files-secure.s3.us-west-2.amazonaws.com/c3f50979-0d9a-8148-b189-0003ff3b26d1/76fb22be-8201-4409-a3ef-a1eb63e6e92a/Screenshot_2026-06-10_at_15.26.27.png)
![](https://prod-files-secure.s3.us-west-2.amazonaws.com/c3f50979-0d9a-8148-b189-0003ff3b26d1/931b5e9d-f4c9-468b-b7e1-654419158c10/Screenshot_2026-06-10_at_15.26.41.png)
![](https://prod-files-secure.s3.us-west-2.amazonaws.com/c3f50979-0d9a-8148-b189-0003ff3b26d1/7454e420-7561-4da8-ac42-a5bc416130bf/Screenshot_2026-06-10_at_17.11.27.png)
