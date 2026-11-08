# Agspace naming decision and compatibility

The user selected Agspace and explicitly requested the rename. Public source/API names are now agspace.ts, agspace_test.ts, agspace.md, AgspaceApp and AgspaceLogEvent. Documentation uses AGSPACE_SOURCE_URL and AGSPACE_TEST_HOST. SPACEIX_TEST_HOST remains a fallback for existing test invocations.

Existing remote spaces are discovered in their original Spaceix metadata root and keep their resource names, ownership labels, tmux session and archive location. No runtime recreation or data migration is performed for the rename. Newly provisioned spaces use Agspace metadata/resource names. Duplicate logical names across the old/new roots are rejected as ambiguous.

The read-only facade test on namekis.com passed under the new names: 1 passed, 0 failed, 1 ignored in about four seconds. It reused container 3d24e16b8f7c and volume spaceix-d3d0fb36-ec3c-49ca-ab3b-789a711f9569-home, matching the earlier environment observations. Evidence is appended to remote1.md. Source type-checking passed.

The rename does not add or install an interactive CLI. Cold provisioning with the new prefix, explicit archival and multi-client operation remain separate verification scopes.
