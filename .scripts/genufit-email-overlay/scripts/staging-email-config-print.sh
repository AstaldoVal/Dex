#!/usr/bin/env bash
# Print required Cloud Run env for staging waitlist email fix.
# Run from Mac with gcloud auth after Applicator overlay is merged.

set -euo pipefail

SERVICE="${APPLICATOR_STAGING_SERVICE:-applicator-api-staging}"
REGION="${APPLICATOR_STAGING_REGION:-us-central1}"

cat <<EOF
Staging probe shows wrong config. After deploying Applicator with genufit_waitlist_*.py overlay:

  resend_from_name       -> GenuFit
  unsubscribe_base_url   -> https://genufit.app/unsubscribe/  (NOT run.app API)

Example gcloud (adjust project + secret names to match Applicator):

  gcloud run services update "$SERVICE" \\
    --region="$REGION" \\
    --update-env-vars="RESEND_FROM_NAME=GenuFit,WAITLIST_UNSUBSCRIBE_PAGE_URL=https://genufit.app/unsubscribe/"

Then redeploy Pages so /unsubscribe/ exists on genufit.app:

  npm run genufit:waitlist-pages-deploy

Verify:

  curl -sS https://applicator-api-staging-....run.app/api/v1/waitlist/email/config | jq .
  # unsubscribe_base_url must be https://genufit.app/unsubscribe/
  # resend_from_name must be GenuFit

  curl -sSI 'https://applicator-api-staging-....run.app/api/v1/waitlist/unsubscribe?token=test' | grep -i location
  # must redirect to https://genufit.app/unsubscribe/ — not return plain text
EOF
